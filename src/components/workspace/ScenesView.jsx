import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import CreateSceneModal from './CreateSceneModal';
import DeleteSceneModal from './DeleteSceneModal';
import SceneProperties from './SceneProperties';
import ScenesCanvas3D from './ScenesCanvas3D';
import EntityTypeModal from './EntityTypeModal';
import { ENTITY_TYPES } from './EntityShape';
import './ScenesView.css';

function ScenesView({ onSceneSelect }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
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
  // Состояния для работы с entities
  const [hoveredEntityId, setHoveredEntityId] = useState(null);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [draggingEntityId, setDraggingEntityId] = useState(null);
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
  
  const socket = useSceneStore((state) => state.socket);
  const socketConnected = useSceneStore((state) => state.socketConnected);
  const currentSceneId = useSceneStore((state) => state.currentSceneId);
  const loadScene = useSceneStore((state) => state.loadScene);
  const allScenes = useSceneStore((state) => state.allScenes);
  const sceneConnections = useSceneStore((state) => state.sceneConnections);
  const loadAllScenes = useSceneStore((state) => state.loadAllScenes);
  const updateScenePosition = useSceneStore((state) => state.updateScenePosition);
  const setSceneParent = useSceneStore((state) => state.setSceneParent);
  const createSceneConnection = useSceneStore((state) => state.createSceneConnection);
  const updateSceneSize = useSceneStore((state) => state.updateSceneSize);
  const createEntity = useSceneStore((state) => state.createEntity);
  // Добавляем entities и connections для отображения
  const entities = useSceneStore((state) => state.entities);
  const connections = useSceneStore((state) => state.connections);
  const getEntityPosition2D = useSceneStore((state) => state.getEntityPosition2D);

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
    socket.on('scene-connection:deleted', handleConnectionDeleted);
    socket.on('error', handleError);
    
    return () => {
      socket.off('scene:created', handleSceneCreated);
      socket.off('scene:deleted', handleSceneDeleted);
      socket.off('scene:updated-position', handleSceneUpdated);
      socket.off('scene:updated', handleSceneNameUpdated);
      socket.off('scene:parent-updated', handleParentUpdated);
      socket.off('scene-connection:deleted', handleConnectionDeleted);
      socket.off('error', handleError);
    };
  }, [socket, socketConnected, loadAllScenes]);

  useEffect(() => {
    // Если сцены загружены (даже если их 0), убираем индикатор загрузки
    if (socket && socketConnected) {
      // Даем небольшую задержку для загрузки данных
      const timer = setTimeout(() => {
        setLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [socket, socketConnected, allScenes.length]);

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
  // Адаптировано для работы с entities (как в Canvas2D)
  const worldToScreen = (x, z) => {
    const { width, height } = getCanvasSize();
    const centerX = width / 2;
    const centerY = height / 2;
    return {
      x: centerX + (x + pan.x) * zoom,
      y: centerY - (z + pan.y) * zoom // Используем Z как вертикаль в 2D
    };
  };

  // Преобразование экранных координат в мировые
  const screenToWorld = (x, y) => {
    return {
      x: (x - pan.x) / zoom,
      z: (y - pan.y) / zoom
    };
  };

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
      
      // Отрисовка связей
      const drawConnection = (ctx, connection) => {
        const fromScene = allScenes.find(s => s.id === connection.from);
        const toScene = allScenes.find(s => s.id === connection.to);
        
        if (!fromScene || !toScene) return;
        
        // Проверяем, является ли одна из сцен дочерней другой в этой связи
        // Если toScene является дочерней fromScene, не рисуем стрелку (будет пометка на дочерней сцене)
        // Если fromScene является дочерней toScene, не рисуем стрелку (будет пометка на дочерней сцене)
        const isToSceneChildOfFrom = toScene.parent_id === fromScene.id;
        const isFromSceneChildOfTo = fromScene.parent_id === toScene.id;
        
        // Если одна из сцен является дочерней другой, не рисуем стрелку
        // Пометка будет нарисована в drawScene
        if (isToSceneChildOfFrom || isFromSceneChildOfTo) {
          return; // Связь будет показана как пометка на дочерней сцене
        }
        
        // Обе сцены независимы - рисуем стрелку как обычно
        // Используем getSceneAbsolutePositionWithLayout для правильного позиционирования дочерних сцен
        const [fromX, fromZ] = getSceneAbsolutePositionWithLayout(fromScene);
        const [toX, toZ] = getSceneAbsolutePositionWithLayout(toScene);
        const fromScreen = worldToScreen(fromX, fromZ);
        const toScreen = worldToScreen(toX, toZ);
        
        // Рисуем линию связи с более ярким цветом и большей толщиной для лучшей видимости
        ctx.strokeStyle = connection.color || '#00ff00'; // Зеленый по умолчанию для лучшей видимости
        ctx.lineWidth = Math.max(2, 3 * zoom); // Минимум 2px, увеличивается с зумом
        ctx.shadowColor = 'rgba(0, 255, 0, 0.5)'; // Добавляем свечение для лучшей видимости
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.lineTo(toScreen.x, toScreen.y);
        ctx.stroke();
        ctx.shadowBlur = 0; // Сбрасываем тень
        
        // Стрелка на конце связи
        const angle = Math.atan2(toScreen.y - fromScreen.y, toScreen.x - fromScreen.x);
        const arrowLength = Math.max(8, 12 * zoom);
        const arrowWidth = Math.max(4, 6 * zoom);
        ctx.strokeStyle = connection.color || '#00ff00';
        ctx.lineWidth = Math.max(2, 3 * zoom);
        ctx.beginPath();
        ctx.moveTo(toScreen.x, toScreen.y);
        ctx.lineTo(
          toScreen.x - arrowLength * Math.cos(angle - Math.PI / 6),
          toScreen.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(toScreen.x, toScreen.y);
        ctx.lineTo(
          toScreen.x - arrowLength * Math.cos(angle + Math.PI / 6),
          toScreen.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      };
      
      // Отрисовка сущности (entity)
      const drawEntity = (ctx, entity) => {
        // Если блок перетаскивается, используем локальную позицию
        let position2D;
        if (draggingEntityId === entity.id) {
          if (!localPositions2D[entity.id]) {
            return;
          }
          position2D = localPositions2D[entity.id];
        } else {
          // Для не перетаскиваемых блоков используем позицию из store
          position2D = getEntityPosition2D(entity);
        }
        
        const { x, y } = worldToScreen(position2D[0], position2D[1]);
        const isSelected = selectedEntityId === entity.id;
        const entityType = ENTITY_TYPES[entity.type] || ENTITY_TYPES.box;
        
        // Размеры блока
        const blockWidth = 120 * zoom;
        const blockHeight = 80 * zoom;
        const padding = 10 * zoom;
        const cornerRadius = 8 * zoom;
        
        // Позиция блока (центрирование)
        const blockX = x - blockWidth / 2;
        const blockY = y - blockHeight / 2;
        
        // Базовый цвет
        const baseColor = entity.color || '#3b82f6';
        
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
        if (entityType.icon && zoom > 0.2) {
          const iconSize = Math.max(20, Math.min(blockHeight * 0.35, 32));
          ctx.font = `${iconSize}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(entityType.icon, x, blockY + padding + iconSize / 2);
        }
        
        // Имя сущности в нижней части блока
        if (entity.name && zoom > 0.2) {
          const fontSize = Math.max(10, Math.min(blockHeight * 0.2, 14));
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 4;
          
          // Обрезаем текст, если он слишком длинный
          const maxWidth = blockWidth - padding * 2;
          let displayName = entity.name;
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
        const hasConnections = connections && connections.some(c => c.from === entity.id || c.to === entity.id);
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
        if (hoveredEntityId === entity.id && draggingEntityId !== entity.id) {
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
        if (scene.parent_id) {
          const parent = allScenes.find(s => s.id === scene.parent_id);
          if (parent) {
            // Проверяем, есть ли связь между этой сценой и её родителем
            const connectionWithParent = sceneConnections.find(
              conn => (conn.from === scene.id && conn.to === parent.id) ||
                      (conn.from === parent.id && conn.to === scene.id)
            );
            
            if (connectionWithParent) {
              // Рисуем маленькую пометку в правом верхнем углу дочерней сцены
              const markerSize = Math.max(6, 8 * zoom);
              const markerX = sceneWidth / 2 - markerSize - 2;
              const markerY = -sceneHeight / 2 + markerSize + 2;
              
              const connectionColor = connectionWithParent.color || '#00ff00';
              ctx.fillStyle = connectionColor;
              ctx.beginPath();
              ctx.arc(markerX, markerY, markerSize, 0, Math.PI * 2);
              
              // Добавляем свечение
              ctx.shadowColor = connectionColor + 'CC';
              ctx.shadowBlur = 4;
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }
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
      // Затем рисуем связи поверх сцен, чтобы они были видны
      sceneConnections.forEach(conn => drawConnection(ctx, conn));
      
      // Рисуем entities (сущности)
      if (entities && entities.length > 0) {
        entities.forEach(entity => {
          // Пропускаем перетаскиваемую сущность в основном цикле
          if (draggingEntityId === entity.id) {
            return;
          }
          drawEntity(ctx, entity);
        });
        
        // Перетаскиваемая сущность рисуется последней (поверх всего)
        if (draggingEntityId) {
          const draggedEntity = entities.find(e => e.id === draggingEntityId);
          if (draggedEntity) {
            drawEntity(ctx, draggedEntity);
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
    };
    
    redraw();
    
    // Анимация мигания для entities без соединений
    const animationFrameId = requestAnimationFrame(function animate() {
      setAnimationTime(Date.now());
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
    
    // Добавляем обработчик wheel с passive: false для preventDefault
    const canvasElement = canvasRef.current;
    let handleWheelEvent = null;
    
    if (canvasElement) {
      handleWheelEvent = (e) => {
        e.preventDefault();
        
        const rect = canvasElement.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Преобразуем позицию курсора в мировые координаты (до изменения zoom)
        const worldPos = screenToWorld(mouseX, mouseY);
        
        // Вычисляем новый zoom
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.3, Math.min(3, zoom * delta));
        
        // Вычисляем новую позицию pan так, чтобы точка под курсором осталась на месте
        const newPan = {
          x: mouseX - worldPos.x * newZoom,
          y: mouseY - worldPos.z * newZoom
        };
        
        setZoom(newZoom);
        setPan(newPan);
      };
      
      canvasElement.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (canvasElement && handleWheelEvent) {
        canvasElement.removeEventListener('wheel', handleWheelEvent);
      }
    };
  }, [allScenes, sceneConnections, pan, zoom, selectedSceneId, hoveredSceneId, draggingSceneId, localPositions, localSizes, rootScenes, getSceneAbsolutePosition, getSceneAbsolutePositionWithLayout, worldToScreen, screenToWorld, getSceneSize, calculateChildrenLayout, connectMode, connectingFrom, entities, connections, selectedEntityId, hoveredEntityId, draggingEntityId, localPositions2D, animationTime, getEntityPosition2D]);

  // Обработчики мыши
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Сохраняем начальную позицию для определения клика vs перетаскивания
    clickStartRef.current = { x, y };
    wasDraggingRef.current = false;
    
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
          const connectionExists = sceneConnections.some(
            conn => conn.from === connectingFrom && conn.to === clickedScene.id
          );
          
          if (!connectionExists) {
            createSceneConnection(connectingFrom, clickedScene.id);
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
      setIsDragging(true);
      setDragStart({ x, y });
      setSelectedSceneId(null);
    }
  }, [allScenes, zoom, connectMode, connectingFrom, sceneConnections, getSceneAbsolutePosition, calculateChildrenLayout, getSceneSize, isPointInScene, screenToWorld, createSceneConnection, setSelectedSceneId, setDraggingSceneId, setIsDragging, setDragStart, setLocalPositions, setLocalSizes, setConnectingFrom, setConnectMode]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Проверяем, было ли перетаскивание (движение мыши более 5 пикселей)
    if (clickStartRef.current) {
      const moveDistance = Math.sqrt(
        Math.pow(x - clickStartRef.current.x, 2) + Math.pow(y - clickStartRef.current.y, 2)
      );
      if (moveDistance > 5) {
        wasDraggingRef.current = true;
      }
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
    } else if (isDragging && !draggingSceneId) {
      // Панорамирование
      // pan хранится в экранных координатах (пикселях), поэтому просто добавляем разницу
      const deltaX = x - dragStart.x;
      const deltaY = y - dragStart.y;
      setPan(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
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
        
        // Обновляем cursor
        if (canvasRef.current) {
          canvasRef.current.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
      }
    }, [isDragging, draggingSceneId, allScenes, zoom, pan, getSceneAbsolutePosition, getSceneSize, screenToWorld, setLocalPositions, setHoveredSceneId, setIsDragging, setPan, setDragStart, clickStartRef, wasDraggingRef]);

  const handleMouseUp = useCallback((e) => {
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
        console.log('✅ Изменяем родителя:', { from: draggedScene?.parent_id, to: newParentId });
        
        // Связи больше не удаляются при вложении - они сохраняются и отображаются как пометки
        
        // Если вытаскиваем из родителя, используем позицию курсора мыши
        if (!newParentId && draggedScene?.parent_id) {
          // Вытаскиваем из родителя - используем позицию курсора мыши в момент отпускания
          // Это самое простое и точное решение - сцена будет там, где курсор
          const extractedPos = [worldPos.x, worldPos.z];
          
          // Стандартный размер для корневых сцен
          const standardSize = [200, 150];
          
          console.log('📍 Извлечение дочерней сцены. Устанавливаем позицию и размер:', {
            sceneId: draggingSceneId,
            extractedPos,
            worldPos,
            standardSize,
            oldParent: draggedScene.parent_id
          });
          
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
  }, [draggingSceneId, allScenes, localPositions, updateScenePosition, setSceneParent, updateSceneSize, calculateChildrenLayout, getSceneAbsolutePosition, screenToWorld, setLocalPositions, setLocalSizes, setIsDragging, setDraggingSceneId, setHoveredSceneId, wasDraggingRef, clickStartRef]);

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
    
    // Если кликнули на пустое место, сбрасываем выделение
    if (!clickedScene) {
      setSelectedSceneId(null);
    }
    
    clickStartRef.current = null;
    wasDraggingRef.current = false;
  }, [allScenes, selectedSceneId, zoom, getSceneAbsolutePosition, getSceneSize, isPointInScene, wasDraggingRef, clickStartRef, setSelectedSceneId, calculateChildrenLayout]);

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
            onClick={() => setIsEntityModalOpen(true)}
            title="Создать сущность (N)"
          >
            ➕ New Personage
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setIsCreateModalOpen(true)}
            title="Создать новую сцену"
          >
            ➕ New Scene
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

      {/* Floating Scene Properties */}
      <SceneProperties
        selectedScene={allScenes.find(s => s.id === selectedSceneId) || null}
        socket={socket}
        onSceneUpdated={(sceneId, updates) => {
          // Обновление произойдет через событие scene:updated от сервера
        }}
      />

        <div className="scenes-view-content" ref={containerRef}>
        {loading ? (
          <div className="scenes-view-loading">Загрузка сцен...</div>
        ) : allScenes.length === 0 ? (
          <div className="scenes-view-empty">
            <p>У вас пока нет сцен</p>
            <button
              className="btn-create-first"
              onClick={() => setIsCreateModalOpen(true)}
            >
              Создать первую сцену
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

      <EntityTypeModal
        isOpen={isEntityModalOpen}
        onClose={() => setIsEntityModalOpen(false)}
        onSelectType={(type) => {
          // Создаем сущность в центре canvas
          const center = getCanvasCenter();
          const position = center ? [center.x, 1, center.z] : null;
          
          createEntity({
            position: position,
            size: [1, 1, 1],
            name: `Entity ${Date.now()}`,
            description: '',
            color: '#3b82f6',
            type: type || 'box'
          });
          
          setIsEntityModalOpen(false);
        }}
      />
    </div>
  );
}

export default ScenesView;
