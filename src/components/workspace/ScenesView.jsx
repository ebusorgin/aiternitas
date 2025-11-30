import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import CreateSceneModal from './CreateSceneModal';
import DeleteSceneModal from './DeleteSceneModal';
import SceneProperties from './SceneProperties';
import PropertiesPanel from './PropertiesPanel';
import ScenesCanvas3D from './ScenesCanvas3D';
import ElementTypeModal from './ElementTypeModal';
import CreateWorkerModal from './CreateWorkerModal';
import CreateBlockModal from './CreateBlockModal';
import { ENTITY_TYPES } from './EntityShape';
import {
  getElementType,
  getElementSize,
  getElementBounds,
  getConnectionPoints,
  getElementPosition,
  getRectangleEdgeIntersection,
  isPointOnConnection,
  connectionExists,
  validateConnectionBeforeCreate
} from '../../utils/connectionUtils';
import './ScenesView.css';

function ScenesView({ onSceneSelect }) {
  const [isElementTypeModalOpen, setIsElementTypeModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [deleteModalScene, setDeleteModalScene] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Состояние для 2D-канваса
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingSceneId, setDraggingSceneId] = useState(null);
  const [hoveredSceneId, setHoveredSceneId] = useState(null);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  // Состояния для работы с элементами
  const [hoveredElementId, setHoveredElementId] = useState(null);
  // Используем selectedElementId из store, чтобы PropertiesPanel мог работать
  const selectedElementId = useSceneStore((state) => state.selectedElementId);
  const [draggingElementId, setDraggingElementId] = useState(null);
  const [localPositions2D, setLocalPositions2D] = useState({});
  const [animationTime, setAnimationTime] = useState(0);
  const viewMode = useSceneStore((state) => state.viewMode);
  const setViewMode = useSceneStore((state) => state.setViewMode);
  const [localPositions, setLocalPositions] = useState({});
  const [localSizes, setLocalSizes] = useState({}); // Сохраняем размеры во время перетаскивания
  const dragStartScenePosRef = useRef(null);
  const dragStartMousePosRef = useRef(null);
  const clickStartRef = useRef(null); // Для отслеживания начала клика
  const wasDraggingRef = useRef(false); // Для отслеживания, было ли перетаскивание
  // Состояние для создания связи через иконку
  const [draggingConnection, setDraggingConnection] = useState(null); // { type: 'scene'|'element', id: string, startPos: {x, y} }
  const [connectionMousePos, setConnectionMousePos] = useState(null); // {x, y} - текущая позиция мыши
  
  const socket = useSceneStore((state) => state.socket);
  const socketConnected = useSceneStore((state) => state.socketConnected);
  const currentSceneId = useSceneStore((state) => state.currentSceneId);
  const loadScene = useSceneStore((state) => state.loadScene);
  const allScenes = useSceneStore((state) => state.allScenes);
  const sceneConnections = useSceneStore((state) => state.sceneConnections);
  const loadAllScenes = useSceneStore((state) => state.loadAllScenes);
  const updateScenePosition = useSceneStore((state) => state.updateScenePosition);
  const setSceneParent = useSceneStore((state) => state.setSceneParent);
  const updateSceneSize = useSceneStore((state) => state.updateSceneSize);
  const createElement = useSceneStore((state) => state.createElement);
  // Добавляем elements и connections для отображения
  const elements = useSceneStore((state) => state.elements);
  const connections = useSceneStore((state) => state.connections);
  const getElementPosition2D = useSceneStore((state) => state.getElementPosition2D);
  const updateElementPosition2D = useSceneStore((state) => state.updateElementPosition2D);
  const updateElement = useSceneStore((state) => state.updateElement);
  const selectElement = useSceneStore((state) => state.selectElement);
  const setElementScene = useSceneStore((state) => state.setElementScene);
  const createConnection = useSceneStore((state) => state.createConnection);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const deletingConnectionId = useSceneStore((state) => state.deletingConnectionId);
  const [hoveredConnectionId, setHoveredConnectionId] = useState(null);

  // Загружаем все сцены с позициями при монтировании
  useEffect(() => {
    if (!socket || !socketConnected) {
      return;
    }
    
    setLoading(true);
    loadAllScenes();
    
    // Слушаем обновления списка сцен
    const handleSceneCreated = () => {
      loadAllScenes();
    };
    
    const handleSceneDeleted = () => {
      loadAllScenes();
    };
    
    const handleSceneUpdated = () => {
      loadAllScenes();
    };
    
    const handleSceneNameUpdated = ({ sceneId, name, description }) => {
      // Обновляем локально выбранную сцену, если она была изменена
      if (selectedSceneId === sceneId) {
        // Обновление произойдет через loadAllScenes
      }
      loadAllScenes();
    };
    
    const handleConnectionDeleted = ({ id }) => {
      // При удалении связи обновляем локально список связей для немедленной перерисовки
      console.log('🗑️ Связь удалена, обновляем визуализацию:', id);
      // Перезагружаем список сцен с связями для обновления визуализации
      loadAllScenes();
    };
    
    const handleParentUpdated = ({ sceneId, parentId }) => {
      // Если parent_id стал null (извлечение), не перезагружаем все сцены сразу
      // Позиция уже была установлена, и придет событие scene:position-updated
      // Перезагружаем только если нужно обновить список (при вложении)
      if (parentId !== null) {
        handleSceneUpdated();
      } else {
        // При извлечении просто обновляем локально, не перезагружая все сцены
        // Это предотвращает перезапись позиции, которая уже была установлена
      }
    };
    
    // Обработчик ошибок - игнорируем ошибку "Связь уже существует" при создании связи
    const handleError = ({ message }) => {
      // Игнорируем ошибку о существующей связи - это нормальная ситуация
      if (message === 'Связь уже существует') {
        console.log('Связь уже существует, игнорируем ошибку');
        return;
      }
      // Для других ошибок выводим в консоль
      console.error('Ошибка Socket.IO:', message);
    };
    
    socket.on('scene:created', handleSceneCreated);
    socket.on('scene:deleted', handleSceneDeleted);
    socket.on('scene:updated-position', handleSceneUpdated);
    socket.on('scene:updated', handleSceneNameUpdated);
    socket.on('scene:parent-updated', handleParentUpdated);
    socket.on('error', handleError);
    
    return () => {
      socket.off('scene:created', handleSceneCreated);
      socket.off('scene:deleted', handleSceneDeleted);
      socket.off('scene:updated-position', handleSceneUpdated);
      socket.off('scene:updated', handleSceneNameUpdated);
      socket.off('scene:parent-updated', handleParentUpdated);
      socket.off('error', handleError);
    };
  }, [socket, socketConnected, loadAllScenes]);

  useEffect(() => {
    // Если сцены загружены (даже если их 0), убираем индикатор загрузки
    if (socket && socketConnected) {
      // Даем небольшую задержку для загрузки данных
      const timer = setTimeout(() => {
        setLoading(false);
        
        // Центрируем камеру на сценах и сущностях после загрузки
        if (allScenes.length > 0 || (elements && elements.length > 0)) {
          // Вычисляем центр всех сцен и сущностей
          let minX = Infinity, maxX = -Infinity;
          let minZ = Infinity, maxZ = -Infinity;
          
          // Добавляем позиции сцен
          allScenes.forEach(scene => {
            if (!scene.parent_id) { // Только корневые сцены
              const [x, z] = getSceneAbsolutePosition(scene);
              const [width, height] = getSceneSize(scene);
              minX = Math.min(minX, x - width / 2);
              maxX = Math.max(maxX, x + width / 2);
              minZ = Math.min(minZ, z - height / 2);
              maxZ = Math.max(maxZ, z + height / 2);
            }
          });
          
          // Добавляем позиции сущностей
          if (elements && elements.length > 0) {
            elements.forEach(element => {
              const position2D = getElementPosition2D(element);
              minX = Math.min(minX, position2D[0] - 60);
              maxX = Math.max(maxX, position2D[0] + 60);
              minZ = Math.min(minZ, position2D[1] - 40);
              maxZ = Math.max(maxZ, position2D[1] + 40);
            });
          }
          
          // Если есть что центрировать
          if (minX !== Infinity && maxX !== -Infinity) {
            const centerX = (minX + maxX) / 2;
            const centerZ = (minZ + maxZ) / 2;
            
            // Устанавливаем pan так, чтобы центр был в центре экрана
            setPan({ x: -centerX, y: -centerZ });
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, socketConnected, allScenes.length, elements?.length]);

  // Получаем корневые сцены (без родителя)
  const rootScenes = useMemo(() => {
    if (!allScenes || !Array.isArray(allScenes)) return [];
    return allScenes.filter(s => !s.parent_id);
  }, [allScenes]);

  // Получение размера сцены (для родительских - из БД, для дочерних - относительный)
  const getSceneSize = useCallback((scene) => {
    // Если сцена перетаскивается и является дочерней, сохраняем маленький размер
    if (scene.parent_id && draggingSceneId === scene.id && localSizes[scene.id]) {
      return localSizes[scene.id];
    }
    
    if (scene.parent_id) {
      // Дочерние сцены: размер = 1/5 от родительской
      const parent = allScenes.find(s => s.id === scene.parent_id);
      if (parent) {
        const parentSize = parent.size_2d || [200, 150];
        return [parentSize[0] / 5, parentSize[1] / 5];
      }
    }
    // Родительские сцены: размер из БД или по умолчанию
    return scene.size_2d || [200, 150];
  }, [allScenes, draggingSceneId, localSizes]);

  // Получение абсолютной позиции сцены с учетом родителя
  const getSceneAbsolutePosition = useCallback((scene) => {
    // Если сцена перетаскивается, используем позицию из localPositions напрямую
    // Это абсолютная позиция, которая обновляется при каждом движении мыши
    if (localPositions[scene.id]) {
      return localPositions[scene.id];
    }
    
    const pos = scene.position_2d || [0, 0];
    
    // Для дочерних сцен вычисляем абсолютную позицию через родителя
    if (scene.parent_id) {
      const parent = allScenes.find(s => s.id === scene.parent_id);
      if (parent) {
        // Рекурсивно получаем абсолютную позицию родителя
        const parentPos = getSceneAbsolutePosition(parent);
        return [parentPos[0] + pos[0], parentPos[1] + pos[1]];
      }
    }
    
    // Для корневых сцен позиция уже абсолютная
    return pos;
  }, [allScenes, localPositions]);

  // Расчет размещения дочерних сцен в сетке внутри родительской
  const calculateChildrenLayout = useCallback((parentScene, children) => {
    if (children.length === 0) return [];
    
    const parentSize = getSceneSize(parentScene);
    const [parentWidth, parentHeight] = parentSize;
    
    // Размер дочерней сцены = 1/5 от родительской
    const childWidth = parentWidth / 5;
    const childHeight = parentHeight / 5;
    
    // Вычисляем сетку для размещения
    const count = children.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    
    // Вычисляем область для размещения (80% от размера родителя)
    const areaWidth = parentWidth * 0.8;
    const areaHeight = parentHeight * 0.8;
    
    // Вычисляем шаг между дочерними сценами
    const spacingX = (areaWidth - cols * childWidth) / (cols + 1);
    const spacingY = (areaHeight - rows * childHeight) / (rows + 1);
    
    // Вычисляем стартовую позицию (чуть ниже центра области)
    const startX = -areaWidth / 2 + spacingX + childWidth / 2;
    const startY = -areaHeight / 2 + spacingY + childHeight / 2 + areaHeight * 0.1; // Смещаем вниз на 10% от высоты области
    
    // Возвращаем позиции и размеры для каждой дочерней сцены
    return children.map((child, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        sceneId: child.id,
        position: [
          startX + col * (childWidth + spacingX),
          startY + row * (childHeight + spacingY)
        ],
        size: [childWidth, childHeight]
      };
    });
  }, [getSceneSize]);
  
  // Получение абсолютной позиции сцены с учетом layout (для отрисовки связей)
  // Должна быть объявлена ПОСЛЕ calculateChildrenLayout, чтобы избежать циклической зависимости
  // Использует рекурсивный вызов для правильной обработки многоуровневого вложения
  const getSceneAbsolutePositionWithLayout = useCallback((scene, visited = new Set()) => {
    // Защита от циклических зависимостей
    if (visited.has(scene.id)) {
      // Если уже посещали эту сцену, используем базовую функцию
      return getSceneAbsolutePosition(scene);
    }
    visited.add(scene.id);
    
    // Если сцена перетаскивается, используем позицию из localPositions напрямую
    if (localPositions[scene.id]) {
      return localPositions[scene.id];
    }
    
    // Для дочерних сцен используем layout для получения правильной позиции
    if (scene.parent_id) {
      const parent = allScenes.find(s => s.id === scene.parent_id);
      if (parent) {
        // Получаем все дочерние сцены родителя
        const children = (allScenes || []).filter(s => s.parent_id === parent.id);
        if (children.length > 0) {
          // Вычисляем layout для дочерних сцен
          const layout = calculateChildrenLayout(parent, children);
          const layoutItem = layout.find(item => item.sceneId === scene.id);
          
          if (layoutItem) {
            // Рекурсивно получаем абсолютную позицию родителя с учетом его layout
            // Это важно для многоуровневого вложения (B в C, C в D)
            const parentPos = getSceneAbsolutePositionWithLayout(parent, visited);
            return [parentPos[0] + layoutItem.position[0], parentPos[1] + layoutItem.position[1]];
          }
        }
        
        // Если layout не найден, используем позицию из БД
        const pos = scene.position_2d || [0, 0];
        // Рекурсивно получаем абсолютную позицию родителя
        const parentPos = getSceneAbsolutePositionWithLayout(parent, visited);
        return [parentPos[0] + pos[0], parentPos[1] + pos[1]];
      }
    }
    
    // Для корневых сцен позиция уже абсолютная
    const pos = scene.position_2d || [0, 0];
    return pos;
  }, [allScenes, localPositions, getSceneAbsolutePosition, calculateChildrenLayout]);

  // Преобразование мировых координат в экранные
  // Адаптировано для работы с элементами (как в Canvas2D)
  const worldToScreen = useCallback((x, z) => {
    const { width, height } = getCanvasSize();
    const centerX = width / 2;
    const centerY = height / 2;
    return {
      x: centerX + (x + pan.x) * zoom,
      y: centerY - (z + pan.y) * zoom // Используем Z как вертикаль в 2D
    };
  }, [pan, zoom]);

  // Преобразование экранных координат в мировые
  const screenToWorld = useCallback((screenX, screenY) => {
    const { width, height } = getCanvasSize();
    const centerX = width / 2;
    const centerY = height / 2;
    return {
      x: (screenX - centerX) / zoom - pan.x,
      z: (centerY - screenY) / zoom - pan.y // Z используется как вертикаль в 2D
    };
  }, [pan, zoom]);

  // Получение центра видимой области канваса в мировых координатах
  const getCanvasCenter = () => {
    const { width, height } = getCanvasSize();
    return screenToWorld(width / 2, height / 2);
  };


  // Проверка попадания точки в сцену
  const isPointInScene = (screenX, screenY, sceneX, sceneZ, sceneWidth, sceneHeight) => {
    const screenPos = worldToScreen(sceneX, sceneZ);
    const dx = Math.abs(screenX - screenPos.x);
    const dy = Math.abs(screenY - screenPos.y);
    return dx <= sceneWidth / 2 && dy <= sceneHeight / 2;
  };

  // Получение размера блока для сущности
  const getBlockSize = () => {
    return {
      width: 120 * zoom,
      height: 80 * zoom
    };
  };

  // Проверка, находится ли точка внутри блока сущности
  const isPointInBlock = (pointX, pointY, blockX, blockY) => {
    const { width, height } = getBlockSize();
    const dx = Math.abs(pointX - blockX);
    const dy = Math.abs(pointY - blockY);
    return dx <= width / 2 && dy <= height / 2;
  };

  // Проверка, находится ли точка над иконкой подключения
  const isPointInConnectionIcon = (pointX, pointY, elementX, elementY, elementWidth, elementHeight, isEntity = false) => {
    const iconSize = Math.max(16, 20 * zoom);
    let iconX, iconY;
    
    if (isEntity) {
      // Для сущности иконка в правом верхнем углу блока
      const blockWidth = 120 * zoom;
      const blockHeight = 80 * zoom;
      iconX = elementX + blockWidth / 2 - iconSize / 2 - 4;
      iconY = elementY - blockHeight / 2 + iconSize / 2 + 4;
    } else {
      // Для сцены иконка в правом верхнем углу
      iconX = elementX + elementWidth / 2 - iconSize / 2 - 4;
      iconY = elementY - elementHeight / 2 + iconSize / 2 + 4;
    }
    
    const dx = Math.abs(pointX - iconX);
    const dy = Math.abs(pointY - iconY);
    return dx <= iconSize / 2 && dy <= iconSize / 2;
  };

  // Получение размера канваса
  const getCanvasSize = () => {
    if (!containerRef.current) return { width: 0, height: 0 };
    return {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight
    };
  };


  // Отрисовка канваса
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    
    const redraw = () => {
      const { width, height } = getCanvasSize();
      if (width === 0 || height === 0) return;
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      
      // Отрисовка сетки
      const drawGrid = (ctx, width, height) => {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        const gridSize = 50 * zoom;
        const offsetX = (pan.x % gridSize) * zoom;
        const offsetY = (pan.y % gridSize) * zoom;

        ctx.beginPath();
        for (let x = offsetX; x < width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = offsetY; y < height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
      };
      
      // Унифицированная функция для отрисовки связей между любыми типами элементов
      const drawConnection2D = (ctx, connection, allElements, options = {}) => {
        const {
          selectedConnectionId = null,
          hoveredConnectionId = null,
          deletingConnectionId = null,
          draggingSceneId = null,
          draggingElementId = null,
          localPositions = {},
          localPositions2D = {},
          getSceneAbsolutePositionWithLayout = null,
          getElementPosition2D = null,
          getSceneSize = null,
          worldToScreen = null,
          zoom = 1
        } = options;
        
        if (!worldToScreen) return;
        
        // Находим элементы
        const fromElement = allElements.find(e => e.id === connection.from);
        const toElement = allElements.find(e => e.id === connection.to);
        
        if (!fromElement || !toElement) return;
        
        // Определяем типы элементов
        const fromType = getElementType(fromElement);
        const toType = getElementType(toElement);
        
        // Для сцен: проверяем, не является ли одна дочерней другой
        if (fromType === 'scene' && toType === 'scene') {
          const isToSceneChildOfFrom = toElement.parent_id === fromElement.id;
          const isFromSceneChildOfTo = fromElement.parent_id === toElement.id;
          
          if (isToSceneChildOfFrom || isFromSceneChildOfTo) {
            return; // Связь будет показана как пометка на дочерней сцене
          }
        }
        
        // Получаем позиции элементов с учетом перетаскивания
        const fromPos = getElementPosition(
          fromElement,
          fromType,
          draggingSceneId,
          draggingElementId,
          localPositions,
          localPositions2D,
          getSceneAbsolutePositionWithLayout,
          getElementPosition2D
        );
        
        const toPos = getElementPosition(
          toElement,
          toType,
          draggingSceneId,
          draggingElementId,
          localPositions,
          localPositions2D,
          getSceneAbsolutePositionWithLayout,
          getElementPosition2D
        );
        
        // Преобразуем в экранные координаты
        const fromScreen = worldToScreen(fromPos[0], fromPos[1]);
        const toScreen = worldToScreen(toPos[0], toPos[1]);
        
        // Получаем границы элементов
        const fromBounds = getElementBounds(
          fromElement,
          zoom,
          () => fromPos,
          worldToScreen,
          getSceneSize
        );
        
        const toBounds = getElementBounds(
          toElement,
          zoom,
          () => toPos,
          worldToScreen,
          getSceneSize
        );
        
        // Вычисляем точки подключения
        const { fromPoint, toPoint } = getConnectionPoints(
          fromElement,
          toElement,
          fromBounds,
          toBounds
        );
        
        // Определяем состояние связи
        const isSelected = selectedConnectionId === connection.id;
        const isHovered = hoveredConnectionId === connection.id;
        const isDeleting = deletingConnectionId === connection.id;
        
        // Цвет связи
        let strokeColor = connection.color || '#ffffff';
        if (isDeleting) strokeColor = '#ff0000'; // Красный при удалении
        else if (isSelected) strokeColor = '#ffff00';
        else if (isHovered) strokeColor = '#88ccff';
        
        // Толщина линии
        const lineWidth = isSelected ? Math.max(4, 5 * zoom) : (isHovered ? Math.max(3, 4 * zoom) : Math.max(2, 3 * zoom));
        
        // Эффект свечения для выбранных и hovered связей
        if (isSelected || isHovered) {
          ctx.shadowColor = isSelected ? 'rgba(255, 255, 0, 0.6)' : 'rgba(136, 204, 255, 0.5)';
          ctx.shadowBlur = 8;
        }
        
        // Вычисляем расстояние для определения кривизны
        const dx = toPoint.x - fromPoint.x;
        const dy = toPoint.y - fromPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance === 0) return;
        
        // Рисуем плавную кривую (квадратичную)
        const midX = (fromPoint.x + toPoint.x) / 2;
        const midY = (fromPoint.y + toPoint.y) / 2 - Math.min(distance * 0.2, 30);
        
        ctx.beginPath();
        ctx.moveTo(fromPoint.x, fromPoint.y);
        ctx.quadraticCurveTo(midX, midY, toPoint.x, toPoint.y);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        // Сбрасываем тень
        ctx.shadowBlur = 0;
        
        // Вычисляем направление стрелки на конце связи (для квадратичной кривой)
        // Производная в конечной точке: P'(1) = 2(P2 - P1) = 2(to - mid)
        const arrowEndDx = 2 * (toPoint.x - midX);
        const arrowEndDy = 2 * (toPoint.y - midY);
        const arrowEndAngle = Math.atan2(arrowEndDy, arrowEndDx);
        
        // Вычисляем направление стрелки на начале связи (для bidirectional)
        const arrowStartDx = 2 * (midX - fromPoint.x);
        const arrowStartDy = 2 * (midY - fromPoint.y);
        const arrowStartAngle = Math.atan2(arrowStartDy, arrowStartDx) + Math.PI;
        
        const arrowLength = Math.max(8, 12 * zoom);
        
        // Рисуем стрелку на конце связи
        ctx.beginPath();
        ctx.moveTo(toPoint.x, toPoint.y);
        ctx.lineTo(
          toPoint.x - arrowLength * Math.cos(arrowEndAngle - Math.PI / 6),
          toPoint.y - arrowLength * Math.sin(arrowEndAngle - Math.PI / 6)
        );
        ctx.moveTo(toPoint.x, toPoint.y);
        ctx.lineTo(
          toPoint.x - arrowLength * Math.cos(arrowEndAngle + Math.PI / 6),
          toPoint.y - arrowLength * Math.sin(arrowEndAngle + Math.PI / 6)
        );
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        
        // Эффект свечения для стрелки
        if (isSelected || isHovered) {
          ctx.shadowColor = isSelected ? 'rgba(255, 255, 0, 0.6)' : 'rgba(136, 204, 255, 0.5)';
          ctx.shadowBlur = 8;
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Рисуем стрелку на начале связи (если bidirectional)
        if (connection.bidirectional) {
          ctx.beginPath();
          ctx.moveTo(fromPoint.x, fromPoint.y);
          ctx.lineTo(
            fromPoint.x - arrowLength * Math.cos(arrowStartAngle - Math.PI / 6),
            fromPoint.y - arrowLength * Math.sin(arrowStartAngle - Math.PI / 6)
          );
          ctx.moveTo(fromPoint.x, fromPoint.y);
          ctx.lineTo(
            fromPoint.x - arrowLength * Math.cos(arrowStartAngle + Math.PI / 6),
            fromPoint.y - arrowLength * Math.sin(arrowStartAngle + Math.PI / 6)
          );
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = lineWidth;
          
          // Эффект свечения для стрелки
          if (isSelected || isHovered) {
            ctx.shadowColor = isSelected ? 'rgba(255, 255, 0, 0.6)' : 'rgba(136, 204, 255, 0.5)';
            ctx.shadowBlur = 8;
          }
          
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        
        // Метка (label) если есть
        if (connection.label) {
          const labelX = midX;
          const labelY = midY - 20;
          
          // Фон для текста
          ctx.font = `${12 * zoom}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textMetrics = ctx.measureText(connection.label);
          const textWidth = textMetrics.width;
          const textHeight = 16 * zoom;
          const padding = 4 * zoom;
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(
            labelX - textWidth / 2 - padding,
            labelY - textHeight / 2 - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
          );
          
          // Текст
          ctx.fillStyle = strokeColor;
          ctx.fillText(connection.label, labelX, labelY);
        }
      };
      
      // Отрисовка связей
      // Объединяем все элементы (сцены и элементы) для унифицированной отрисовки связей
      const allElementsForConnections = [
        ...(allScenes || []),
        ...(elements || []).filter(e => e.elementType !== 'scene')
      ];
      
      // Используем унифицированную функцию для отрисовки связей между сценами
      const drawConnection = (ctx, connection) => {
        drawConnection2D(ctx, connection, allElementsForConnections, {
          selectedConnectionId,
          hoveredConnectionId,
          draggingSceneId,
          draggingElementId,
          localPositions,
          localPositions2D,
          getSceneAbsolutePositionWithLayout,
          getElementPosition2D,
          getSceneSize,
          worldToScreen,
          zoom
        });
      };
      
      // Отрисовка элемента
      const drawEntity = (ctx, element) => {
        // Если элемент перетаскивается, используем локальную позицию
        let position2D;
        if (draggingElementId === element.id) {
          if (!localPositions2D[element.id]) {
            return;
          }
          position2D = localPositions2D[element.id];
        } else {
          // Для не перетаскиваемых элементов используем позицию из store
          position2D = getElementPosition2D(element);
        }
        
        const { x, y } = worldToScreen(position2D[0], position2D[1]);
        const isSelected = selectedElementId === element.id;
        const elementType = ENTITY_TYPES[element.type] || ENTITY_TYPES.box;
        
        // Размеры блока
        const blockWidth = 120 * zoom;
        const blockHeight = 80 * zoom;
        const padding = 10 * zoom;
        const cornerRadius = 8 * zoom;
        
        // Позиция блока (центрирование)
        const blockX = x - blockWidth / 2;
        const blockY = y - blockHeight / 2;
        
        // Базовый цвет
        const baseColor = element.color || '#3b82f6';
        
        // Рисуем прямоугольный блок с закругленными углами
        ctx.beginPath();
        ctx.moveTo(blockX + cornerRadius, blockY);
        ctx.lineTo(blockX + blockWidth - cornerRadius, blockY);
        ctx.quadraticCurveTo(blockX + blockWidth, blockY, blockX + blockWidth, blockY + cornerRadius);
        ctx.lineTo(blockX + blockWidth, blockY + blockHeight - cornerRadius);
        ctx.quadraticCurveTo(blockX + blockWidth, blockY + blockHeight, blockX + blockWidth - cornerRadius, blockY + blockHeight);
        ctx.lineTo(blockX + cornerRadius, blockY + blockHeight);
        ctx.quadraticCurveTo(blockX, blockY + blockHeight, blockX, blockY + blockHeight - cornerRadius);
        ctx.lineTo(blockX, blockY + cornerRadius);
        ctx.quadraticCurveTo(blockX, blockY, blockX + cornerRadius, blockY);
        ctx.closePath();
        
        // Заливка блока с градиентом
        const gradient = ctx.createLinearGradient(blockX, blockY, blockX, blockY + blockHeight);
        gradient.addColorStop(0, baseColor + 'FF');
        gradient.addColorStop(1, baseColor + 'CC');
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Обводка блока
        ctx.strokeStyle = isSelected ? '#ffff00' : '#ffffff';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();
        
        // Внутренняя обводка для объёма
        if (zoom > 0.5) {
          ctx.beginPath();
          ctx.moveTo(blockX + cornerRadius * 0.5, blockY + 2);
          ctx.lineTo(blockX + blockWidth - cornerRadius * 0.5, blockY + 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        
        // Иконка типа (эмодзи) в верхней части блока
        if (elementType.icon && zoom > 0.2) {
          const iconSize = Math.max(20, Math.min(blockHeight * 0.35, 32));
          ctx.font = `${iconSize}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(elementType.icon, x, blockY + padding + iconSize / 2);
        }
        
        // Имя элемента в нижней части блока
        if (element.name && zoom > 0.2) {
          const fontSize = Math.max(10, Math.min(blockHeight * 0.2, 14));
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 4;
          
          // Обрезаем текст, если он слишком длинный
          const maxWidth = blockWidth - padding * 2;
          let displayName = element.name;
          const metrics = ctx.measureText(displayName);
          if (metrics.width > maxWidth) {
            while (ctx.measureText(displayName + '...').width > maxWidth && displayName.length > 0) {
              displayName = displayName.slice(0, -1);
            }
            displayName += '...';
          }
          
          ctx.fillText(displayName, x, blockY + blockHeight - padding);
          ctx.shadowBlur = 0;
        }
        
        // Индикатор подключений
        const hasConnections = connections && connections.some(c => c.from === element.id || c.to === element.id);
        if (hasConnections && zoom > 0.3) {
          ctx.beginPath();
          ctx.moveTo(blockX - 3, blockY);
          ctx.lineTo(blockX - 3, blockY + blockHeight);
          ctx.lineTo(blockX + blockWidth + 3, blockY + blockHeight);
          ctx.lineTo(blockX + blockWidth + 3, blockY);
          ctx.closePath();
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        // Мигающая обводка для блоков без соединений (красный и желтый)
        if (!hasConnections) {
          const blinkPhase = (animationTime % 1000) / 1000;
          const sinValue = Math.sin(blinkPhase * Math.PI * 2);
          const colorMix = (sinValue + 1) / 2;
          const red = Math.floor(255);
          const green = Math.floor(255 * colorMix);
          const blue = 0;
          const blinkColor = `rgb(${red}, ${green}, ${blue})`;
          
          ctx.beginPath();
          ctx.moveTo(blockX - 4, blockY);
          ctx.lineTo(blockX - 4, blockY + blockHeight);
          ctx.lineTo(blockX + blockWidth + 4, blockY + blockHeight);
          ctx.lineTo(blockX + blockWidth + 4, blockY);
          ctx.closePath();
          ctx.strokeStyle = blinkColor;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        
        // Подсветка при наведении
        if (hoveredElementId === element.id && draggingElementId !== element.id) {
          ctx.beginPath();
          ctx.moveTo(blockX - 6, blockY);
          ctx.lineTo(blockX - 6, blockY + blockHeight);
          ctx.lineTo(blockX + blockWidth + 6, blockY + blockHeight);
          ctx.lineTo(blockX + blockWidth + 6, blockY);
          ctx.closePath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        // Иконка точки подключения при наведении
        if (hoveredElementId === element.id && draggingElementId !== element.id && !draggingConnection) {
          const iconSize = Math.max(16, 20 * zoom);
          const iconX = blockX + blockWidth - iconSize / 2 - 4;
          const iconY = blockY + iconSize / 2 + 4;
          
          // Рисуем круглую иконку
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Рисуем плюс внутри
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(iconX, iconY - iconSize / 4);
          ctx.lineTo(iconX, iconY + iconSize / 4);
          ctx.moveTo(iconX - iconSize / 4, iconY);
          ctx.lineTo(iconX + iconSize / 4, iconY);
          ctx.stroke();
        }
      };
      
      // Отрисовка сцены
      const drawScene = (ctx, scene) => {
        const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
        const screenPos = worldToScreen(sceneX, sceneZ);
        const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
        const sceneWidth = sceneWorldWidth * zoom;
        const sceneHeight = sceneWorldHeight * zoom;
        
        const isSelected = selectedSceneId === scene.id;
        const isHovered = hoveredSceneId === scene.id;
        const isConnectingFrom = connectMode && connectingFrom === scene.id;
        const isParent = !scene.parent_id;
        
        // Рисуем прямоугольник сцены
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        
        // Фон
        ctx.fillStyle = isSelected || isConnectingFrom
          ? 'rgba(102, 126, 234, 0.3)' 
          : isHovered 
            ? 'rgba(102, 126, 234, 0.2)' 
            : 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight);
        
        // Рамка - выделение только на основе selectedSceneId, не currentSceneId
        // На странице "Мои сцены" мы управляем сценами, а не работаем внутри них
        // В режиме создания связи выделяем сцену-источник
        ctx.strokeStyle = isSelected || isConnectingFrom
          ? '#667eea'
          : isHovered
            ? 'rgba(102, 126, 234, 0.6)'
            : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = (isSelected || isConnectingFrom) ? 3 : 1;
        ctx.strokeRect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight);
        
        // В режиме создания связи показываем пунктирную рамку для сцены-источника
        if (isConnectingFrom && connectMode) {
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.strokeRect(-sceneWidth / 2 - 2, -sceneHeight / 2 - 2, sceneWidth + 4, sceneHeight + 4);
          ctx.setLineDash([]);
        }
        
        // Название сцены (чуть выше центра)
        ctx.fillStyle = '#fff';
        const fontSize = Math.max(10, Math.min(14, 14 * (sceneWorldWidth / 200)));
        ctx.font = `${fontSize * zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const name = scene.name || 'Без названия';
        const textOffsetY = -sceneHeight * 0.15; // Смещаем текст вверх на 15% от высоты
        ctx.fillText(name.length > 20 ? name.substring(0, 20) + '...' : name, 0, textOffsetY);
        
        // Пометка о связи с родителем (если сцена дочерняя и связана с родителем)
        // Эта пометка теперь не нужна, так как зеленая точка показывает все связи
        // Но оставляем для обратной совместимости или специальных случаев
        
        // Иконка точки подключения при наведении (используем относительные координаты)
        if (isHovered && !draggingSceneId && !draggingConnection) {
          const iconSize = Math.max(16, 20 * zoom);
          const iconX = sceneWidth / 2 - iconSize / 2 - 4;
          const iconY = -sceneHeight / 2 + iconSize / 2 + 4;
          
          // Рисуем круглую иконку
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Рисуем плюс внутри
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(iconX, iconY - iconSize / 4);
          ctx.lineTo(iconX, iconY + iconSize / 4);
          ctx.moveTo(iconX - iconSize / 4, iconY);
          ctx.lineTo(iconX + iconSize / 4, iconY);
          ctx.stroke();
        }
        
        // Зеленая точка рисуется последней, чтобы быть поверх всех элементов
        // Зеленая точка для сцен, которые имеют связи
        const hasConnections = sceneConnections.some(
          conn => conn.from === scene.id || conn.to === scene.id
        );
        
        if (hasConnections) {
          // Рисуем зеленую точку в правом верхнем углу сцены (поверх всего)
          const dotSize = Math.max(10, 12 * zoom); // Увеличиваем размер для лучшей видимости
          const dotX = sceneWidth / 2 - dotSize / 2 - 6;
          const dotY = -sceneHeight / 2 + dotSize / 2 + 6;
          
          // Внешний круг с свечением (более яркий)
          ctx.shadowColor = 'rgba(0, 255, 0, 0.8)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          
          // Внутренний яркий круг (более контрастный)
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(dotX, dotY, dotSize / 2 - 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Белая обводка для контраста
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        ctx.restore();
        
        // Рисуем дочерние сцены внутри (только для родительских)
        if (isParent) {
          const children = (allScenes || []).filter(s => s.parent_id === scene.id);
          if (children.length > 0) {
            // Разделяем дочерние сцены на те, что перетаскиваются, и остальные
            const draggingChildren = children.filter(c => localPositions[c.id] && draggingSceneId === c.id);
            const staticChildren = children.filter(c => !localPositions[c.id] || draggingSceneId !== c.id);
            
            // Рисуем статические дочерние сцены внутри родителя
            if (staticChildren.length > 0) {
              const layout = calculateChildrenLayout(scene, staticChildren);
              
              layout.forEach(({ sceneId, position, size }) => {
                const child = staticChildren.find(c => c.id === sceneId);
                if (child) {
                  // Временно переопределяем позицию и размер для отрисовки
                  const oldPos = child.position_2d;
                  const oldSize = child.size_2d;
                  child.position_2d = position;
                  child.size_2d = size;
                  drawScene(ctx, child);
                  child.position_2d = oldPos;
                  child.size_2d = oldSize;
                }
              });
            }
            
            // Перетаскиваемые дочерние сцены отрисовываются как корневые (они уже в localPositions)
            // Они будут отрисованы позже в rootScenes.forEach
          }
        }
      };
      
      drawGrid(ctx, width, height);
      // Сначала рисуем сцены
      rootScenes.forEach(scene => drawScene(ctx, scene));
      
      // Рисуем элементы (worker, block)
      const workerAndBlockElements = elements ? elements.filter(e => e.elementType !== 'scene') : [];
      if (workerAndBlockElements.length > 0) {
        // Разделяем элементы на те, что внутри сцен, и те, что вне сцен
        const elementsInScenes = workerAndBlockElements.filter(e => e.parent_id);
        const elementsOutsideScenes = workerAndBlockElements.filter(e => !e.parent_id);
        
        // Рисуем элементы внутри сцен
        // Для элементов внутри сцен отображаем их в абсолютных координатах
        // (они могут быть где угодно на карте, не обязательно строго внутри прямоугольника сцены)
        elementsInScenes.forEach(element => {
          if (draggingElementId === element.id) return; // Пропускаем перетаскиваемый
          drawEntity(ctx, element);
        });
        
        // Рисуем элементы вне сцен
        elementsOutsideScenes.forEach(element => {
          if (draggingElementId === element.id) return; // Пропускаем перетаскиваемый
          drawEntity(ctx, element);
        });
        
        // Перетаскиваемый элемент рисуется последним (поверх всего)
        if (draggingElementId) {
          const draggedElement = workerAndBlockElements.find(e => e.id === draggingElementId);
          if (draggedElement) {
            drawEntity(ctx, draggedElement);
          }
        }
      }
      
      // Рисуем перетаскиваемые дочерние сцены поверх всего (если они перетаскиваются)
      if (draggingSceneId) {
        const draggingScene = allScenes.find(s => s.id === draggingSceneId);
        if (draggingScene && draggingScene.parent_id && localPositions[draggingSceneId]) {
          // Рисуем дочернюю сцену с её сохраненным маленьким размером
          // Временно сохраняем старые значения для отрисовки
          const [sceneX, sceneZ] = localPositions[draggingSceneId];
          const screenPos = worldToScreen(sceneX, sceneZ);
          
          // Используем сохраненный маленький размер из localSizes
          const sceneSize = localSizes[draggingSceneId] || getSceneSize(draggingScene);
          const [sceneWorldWidth, sceneWorldHeight] = sceneSize;
          const sceneWidth = sceneWorldWidth * zoom;
          const sceneHeight = sceneWorldHeight * zoom;
          
          ctx.save();
          ctx.translate(screenPos.x, screenPos.y);
          
          // Фон
          ctx.fillStyle = selectedSceneId === draggingScene.id 
            ? 'rgba(102, 126, 234, 0.3)' 
            : hoveredSceneId === draggingScene.id
              ? 'rgba(102, 126, 234, 0.2)' 
              : 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight);
          
          // Рамка - выделение только на основе selectedSceneId
          ctx.strokeStyle = selectedSceneId === draggingScene.id
            ? '#667eea'
            : hoveredSceneId === draggingScene.id
              ? 'rgba(102, 126, 234, 0.6)'
              : 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = selectedSceneId === draggingScene.id ? 3 : 1;
          ctx.strokeRect(-sceneWidth / 2, -sceneHeight / 2, sceneWidth, sceneHeight);
          
          // Название сцены
          ctx.fillStyle = '#fff';
          const fontSize = Math.max(10, Math.min(14, 14 * (sceneWorldWidth / 200)));
          ctx.font = `${fontSize * zoom}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const name = draggingScene.name || 'Без названия';
          const textOffsetY = -sceneHeight * 0.15;
          ctx.fillText(name.length > 20 ? name.substring(0, 20) + '...' : name, 0, textOffsetY);
          
          ctx.restore();
        }
      }
      
      // Рисуем все связи (используем унифицированную функцию для всех типов связей)
      // Объединяем все связи: между сценами, между элементами, и между сценами и элементами
      const allConnections = [...(connections || [])];
      if (allConnections.length > 0) {
        allConnections.forEach(conn => {
          drawConnection2D(ctx, conn, allElementsForConnections, {
            selectedConnectionId,
            hoveredConnectionId,
            deletingConnectionId,
            draggingSceneId,
            draggingElementId,
            localPositions,
            localPositions2D,
            getSceneAbsolutePositionWithLayout,
            getElementPosition2D,
            getSceneSize,
            worldToScreen,
            zoom
          });
        });
      }
      
      // Рисуем временную линию при создании связи
      if (draggingConnection && connectionMousePos) {
        let startPos = null;
        
        if (draggingConnection.type === 'scene') {
          const scene = allScenes.find(s => s.id === draggingConnection.id);
          if (scene) {
            const [sceneX, sceneZ] = getSceneAbsolutePositionWithLayout(scene);
            const screenPos = worldToScreen(sceneX, sceneZ);
            const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
            const sceneWidth = sceneWorldWidth * zoom;
            const sceneHeight = sceneWorldHeight * zoom;
            
            // Находим точку на краю прямоугольника
            const edge = getRectangleEdgeIntersection(
              screenPos.x, screenPos.y, sceneWidth, sceneHeight,
              connectionMousePos.x, connectionMousePos.y
            );
            startPos = edge;
          }
        } else if (draggingConnection.type === 'element') {
          const element = elements ? elements.find(e => e.id === draggingConnection.id) : null;
          if (element) {
            const position2D = getElementPosition2D(element);
            const { x, y } = worldToScreen(position2D[0], position2D[1]);
            const blockWidth = 120 * zoom;
            const blockHeight = 80 * zoom;
            
            // Находим точку на краю блока
            const edge = getRectangleEdgeIntersection(
              x, y, blockWidth, blockHeight,
              connectionMousePos.x, connectionMousePos.y
            );
            startPos = edge;
          }
        }
        
        if (startPos) {
          // Рисуем пунктирную линию
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = Math.max(2, 3 * zoom);
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(startPos.x, startPos.y);
          ctx.lineTo(connectionMousePos.x, connectionMousePos.y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Стрелка на конце
          const angle = Math.atan2(connectionMousePos.y - startPos.y, connectionMousePos.x - startPos.x);
          const arrowLength = Math.max(8, 12 * zoom);
          ctx.beginPath();
          ctx.moveTo(connectionMousePos.x, connectionMousePos.y);
          ctx.lineTo(
            connectionMousePos.x - arrowLength * Math.cos(angle - Math.PI / 6),
            connectionMousePos.y - arrowLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(connectionMousePos.x, connectionMousePos.y);
          ctx.lineTo(
            connectionMousePos.x - arrowLength * Math.cos(angle + Math.PI / 6),
            connectionMousePos.y - arrowLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      }
    };
    
    redraw();
    
    // Анимация мигания для элементов без соединений и постоянная перерисовка при перетаскивании
    const animationFrameId = requestAnimationFrame(function animate() {
      setAnimationTime(Date.now());
      // Перерисовываем при перетаскивании для обновления связей в реальном времени
      if (draggingSceneId || draggingElementId || draggingConnection) {
        redraw();
      }
      requestAnimationFrame(animate);
    });
    
    // Обработка изменения размера окна
    const handleResize = () => {
      redraw();
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [allScenes, sceneConnections, pan, zoom, selectedSceneId, hoveredSceneId, draggingSceneId, localPositions, localSizes, rootScenes, getSceneAbsolutePosition, getSceneAbsolutePositionWithLayout, worldToScreen, screenToWorld, getSceneSize, calculateChildrenLayout, connectMode, connectingFrom, elements, connections, selectedElementId, hoveredElementId, draggingElementId, localPositions2D, animationTime, getElementPosition2D, getCanvasSize, draggingConnection, connectionMousePos, selectedConnectionId, hoveredConnectionId]);

  // Обработчик wheel для зума (отдельный useEffect)
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement || viewMode !== '2d') return;
    
    const handleWheelEvent = (e) => {
      e.preventDefault();
      
      const rect = canvasElement.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Преобразуем позицию курсора в мировые координаты (до изменения zoom)
      const worldPos = screenToWorld(mouseX, mouseY);
      
      // Вычисляем новый zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(3, zoom * delta));
      
      // Вычисляем новую позицию pan так, чтобы точка под курсором осталась на месте
      const { width, height } = getCanvasSize();
      const centerX = width / 2;
      const centerY = height / 2;
      const newPan = {
        x: (mouseX - centerX) / newZoom - worldPos.x,
        y: (centerY - mouseY) / newZoom - worldPos.z
      };
      
      setZoom(newZoom);
      setPan(newPan);
    };
    
    canvasElement.addEventListener('wheel', handleWheelEvent, { passive: false });
    
    return () => {
      canvasElement.removeEventListener('wheel', handleWheelEvent);
    };
  }, [viewMode, zoom, pan, screenToWorld, getCanvasSize, setZoom, setPan]);

  // Обработчики мыши
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = screenToWorld(x, y);
    
    // Сохраняем начальную позицию для определения клика vs перетаскивания
    clickStartRef.current = { x, y };
    wasDraggingRef.current = false;
    
    // Сначала проверяем клик по иконке подключения (имеет приоритет)
    // Проверяем элементы - проверяем все, но иконка видна только при наведении
    const workerAndBlockElements = elements ? elements.filter(e => e.elementType !== 'scene') : [];
    if (workerAndBlockElements.length > 0 && !connectMode && !draggingConnection) {
      for (let i = workerAndBlockElements.length - 1; i >= 0; i--) {
        const element = workerAndBlockElements[i];
        if (draggingElementId === element.id) continue;
        
        const position2D = getElementPosition2D(element);
        const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
        const blockWidth = 120 * zoom;
        const blockHeight = 80 * zoom;
        
        // Проверяем, находится ли курсор над блоком (для отображения иконки)
        const isOverBlock = isPointInBlock(x, y, sx, sy);
        // Проверяем, находится ли курсор над иконкой
        if (isOverBlock && isPointInConnectionIcon(x, y, sx, sy, blockWidth, blockHeight, true)) {
          // Начинаем создание связи от элемента
          setDraggingConnection({ type: 'element', id: element.id, startPos: { x: sx, y: sy } });
          setConnectionMousePos({ x, y });
          return;
        }
      }
    }
    
    // Проверяем сцены
    if (!connectMode && !draggingConnection) {
      // Сначала проверяем дочерние сцены
      for (const parentScene of (allScenes || []).filter(s => !s.parent_id)) {
        const children = (allScenes || []).filter(s => s.parent_id === parentScene.id);
        if (children.length > 0) {
          const layout = calculateChildrenLayout(parentScene, children);
          const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
          
          for (const { sceneId, position, size } of layout) {
            const child = children.find(c => c.id === sceneId);
            if (child) {
              const childAbsoluteX = parentX + position[0];
              const childAbsoluteZ = parentZ + position[1];
              const [childWorldWidth, childWorldHeight] = size;
              const childWidth = childWorldWidth * zoom;
              const childHeight = childWorldHeight * zoom;
              const screenPos = worldToScreen(childAbsoluteX, childAbsoluteZ);
              
              // Проверяем, находится ли курсор над сценой
              const isOverScene = isPointInScene(x, y, childAbsoluteX, childAbsoluteZ, childWidth, childHeight);
              // Проверяем, находится ли курсор над иконкой
              if (isOverScene && isPointInConnectionIcon(x, y, screenPos.x, screenPos.y, childWidth, childHeight, false)) {
                setDraggingConnection({ type: 'scene', id: child.id, startPos: { x: screenPos.x, y: screenPos.y } });
                setConnectionMousePos({ x, y });
                return;
              }
            }
          }
        }
      }
      
      // Проверяем родительские сцены
      for (const scene of (allScenes || []).filter(s => !s.parent_id)) {
        const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
        const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
        const sceneWidth = sceneWorldWidth * zoom;
        const sceneHeight = sceneWorldHeight * zoom;
        const screenPos = worldToScreen(sceneX, sceneZ);
        
        // Проверяем, находится ли курсор над сценой
        const isOverScene = isPointInScene(x, y, sceneX, sceneZ, sceneWidth, sceneHeight);
        // Проверяем, находится ли курсор над иконкой
        if (isOverScene && isPointInConnectionIcon(x, y, screenPos.x, screenPos.y, sceneWidth, sceneHeight, false)) {
          setDraggingConnection({ type: 'scene', id: scene.id, startPos: { x: screenPos.x, y: screenPos.y } });
          setConnectionMousePos({ x, y });
          return;
        }
      }
    }
    
    // Сначала проверяем клик по элементу (элементы имеют приоритет над сценами)
    let clickedElement = null;
    if (workerAndBlockElements.length > 0 && !connectMode && !draggingConnection) {
      for (let i = workerAndBlockElements.length - 1; i >= 0; i--) {
        const element = workerAndBlockElements[i];
        // Пропускаем перетаскиваемый элемент
        if (draggingElementId === element.id) {
          continue;
        }
        const position2D = getElementPosition2D(element);
        const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
        
        if (isPointInBlock(x, y, sx, sy)) {
          clickedElement = element;
          break;
        }
      }
    }
    
    if (clickedElement) {
      setDraggingElementId(clickedElement.id);
      // НЕ вызываем selectElement здесь - он будет вызван в handleClick, если это не перетаскивание
      setIsDragging(true);
      
      // Сохраняем смещение для плавного перетаскивания
      const position2D = getElementPosition2D(clickedElement);
      const dragOffset = { 
        x: worldPos.x - position2D[0], 
        z: worldPos.z - position2D[1] 
      };
      setDragStart(dragOffset);
      
      // Устанавливаем локальную позицию
      setLocalPositions2D(prev => ({
        ...prev,
        [clickedElement.id]: [...position2D]
      }));
      
      // Очищаем hover эффект для перетаскиваемого элемента
      if (hoveredElementId === clickedElement.id) {
        setHoveredElementId(null);
      }
      return; // Не проверяем клик по сцене, если кликнули по элементу
    }
    
      // Проверяем клик по сцене (сначала дочерние, потом родительские)
      let clickedScene = null;
      let clickedSceneVisualPos = null; // Сохраняем визуальную позицию для дочерних сцен
      let clickedSceneVisualSize = null; // Сохраняем визуальный размер для дочерних сцен
      
      // Сначала проверяем все дочерние сцены внутри их родителей
      for (const parentScene of (allScenes || []).filter(s => !s.parent_id)) {
        const children = (allScenes || []).filter(s => s.parent_id === parentScene.id);
        if (children.length > 0) {
          const layout = calculateChildrenLayout(parentScene, children);
          const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
          
          for (const { sceneId, position, size } of layout) {
            const child = children.find(c => c.id === sceneId);
            if (child) {
              // Вычисляем абсолютную позицию дочерней сцены из layout
              const childAbsoluteX = parentX + position[0];
              const childAbsoluteZ = parentZ + position[1];
              const [childWorldWidth, childWorldHeight] = size;
              const childWidth = childWorldWidth * zoom;
              const childHeight = childWorldHeight * zoom;
              
              if (isPointInScene(x, y, childAbsoluteX, childAbsoluteZ, childWidth, childHeight)) {
                clickedScene = child;
                // Сохраняем реальную визуальную позицию из layout
                clickedSceneVisualPos = [childAbsoluteX, childAbsoluteZ];
                // Сохраняем размер дочерней сцены из layout
                clickedSceneVisualSize = size;
                break;
              }
            }
          }
          if (clickedScene) break;
        }
      }
      
      // Если не кликнули по дочерней, проверяем родительские сцены
      if (!clickedScene) {
        for (const scene of (allScenes || []).filter(s => !s.parent_id)) {
          const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
          const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
          const sceneWidth = sceneWorldWidth * zoom;
          const sceneHeight = sceneWorldHeight * zoom;
          
          if (isPointInScene(x, y, sceneX, sceneZ, sceneWidth, sceneHeight)) {
            clickedScene = scene;
            break;
          }
        }
      }
    
    if (clickedScene) {
      if (connectMode) {
        // В режиме создания связи не перетаскиваем и не выделяем
        if (!connectingFrom) {
          setConnectingFrom(clickedScene.id);
          setSelectedSceneId(clickedScene.id); // Выделяем первую сцену для визуальной обратной связи
        } else if (connectingFrom !== clickedScene.id) {
          // Проверяем, нет ли уже такой связи (учитываем направление)
          if (!connectionExists(sceneConnections, connectingFrom, clickedScene.id, false)) {
            createConnection({
              from: connectingFrom,
              to: clickedScene.id
            });
            setConnectingFrom(null);
            setConnectMode(false);
            setSelectedSceneId(clickedScene.id); // Выделяем вторую сцену после создания связи
          } else {
            // Связь уже существует - просто выходим из режима создания связи
            console.log('Связь между этими сценами уже существует');
            setConnectingFrom(null);
            setConnectMode(false);
            setSelectedSceneId(clickedScene.id);
          }
        } else {
          // Клик по той же сцене - отменяем выбор
          setConnectingFrom(null);
          setSelectedSceneId(null);
        }
        // Не устанавливаем перетаскивание в режиме создания связи
        return;
      } else {
        setSelectedSceneId(clickedScene.id);
        setDraggingSceneId(clickedScene.id);
        setDragStart({ x, y });
        setIsDragging(true);
        
        // Для дочерних сцен используем реальную визуальную позицию из layout
        // Для корневых сцен используем вычисленную позицию
        const startScenePos = clickedSceneVisualPos || getSceneAbsolutePosition(clickedScene);
        dragStartScenePosRef.current = startScenePos;
        dragStartMousePosRef.current = screenToWorld(x, y);
        
        setLocalPositions(prev => ({
          ...prev,
          [clickedScene.id]: startScenePos
        }));
        
        // Сохраняем размер дочерней сцены во время перетаскивания
        // Чтобы она оставалась маленькой, пока не будет извлечена
        if (clickedScene.parent_id) {
          // Используем визуальный размер из layout, если он есть, иначе вычисляем
          const currentSize = clickedSceneVisualSize || getSceneSize(clickedScene);
          setLocalSizes(prev => ({
            ...prev,
            [clickedScene.id]: currentSize
          }));
        }
      }
    } else {
      // Панорамирование - начинаем перетаскивание камеры
      setIsDragging(true);
      setDragStart({ x, y });
      setSelectedSceneId(null);
    }
  }, [allScenes, zoom, connectMode, connectingFrom, sceneConnections, getSceneAbsolutePosition, calculateChildrenLayout, getSceneSize, isPointInScene, screenToWorld, createConnection, setSelectedSceneId, setDraggingSceneId, setIsDragging, setDragStart, setLocalPositions, setLocalSizes, setConnectingFrom, setConnectMode, elements, draggingElementId, getElementPosition2D, isPointInBlock, isPointInConnectionIcon, setDraggingElementId, selectElement, hoveredElementId, setHoveredElementId, setLocalPositions2D, selectedElementId, draggingConnection, setDraggingConnection, setConnectionMousePos]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = screenToWorld(x, y);
    
    // Обновляем позицию мыши при создании связи
    if (draggingConnection) {
      setConnectionMousePos({ x, y });
      return; // Не обрабатываем другие события при создании связи
    }
    
    // Проверяем, было ли перетаскивание (движение мыши более 5 пикселей)
    if (clickStartRef.current) {
      const moveDistance = Math.sqrt(
        Math.pow(x - clickStartRef.current.x, 2) + Math.pow(y - clickStartRef.current.y, 2)
      );
      if (moveDistance > 5) {
        wasDraggingRef.current = true;
      }
    }
    
    // Обработка перетаскивания элемента
    if (isDragging && draggingElementId) {
      const element = elements ? elements.find(e => e.id === draggingElementId) : null;
      if (element) {
        // dragStart содержит смещение { x, z } от позиции элемента до точки клика
        // Вычисляем новую позицию на основе текущей позиции мыши с учетом смещения
        const dragOffsetX = dragStart && typeof dragStart.x === 'number' ? dragStart.x : 0;
        const dragOffsetZ = dragStart && typeof dragStart.z === 'number' ? dragStart.z : 0;
        
        const newPosition2D = [
          worldPos.x - dragOffsetX,
          worldPos.z - dragOffsetZ
        ];
        
        // Обновляем локальное состояние для мгновенной перерисовки
        setLocalPositions2D(prev => {
          const updated = { ...prev };
          updated[element.id] = [...newPosition2D];
          return updated;
        });
      }
      return; // Не обрабатываем перетаскивание сцены, если перетаскиваем элемент
    }
    
    if (isDragging && draggingSceneId) {
      const scene = allScenes.find(s => s.id === draggingSceneId);
      if (scene && dragStartScenePosRef.current && dragStartMousePosRef.current) {
        const currentWorldPos = screenToWorld(x, y);
        const deltaX = currentWorldPos.x - dragStartMousePosRef.current.x;
        const deltaZ = currentWorldPos.z - dragStartMousePosRef.current.z;
        
        const newPos = [
          dragStartScenePosRef.current[0] + deltaX,
          dragStartScenePosRef.current[1] + deltaZ
        ];
        
        setLocalPositions(prev => ({
          ...prev,
          [draggingSceneId]: newPos
        }));
        
        // Если перетаскиваем дочернюю сцену, проверяем, вышла ли она за пределы родителя
        if (scene.parent_id) {
          const parent = allScenes.find(s => s.id === scene.parent_id);
          if (parent) {
            const [parentX, parentZ] = getSceneAbsolutePosition(parent);
            const [parentWorldWidth, parentWorldHeight] = getSceneSize(parent);
            
            const dx = Math.abs(newPos[0] - parentX);
            const dz = Math.abs(newPos[1] - parentZ);
            
            // Если сцена вышла за пределы родителя, визуально показываем это
            if (dx > parentWorldWidth / 2 || dz > parentWorldHeight / 2) {
              // Сцена вышла за пределы - не показываем родителя как hovered
              setHoveredSceneId(null);
            } else {
              setHoveredSceneId(parent.id);
            }
          }
        } else {
          // Проверяем, над какой сценой находимся (для родительских сцен)
          let hovered = null;
          for (const s of allScenes) {
            if (s.id === draggingSceneId) continue;
            const [sX, sZ] = getSceneAbsolutePosition(s);
            const [sWorldWidth, sWorldHeight] = getSceneSize(s);
            
            const dx = Math.abs(currentWorldPos.x - sX);
            const dz = Math.abs(currentWorldPos.z - sZ);
            
            if (dx <= sWorldWidth / 2 && dz <= sWorldHeight / 2) {
              hovered = s.id;
              break;
            }
          }
          setHoveredSceneId(hovered);
        }
      }
    } else if (isDragging && !draggingSceneId && !draggingElementId) {
      // Панорамирование - используем разницу в экранных координатах
      // Только если не перетаскиваем элемент и не перетаскиваем сцену
      const deltaX = x - dragStart.x;
      const deltaY = y - dragStart.y;
      setPan(prev => ({
        x: prev.x + deltaX,
        y: prev.y - deltaY // Инвертируем Y для правильного направления
      }));
      setDragStart({ x, y });
      } else {
        // Проверка наведения (сначала дочерние, потом родительские)
        let hovered = null;
        
        // Сначала проверяем все дочерние сцены внутри их родителей
        for (const parentScene of (allScenes || []).filter(s => !s.parent_id)) {
          const children = (allScenes || []).filter(s => s.parent_id === parentScene.id);
          if (children.length > 0) {
            const layout = calculateChildrenLayout(parentScene, children);
            const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
            
            for (const { sceneId, position, size } of layout) {
              const child = children.find(c => c.id === sceneId);
              if (child) {
                // Вычисляем абсолютную позицию дочерней сцены
                const childAbsoluteX = parentX + position[0];
                const childAbsoluteZ = parentZ + position[1];
                const [childWorldWidth, childWorldHeight] = size;
                const childWidth = childWorldWidth * zoom;
                const childHeight = childWorldHeight * zoom;
                
                if (isPointInScene(x, y, childAbsoluteX, childAbsoluteZ, childWidth, childHeight)) {
                  hovered = child.id;
                  break;
                }
              }
            }
            if (hovered) break;
          }
        }
        
        // Если не навели на дочернюю, проверяем родительские сцены
        if (!hovered) {
          for (const scene of (allScenes || []).filter(s => !s.parent_id)) {
            const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
            const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
            const sceneWidth = sceneWorldWidth * zoom;
            const sceneHeight = sceneWorldHeight * zoom;
            
            if (isPointInScene(x, y, sceneX, sceneZ, sceneWidth, sceneHeight)) {
              hovered = scene.id;
              break;
            }
          }
        }
        
        setHoveredSceneId(hovered);
      }
    
    // Проверка наведения на элементы (только если не перетаскиваем)
    const workerAndBlockElements = elements ? elements.filter(e => e.elementType !== 'scene') : [];
    if (!isDragging && !draggingElementId && workerAndBlockElements.length > 0) {
      let newHoveredElementId = null;
      
      // Проверяем наведение на блоки элементов
      for (let i = workerAndBlockElements.length - 1; i >= 0; i--) {
        const element = workerAndBlockElements[i];
        
        // Пропускаем перетаскиваемый элемент
        if (draggingElementId === element.id) {
          continue;
        }
        
        const position2D = getElementPosition2D(element);
        const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
        
        if (isPointInBlock(x, y, sx, sy)) {
          newHoveredElementId = element.id;
          break;
        }
      }
      
      setHoveredElementId(newHoveredElementId);
    }
    
    // Проверяем hover на связях (только если не перетаскиваем и не создаем связь)
    let newHoveredConnectionId = null;
    if (!draggingConnection && !isDragging && connections && connections.length > 0) {
      // Объединяем все элементы для проверки связей
      const allElementsForHover = [
        ...(allScenes || []),
        ...(elements || []).filter(e => e.elementType !== 'scene')
      ];
      
      // Проверяем каждую связь
      for (const conn of connections) {
        const fromElement = allElementsForHover.find(e => e.id === conn.from);
        const toElement = allElementsForHover.find(e => e.id === conn.to);
        
        if (!fromElement || !toElement) continue;
        
        // Определяем типы элементов
        const fromType = getElementType(fromElement);
        const toType = getElementType(toElement);
        
        // Пропускаем связи между дочерними сценами (они отображаются как пометки)
        if (fromType === 'scene' && toType === 'scene') {
          const isToSceneChildOfFrom = toElement.parent_id === fromElement.id;
          const isFromSceneChildOfTo = fromElement.parent_id === toElement.id;
          if (isToSceneChildOfFrom || isFromSceneChildOfTo) {
            continue;
          }
        }
        
        // Получаем позиции элементов
        const fromPos = getElementPosition(
          fromElement,
          fromType,
          draggingSceneId,
          draggingElementId,
          localPositions,
          localPositions2D,
          getSceneAbsolutePositionWithLayout,
          getElementPosition2D
        );
        
        const toPos = getElementPosition(
          toElement,
          toType,
          draggingSceneId,
          draggingElementId,
          localPositions,
          localPositions2D,
          getSceneAbsolutePositionWithLayout,
          getElementPosition2D
        );
        
        // Преобразуем в экранные координаты
        const fromScreen = worldToScreen(fromPos[0], fromPos[1]);
        const toScreen = worldToScreen(toPos[0], toPos[1]);
        
        // Получаем границы элементов
        const fromBounds = getElementBounds(
          fromElement,
          zoom,
          () => fromPos,
          worldToScreen,
          getSceneSize
        );
        
        const toBounds = getElementBounds(
          toElement,
          zoom,
          () => toPos,
          worldToScreen,
          getSceneSize
        );
        
        // Вычисляем точки подключения
        const { fromPoint, toPoint } = getConnectionPoints(
          fromElement,
          toElement,
          fromBounds,
          toBounds
        );
        
        // Проверяем, находится ли курсор на связи
        const tolerance = Math.max(5, 8 * zoom); // Увеличиваем tolerance с зумом
        if (isPointOnConnection(x, y, fromPoint, toPoint, tolerance)) {
          newHoveredConnectionId = conn.id;
          break; // Нашли связь, выходим из цикла
        }
      }
    }
    
    // Обновляем hoveredConnectionId с debounce для производительности
    if (newHoveredConnectionId !== hoveredConnectionId) {
      setHoveredConnectionId(newHoveredConnectionId);
    }
    
    // Проверяем, находится ли курсор над иконкой подключения
    let isOverConnectionIcon = false;
    if (!draggingConnection && !isDragging) {
      // Проверяем элементы
      if (workerAndBlockElements.length > 0 && hoveredElementId) {
        const element = workerAndBlockElements.find(e => e.id === hoveredElementId);
        if (element) {
          const position2D = getElementPosition2D(element);
          const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
          const blockWidth = 120 * zoom;
          const blockHeight = 80 * zoom;
          if (isPointInConnectionIcon(x, y, sx, sy, blockWidth, blockHeight, true)) {
            isOverConnectionIcon = true;
          }
        }
      }
      
      // Проверяем сцены
      if (!isOverConnectionIcon && hoveredSceneId) {
        const scene = allScenes.find(s => s.id === hoveredSceneId);
        if (scene) {
          const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
          const screenPos = worldToScreen(sceneX, sceneZ);
          const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
          const sceneWidth = sceneWorldWidth * zoom;
          const sceneHeight = sceneWorldHeight * zoom;
          if (isPointInConnectionIcon(x, y, screenPos.x, screenPos.y, sceneWidth, sceneHeight, false)) {
            isOverConnectionIcon = true;
          }
        }
      }
    }
    
    // Обновляем cursor
    if (canvasRef.current) {
      if (draggingConnection) {
        canvasRef.current.style.cursor = 'crosshair';
      } else if (isDragging) {
        canvasRef.current.style.cursor = draggingElementId ? 'grabbing' : 'grabbing';
      } else {
        let cursorStyle = 'default';
        if (isOverConnectionIcon) {
          cursorStyle = 'crosshair';
        } else if (hoveredElementId) {
          cursorStyle = 'grab';
        } else if (hoveredSceneId) {
          cursorStyle = 'grab';
        }
        canvasRef.current.style.cursor = cursorStyle;
      }
    }
  }, [isDragging, draggingSceneId, draggingElementId, draggingConnection, allScenes, elements, connections, zoom, pan, getSceneAbsolutePosition, getSceneAbsolutePositionWithLayout, getSceneSize, screenToWorld, setLocalPositions, setHoveredSceneId, setIsDragging, setPan, setDragStart, clickStartRef, wasDraggingRef, dragStart, setLocalPositions2D, hoveredElementId, hoveredConnectionId, getElementPosition2D, isPointInBlock, isPointInConnectionIcon, setHoveredElementId, setHoveredConnectionId, localPositions, localPositions2D, worldToScreen]);

  const handleMouseUp = useCallback((e) => {
    // Обработка создания связи
    if (draggingConnection) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Проверяем, над каким элементом отпустили
      let targetType = null;
      let targetId = null;
      
      // Проверяем элементы (worker, block)
      const workerAndBlockElements = elements ? elements.filter(e => e.elementType !== 'scene') : [];
      if (workerAndBlockElements.length > 0) {
        for (const element of workerAndBlockElements) {
          if (element.id === draggingConnection.id && draggingConnection.type === 'element') continue;
          const position2D = getElementPosition2D(element);
          const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
          if (isPointInBlock(x, y, sx, sy)) {
            targetType = 'element';
            targetId = element.id;
            break;
          }
        }
      }
      
      // Проверяем сцены, если не нашли элемент
      if (!targetId) {
        // Сначала проверяем дочерние сцены
        for (const parentScene of (allScenes || []).filter(s => !s.parent_id)) {
          const children = (allScenes || []).filter(s => s.parent_id === parentScene.id);
          if (children.length > 0) {
            const layout = calculateChildrenLayout(parentScene, children);
            const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
            
            for (const { sceneId, position, size } of layout) {
              const child = children.find(c => c.id === sceneId);
              if (child && child.id !== draggingConnection.id) {
                const childAbsoluteX = parentX + position[0];
                const childAbsoluteZ = parentZ + position[1];
                const [childWorldWidth, childWorldHeight] = size;
                const childWidth = childWorldWidth * zoom;
                const childHeight = childWorldHeight * zoom;
                
                if (isPointInScene(x, y, childAbsoluteX, childAbsoluteZ, childWidth, childHeight)) {
                  targetType = 'scene';
                  targetId = child.id;
                  break;
                }
              }
            }
            if (targetId) break;
          }
        }
        
        // Проверяем родительские сцены
        if (!targetId) {
          for (const scene of (allScenes || []).filter(s => !s.parent_id)) {
            if (scene.id === draggingConnection.id && draggingConnection.type === 'scene') continue;
            const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
            const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
            const sceneWidth = sceneWorldWidth * zoom;
            const sceneHeight = sceneWorldHeight * zoom;
            
            if (isPointInScene(x, y, sceneX, sceneZ, sceneWidth, sceneHeight)) {
              targetType = 'scene';
              targetId = scene.id;
              break;
            }
          }
        }
      }
      
      // Создаём связь, если нашли цель
      if (targetId && targetType) {
        if (draggingConnection.type === 'scene' && targetType === 'scene') {
          // Связь между сценами
          if (!connectionExists(sceneConnections, draggingConnection.id, targetId)) {
            createConnection({
              from: draggingConnection.id,
              to: targetId
            });
          }
        } else if (draggingConnection.type === 'element' && targetType === 'element') {
          // Связь между элементами
          if (!connectionExists(connections, draggingConnection.id, targetId)) {
            createConnection({
              from: draggingConnection.id,
              to: targetId
            });
          }
        } else if (draggingConnection.type === 'scene' && targetType === 'element') {
          // Связь от сцены к элементу
          if (!connectionExists(connections, draggingConnection.id, targetId)) {
            createConnection({
              from: draggingConnection.id,
              to: targetId
            });
          }
        } else if (draggingConnection.type === 'element' && targetType === 'scene') {
          // Связь от элемента к сцене
          if (!connectionExists(connections, draggingConnection.id, targetId)) {
            createConnection({
              from: draggingConnection.id,
              to: targetId
            });
          }
        }
      }
      
      // Очищаем состояние создания связи
      setDraggingConnection(null);
      setConnectionMousePos(null);
      return;
    }
    
    // Обработка завершения перетаскивания элемента
    if (draggingElementId) {
      const element = elements ? elements.find(e => e.id === draggingElementId) : null;
      if (element) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = screenToWorld(x, y);
        
        // Если было перетаскивание - обновляем позицию
        if (localPositions2D[element.id]) {
          const finalPosition = localPositions2D[element.id];
          
          // Обновляем 2D позицию (для отображения)
          updateElementPosition2D(element.id, finalPosition);
          
          // ВАЖНО: Также обновляем 3D позицию и отправляем на сервер (только для worker/block)
          // Y остается 1 (высота), X и Z берутся из 2D позиции
          if (element.position) {
            const newPosition3D = [finalPosition[0], element.position?.[1] || 1, finalPosition[1]];
            updateElement(element.id, { position: newPosition3D });
          } else if (element.elementType === 'scene') {
            // Для сцен обновляем position_2d
            updateElement(element.id, { position_2d: finalPosition });
          }
          
          // Проверяем, над какой сценой отпустили элемент
          let targetSceneId = null;
          let isExtracting = false;
          
          // Если элемент уже находится в сцене, проверяем, вышла ли он за пределы
          if (element.parent_id) {
            const parentScene = allScenes.find(s => s.id === element.parent_id);
            if (parentScene) {
              const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
              const [parentWorldWidth, parentWorldHeight] = getSceneSize(parentScene);
              
              const dx = Math.abs(finalPosition[0] - parentX);
              const dz = Math.abs(finalPosition[1] - parentZ);
              
              // Размер блока элемента
              const blockSize = 60; // Половина размера блока (120/2)
              
              // Если элемент вышел за пределы родителя, извлекаем
              if (dx + blockSize > parentWorldWidth / 2 || dz + blockSize > parentWorldHeight / 2) {
                isExtracting = true;
                targetSceneId = null;
              } else {
                // Остаемся внутри родителя
                targetSceneId = element.parent_id;
              }
            }
          }
          
          // Если не извлекаем, проверяем, над какой сценой отпустили
          if (!isExtracting) {
            for (const scene of allScenes) {
              if (scene.id === element.parent_id) continue; // Пропускаем текущего родителя
              
              const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
              const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
              
              const dx = Math.abs(worldPos.x - sceneX);
              const dz = Math.abs(worldPos.z - sceneZ);
              
              if (dx <= sceneWorldWidth / 2 && dz <= sceneWorldHeight / 2) {
                targetSceneId = scene.id;
                break;
              }
            }
          }
          
          // Устанавливаем новую сцену, если изменилась
          if (targetSceneId !== (element.parent_id || null)) {
            setElementScene(element.id, targetSceneId);
          }
          
          // Очищаем локальную позицию
          setLocalPositions2D(prev => {
            const newPositions = { ...prev };
            delete newPositions[draggingElementId];
            return newPositions;
          });
        }
      }
      
      setIsDragging(false);
      setDraggingElementId(null);
      return; // Не обрабатываем перетаскивание сцены, если перетаскивали элемент
    }
    
    if (draggingSceneId) {
      dragStartScenePosRef.current = null;
      dragStartMousePosRef.current = null;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldPos = screenToWorld(x, y);
      const draggedScene = allScenes.find(s => s.id === draggingSceneId);
      
      // Получаем текущую абсолютную позицию из localPositions (если перетаскиваем) или вычисляем
      // localPositions содержит абсолютную позицию, которая обновляется при каждом движении мыши
      let currentAbsolutePos = localPositions[draggingSceneId];
      if (!currentAbsolutePos || !Array.isArray(currentAbsolutePos) || currentAbsolutePos.length !== 2) {
        // Если нет позиции в localPositions, вычисляем абсолютную позицию
        currentAbsolutePos = getSceneAbsolutePosition(draggedScene);
      }
      
      // Проверяем, над какой сценой отпустили
      let targetParentId = null;
      let isExtracting = false;
      
      // Если перетаскиваем дочернюю сцену, проверяем, вышла ли она за пределы родителя
      if (draggedScene?.parent_id) {
        const parent = allScenes.find(s => s.id === draggedScene.parent_id);
        if (parent) {
          const [parentX, parentZ] = getSceneAbsolutePosition(parent);
          const [parentWorldWidth, parentWorldHeight] = getSceneSize(parent);
          
          // Проверяем позицию самой сцены относительно родителя
          const [sceneX, sceneZ] = currentAbsolutePos;
          const dx = Math.abs(sceneX - parentX);
          const dz = Math.abs(sceneZ - parentZ);
          
          // Получаем размер дочерней сцены для более точной проверки
          const [childWidth, childHeight] = getSceneSize(draggedScene);
          const halfChildWidth = childWidth / 2;
          const halfChildHeight = childHeight / 2;
          const halfParentWidth = parentWorldWidth / 2;
          const halfParentHeight = parentWorldHeight / 2;
          
          // Если центр сцены + её половина размера выходит за пределы родителя, извлекаем
          // Это позволяет извлечь сцену, когда она частично выходит за границы
          if (dx + halfChildWidth > halfParentWidth || dz + halfChildHeight > halfParentHeight) {
            // Вышли за пределы родителя - вытаскиваем
            isExtracting = true;
            targetParentId = null;
            console.log('🔓 Извлечение дочерней сцены:', {
              sceneId: draggingSceneId,
              parentId: draggedScene.parent_id,
              scenePos: { x: sceneX, z: sceneZ },
              parentPos: { x: parentX, z: parentZ },
              parentSize: { w: parentWorldWidth, h: parentWorldHeight },
              childSize: { w: childWidth, h: childHeight },
              distance: { dx, dz },
              check: { 
                xCheck: dx + halfChildWidth > halfParentWidth,
                zCheck: dz + halfChildHeight > halfParentHeight
              }
            });
          } else {
            // Остаемся внутри родителя
            targetParentId = draggedScene.parent_id;
          }
        }
      }
      
      // Если не вытаскиваем, проверяем, над какой сценой отпустили (для вложения)
      if (!isExtracting) {
        for (const scene of allScenes) {
          if (scene.id === draggingSceneId) continue;
          // Пропускаем текущего родителя, если остаемся внутри него
          if (draggedScene?.parent_id === scene.id && targetParentId === scene.id) continue;
          
          const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
          const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
          
          const dx = Math.abs(worldPos.x - sceneX);
          const dz = Math.abs(worldPos.z - sceneZ);
          
          if (dx <= sceneWorldWidth / 2 && dz <= sceneWorldHeight / 2) {
            // Проверяем, не пытаемся ли вложить родителя в дочернюю
            let isChild = false;
            let currentId = scene.id;
            while (currentId) {
              const currentScene = allScenes.find(s => s.id === currentId);
              if (!currentScene || !currentScene.parent_id) break;
              if (currentScene.parent_id === draggingSceneId) {
                isChild = true;
                break;
              }
              currentId = currentScene.parent_id;
            }
            
            if (!isChild) {
              // Вкладываем в эту сцену
              targetParentId = scene.id;
              break;
            }
          }
        }
      } else {
        // Если вытаскиваем, проверяем, не попали ли на другую сцену - тогда вкладываем в неё
        for (const scene of allScenes) {
          if (scene.id === draggingSceneId) continue;
          if (draggedScene?.parent_id === scene.id) continue; // Пропускаем старого родителя
          
          const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
          const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
          
          const dx = Math.abs(worldPos.x - sceneX);
          const dz = Math.abs(worldPos.z - sceneZ);
          
          if (dx <= sceneWorldWidth / 2 && dz <= sceneWorldHeight / 2) {
            // Проверяем, не пытаемся ли вложить родителя в дочернюю
            let isChild = false;
            let currentId = scene.id;
            while (currentId) {
              const currentScene = allScenes.find(s => s.id === currentId);
              if (!currentScene || !currentScene.parent_id) break;
              if (currentScene.parent_id === draggingSceneId) {
                isChild = true;
                break;
              }
              currentId = currentScene.parent_id;
            }
            
            if (!isChild) {
              // Вкладываем в эту сцену вместо извлечения
              targetParentId = scene.id;
              isExtracting = false;
              console.log('✅ Вместо извлечения вкладываем в другую сцену:', scene.id);
              break;
            }
          }
        }
      }
      
      // Устанавливаем нового родителя, если изменился
      const parentChanged = targetParentId !== draggedScene?.parent_id;
      
      console.log('🔍 handleMouseUp:', {
        draggingSceneId,
        currentParent: draggedScene?.parent_id,
        targetParentId,
        isExtracting,
        parentChanged,
        currentAbsolutePos
      });
      
      if (parentChanged) {
        // Изменился родитель - пересчитываем layout всех дочерних сцен
        const newParentId = targetParentId || null;
        
        // Связи больше не удаляются при вложении - они сохраняются и отображаются как пометки
        
        // Если вытаскиваем из родителя, используем позицию курсора мыши
        if (!newParentId && draggedScene?.parent_id) {
          // Вытаскиваем из родителя - используем позицию курсора мыши в момент отпускания
          // Это самое простое и точное решение - сцена будет там, где курсор
          const extractedPos = [worldPos.x, worldPos.z];
          
          // Стандартный размер для корневых сцен
          const standardSize = [200, 150];
          
          
          // Обновляем localPositions, чтобы сцена оставалась на месте визуально
          setLocalPositions(prev => ({
            ...prev,
            [draggingSceneId]: extractedPos
          }));
          
          // Устанавливаем позицию И parent_id одновременно в одной транзакции
          setSceneParent(draggingSceneId, newParentId, extractedPos);
          
          // Устанавливаем стандартный размер после небольшой задержки, чтобы parent_id успел обновиться
          setTimeout(() => {
            updateSceneSize(draggingSceneId, standardSize);
            // Очищаем localSizes после установки размера
            setLocalSizes(prev => {
              const newSizes = { ...prev };
              delete newSizes[draggingSceneId];
              return newSizes;
            });
          }, 100);
        } else {
          // Меняем только родителя (вложение)
          setSceneParent(draggingSceneId, newParentId);
        }
        
        // Если вкладываем в родителя, нужно пересчитать layout всех его дочерних
        if (newParentId) {
          const parent = allScenes.find(s => s.id === newParentId);
          if (parent) {
            // Получаем все дочерние сцены родителя (включая только что вложенную)
            const allChildren = (allScenes || []).filter(s => s.parent_id === newParentId);
            
            // Вычисляем новый layout
            const layout = calculateChildrenLayout(parent, allChildren);
            
            // Обновляем позиции всех дочерних сцен
            layout.forEach(({ sceneId, position }) => {
              updateScenePosition(sceneId, position);
            });
          }
        } else if (draggedScene?.parent_id) {
          // Вытаскиваем из родителя - пересчитываем layout оставшихся дочерних
          const oldParent = allScenes.find(s => s.id === draggedScene.parent_id);
          if (oldParent) {
            const remainingChildren = (allScenes || []).filter(s => s.parent_id === oldParent.id && s.id !== draggingSceneId);
            if (remainingChildren.length > 0) {
              const layout = calculateChildrenLayout(oldParent, remainingChildren);
              layout.forEach(({ sceneId, position }) => {
                updateScenePosition(sceneId, position);
              });
            }
          }
        }
      } else {
        // Родитель не изменился - просто перемещаем
        let newPosition;
        if (draggedScene?.parent_id) {
          // Дочерняя сцена перемещается внутри родителя
          const parent = allScenes.find(s => s.id === draggedScene.parent_id);
          if (parent) {
            const parentPos = getSceneAbsolutePosition(parent);
            newPosition = [
              currentAbsolutePos[0] - parentPos[0],
              currentAbsolutePos[1] - parentPos[1]
            ];
          } else {
            newPosition = currentAbsolutePos;
          }
        } else {
          // Родительская сцена - абсолютная позиция
          newPosition = currentAbsolutePos;
        }
        
        updateScenePosition(draggingSceneId, newPosition);
      }
      
      // Очищаем локальные позиции
      setLocalPositions(prev => {
        const newPos = { ...prev };
        delete newPos[draggingSceneId];
        return newPos;
      });
    }
    
    setIsDragging(false);
    setDraggingSceneId(null);
    setHoveredSceneId(null);
    
    // Очищаем refs для отслеживания клика
    // clickStartRef будет очищен в handleClick, если это был клик
    // Если это было перетаскивание, очищаем здесь
    if (wasDraggingRef.current) {
      clickStartRef.current = null;
      wasDraggingRef.current = false;
    }
  }, [draggingSceneId, draggingElementId, draggingConnection, allScenes, elements, localPositions, localPositions2D, updateScenePosition, updateElementPosition2D, setSceneParent, setElementScene, updateSceneSize, calculateChildrenLayout, getSceneAbsolutePosition, getSceneSize, screenToWorld, getElementPosition2D, isPointInBlock, isPointInScene, sceneConnections, connections, createConnection, setDraggingConnection, setConnectionMousePos, zoom, setLocalPositions, setLocalPositions2D, setLocalSizes, setIsDragging, setDraggingSceneId, setDraggingElementId, setHoveredSceneId, wasDraggingRef, clickStartRef]);

  const handleClick = useCallback((e) => {
    // Если было перетаскивание, не обрабатываем клик
    if (wasDraggingRef.current || !clickStartRef.current) {
      clickStartRef.current = null;
      wasDraggingRef.current = false;
      return;
    }
    
    // В режиме создания связи клики обрабатываются в handleMouseDown
    // Здесь мы только сбрасываем выделение при клике на пустое место
    if (connectMode) {
      clickStartRef.current = null;
      wasDraggingRef.current = false;
      return;
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // СНАЧАЛА проверяем клик по элементу (элементы имеют приоритет над сценами)
    const workerAndBlockElements = elements ? elements.filter(e => e.elementType !== 'scene') : [];
    let clickedElement = null;
    if (workerAndBlockElements.length > 0) {
      for (let i = workerAndBlockElements.length - 1; i >= 0; i--) {
        const element = workerAndBlockElements[i];
        const position2D = getElementPosition2D(element);
        const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
        
        if (isPointInBlock(x, y, sx, sy)) {
          clickedElement = element;
          break;
        }
      }
    }
    
    if (clickedElement) {
      // Клик по элементу - выделяем его (только если не было перетаскивания)
      if (!wasDraggingRef.current) {
        selectElement(clickedElement.id);
        setSelectedSceneId(null); // Снимаем выделение со сцены
      }
      clickStartRef.current = null;
      wasDraggingRef.current = false;
      return;
    }
    
    // Проверяем, был ли клик по сцене
    let clickedScene = null;
    
    // Сначала проверяем дочерние сцены
    for (const parentScene of (allScenes || []).filter(s => !s.parent_id)) {
      const children = (allScenes || []).filter(s => s.parent_id === parentScene.id);
      if (children.length > 0) {
        const layout = calculateChildrenLayout(parentScene, children);
        const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
        
        for (const { sceneId, position, size } of layout) {
          const child = children.find(c => c.id === sceneId);
          if (child) {
            const childAbsoluteX = parentX + position[0];
            const childAbsoluteZ = parentZ + position[1];
            const [childWorldWidth, childWorldHeight] = size;
            const childWidth = childWorldWidth * zoom;
            const childHeight = childWorldHeight * zoom;
            
            if (isPointInScene(x, y, childAbsoluteX, childAbsoluteZ, childWidth, childHeight)) {
              clickedScene = child;
              break;
            }
          }
        }
        if (clickedScene) break;
      }
    }
    
    // Если не кликнули по дочерней, проверяем родительские сцены
    if (!clickedScene) {
      for (const scene of (allScenes || []).filter(s => !s.parent_id)) {
        const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
        const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
        const sceneWidth = sceneWorldWidth * zoom;
        const sceneHeight = sceneWorldHeight * zoom;
        
        if (isPointInScene(x, y, sceneX, sceneZ, sceneWidth, sceneHeight)) {
          clickedScene = scene;
          break;
        }
      }
    }
    
    // Если кликнули по сцене, выделяем её и снимаем выделение с элемента
    if (clickedScene) {
      setSelectedSceneId(clickedScene.id);
      selectElement(null); // Снимаем выделение с элемента
    } else {
      // Кликнули на пустое место - сбрасываем все выделения
      setSelectedSceneId(null);
      selectElement(null);
    }
    
    clickStartRef.current = null;
    wasDraggingRef.current = false;
  }, [allScenes, selectedSceneId, zoom, getSceneAbsolutePosition, getSceneSize, isPointInScene, wasDraggingRef, clickStartRef, setSelectedSceneId, calculateChildrenLayout, elements, getElementPosition2D, isPointInBlock, selectElement, worldToScreen]);

  const handleDoubleClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Сначала проверяем дочерние сцены
    for (const parentScene of (allScenes || []).filter(s => !s.parent_id)) {
      const children = (allScenes || []).filter(s => s.parent_id === parentScene.id);
      if (children.length > 0) {
        const layout = calculateChildrenLayout(parentScene, children);
        const [parentX, parentZ] = getSceneAbsolutePosition(parentScene);
        
        for (const { sceneId, position, size } of layout) {
          const child = children.find(c => c.id === sceneId);
          if (child) {
            const childAbsoluteX = parentX + position[0];
            const childAbsoluteZ = parentZ + position[1];
            const [childWorldWidth, childWorldHeight] = size;
            const childWidth = childWorldWidth * zoom;
            const childHeight = childWorldHeight * zoom;
            
            if (isPointInScene(x, y, childAbsoluteX, childAbsoluteZ, childWidth, childHeight)) {
              loadScene(child.id);
              if (onSceneSelect) {
                onSceneSelect(child.id);
              }
              return;
            }
          }
        }
      }
    }
    
    // Если не кликнули по дочерней, проверяем родительские сцены
    for (const scene of (allScenes || []).filter(s => !s.parent_id)) {
      const [sceneX, sceneZ] = getSceneAbsolutePosition(scene);
      const [sceneWorldWidth, sceneWorldHeight] = getSceneSize(scene);
      const sceneWidth = sceneWorldWidth * zoom;
      const sceneHeight = sceneWorldHeight * zoom;
      
      if (isPointInScene(x, y, sceneX, sceneZ, sceneWidth, sceneHeight)) {
        loadScene(scene.id);
        if (onSceneSelect) {
          onSceneSelect(scene.id);
        }
        break;
      }
    }
  }, [allScenes, loadScene, onSceneSelect, zoom, getSceneAbsolutePosition, getSceneSize, calculateChildrenLayout, isPointInScene]);

  // Привязка обработчиков событий к canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('dblclick', handleDoubleClick);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleClick, handleDoubleClick]);

  // Обработчики для создания и удаления сцен
  const handleCreateScene = async (sceneData) => {
    if (!socket || !socket.connected) {
      throw new Error('Socket не подключен');
    }

    // Вычисляем позицию новой сцены в центре экрана
    const center = getCanvasCenter();
    const newSceneData = {
      ...sceneData,
      position_2d: [center.x, center.z]
    };

    return new Promise((resolve, reject) => {
      socket.emit('scene:create', newSceneData);

      const handleSceneCreated = (newScene) => {
        socket.off('scene:created', handleSceneCreated);
        socket.off('error', handleError);
        loadAllScenes();
        resolve(newScene);
      };

      const handleError = ({ message }) => {
        socket.off('scene:created', handleSceneCreated);
        socket.off('error', handleError);
        reject(new Error(message));
      };

      socket.once('scene:created', handleSceneCreated);
      socket.once('error', handleError);

      setTimeout(() => {
        socket.off('scene:created', handleSceneCreated);
        socket.off('error', handleError);
        reject(new Error('Таймаут при создании сцены'));
      }, 10000);
    });
  };

  const handleDeleteClick = (sceneId) => {
    const scene = allScenes.find(s => s.id === sceneId);
    if (scene) {
      setDeleteModalScene(scene);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalScene || !socket || !socket.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      socket.emit('scene:delete', deleteModalScene.id);

      const handleSceneDeleted = ({ id }) => {
        socket.off('scene:deleted', handleSceneDeleted);
        socket.off('error', handleError);
        loadAllScenes();
        resolve();
      };

      const handleError = ({ message }) => {
        socket.off('scene:deleted', handleSceneDeleted);
        socket.off('error', handleError);
        reject(new Error(message));
      };

      socket.once('scene:deleted', handleSceneDeleted);
      socket.once('error', handleError);

      setTimeout(() => {
        socket.off('scene:deleted', handleSceneDeleted);
        socket.off('error', handleError);
        reject(new Error('Таймаут при удалении сцены'));
      }, 10000);
    });
  };

  return (
    <div className="scenes-view-container">
      {/* Toolbar in style of workspace Toolbar */}
      <div className="scenes-toolbar">
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => setIsElementTypeModalOpen(true)}
            title="Создать элемент (N)"
          >
            ➕ New Element
          </button>
          <button
            className="toolbar-btn"
            onClick={() => handleDeleteClick(selectedSceneId)}
            disabled={!selectedSceneId}
            title="Удалить сцену"
          >
            🗑️ Delete
          </button>
        </div>

        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${connectMode ? 'active' : ''}`}
            onClick={() => {
              setConnectMode(!connectMode);
              setConnectingFrom(null);
            }}
            title="Режим создания связей"
          >
            🔗 {connectMode ? 'Exit Connect' : 'Connect Mode'}
          </button>
        </div>

        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
            title={`Переключить на ${viewMode === '2d' ? '3D' : '2D'} вид`}
          >
            {viewMode === '2d' ? '🎮 3D View' : '📊 2D View'}
          </button>
        </div>
      </div>

      {/* Floating Scene Properties - показываем только если выбрана сцена, но не сущность */}
      {selectedSceneId && !selectedElementId && (
        <SceneProperties
          selectedScene={allScenes.find(s => s.id === selectedSceneId) || null}
          socket={socket}
          onSceneUpdated={(sceneId, updates) => {
            // Обновление произойдет через событие scene:updated от сервера
          }}
        />
      )}
      
      {/* Element Properties Panel - показываем только если выбран элемент */}
      {selectedElementId && <PropertiesPanel />}

        <div className="scenes-view-content" ref={containerRef}>
        {loading ? (
          <div className="scenes-view-loading">Загрузка сцен...</div>
        ) : allScenes.length === 0 ? (
          <div className="scenes-view-empty">
            <p>У вас пока нет элементов</p>
            <button
              className="btn-create-first"
              onClick={() => setIsElementTypeModalOpen(true)}
            >
              Создать первый элемент
            </button>
          </div>
        ) : viewMode === '3d' ? (
          <ScenesCanvas3D />
        ) : (
          <canvas ref={canvasRef} className="scenes-canvas-2d" />
        )}
        </div>

      <CreateSceneModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateScene}
      />

      <DeleteSceneModal
        isOpen={!!deleteModalScene}
        onClose={() => setDeleteModalScene(null)}
        onConfirm={handleDeleteConfirm}
        sceneName={deleteModalScene?.name}
      />

      <ElementTypeModal
        isOpen={isElementTypeModalOpen}
        onClose={() => setIsElementTypeModalOpen(false)}
        onSelectType={(elementType) => {
          setIsElementTypeModalOpen(false);
          switch (elementType) {
            case 'scene':
              setIsCreateModalOpen(true);
              break;
            case 'worker':
              setIsWorkerModalOpen(true);
              break;
            case 'block':
              setIsBlockModalOpen(true);
              break;
            default:
              console.error('Unknown element type:', elementType);
          }
        }}
      />

      <CreateWorkerModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        onCreate={async (workerData) => {
          try {
            const center = getCanvasCenter();
            const position = [center.x, 1, center.z];
            
            createElement({
              position: position,
              size: [1, 1, 1],
              name: workerData.name,
              description: workerData.description || '',
              color: workerData.color || '#3b82f6',
              emissive: workerData.emissive || '#000000',
              type: workerData.type || 'worker',
              elementType: 'worker'
            });
            setIsWorkerModalOpen(false);
          } catch (error) {
            console.error('Ошибка создания воркера:', error);
            throw error;
          }
        }}
      />

      <CreateBlockModal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        onCreate={async (blockData) => {
          try {
            const center = getCanvasCenter();
            const position = [center.x, 1, center.z];
            
            createElement({
              position: position,
              size: [1, 1, 1],
              name: blockData.name,
              description: blockData.description || '',
              color: blockData.color || '#3b82f6',
              type: 'block',
              elementType: 'block'
            });
            setIsBlockModalOpen(false);
          } catch (error) {
            console.error('Ошибка создания блока:', error);
            throw error;
          }
        }}
      />
    </div>
  );
}

export default ScenesView;
