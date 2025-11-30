import { useRef, useEffect, useState, useCallback } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { ENTITY_TYPES } from './EntityShape';
import './Canvas2D.css';

function Canvas2D() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const elements = useSceneStore((state) => state.elements);
  const connections = useSceneStore((state) => state.connections);
  const selectedElementId = useSceneStore((state) => state.selectedElementId);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const selectElement = useSceneStore((state) => state.selectElement);
  const selectConnection = useSceneStore((state) => state.selectConnection);
  const updateElement = useSceneStore((state) => state.updateElement);
  const updateElementPosition2D = useSceneStore((state) => state.updateElementPosition2D);
  const getElementPosition2D = useSceneStore((state) => state.getElementPosition2D);
  const initialize2DPositions = useSceneStore((state) => state.initialize2DPositions);
  const connectMode = useSceneStore((state) => state.connectMode);
  const createConnection = useSceneStore((state) => state.createConnection);
  const connectingFrom = useSceneStore((state) => state.connectingFrom);
  const setConnectingFrom = useSceneStore((state) => state.setConnectingFrom);
  const viewMode = useSceneStore((state) => state.viewMode);
  
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, z: 0 });
  const dragStartRef = useRef({ x: 0, z: 0 }); // Ref для актуального значения dragStart в замыканиях
  const [draggingElementId, setDraggingElementId] = useState(null);
  const [clickStart, setClickStart] = useState(null);
  const [hoveredElementId, setHoveredElementId] = useState(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [localPositions2D, setLocalPositions2D] = useState({}); // Локальные позиции для плавного перетаскивания
  const draggingUpdateTimeoutRef = useRef(null);
  const lastMousePositionRef = useRef(null); // Сохраняем последнюю позицию мыши для непрерывного обновления
  const [animationTime, setAnimationTime] = useState(0); // Время для анимации мигания
  const lastDraggedElementIdRef = useRef(null); // Сохраняем ID последнего перетаскиваемого блока для сохранения выделения

  // Получаем размеры canvas
  const getCanvasSize = () => {
    if (!containerRef.current) return { width: 0, height: 0 };
    return {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight
    };
  };

  // Преобразование координат мира в экранные координаты
  // В 2D мы используем X и Z координаты (Y остается фиксированным для высоты в 3D)
  const worldToScreen = (worldX, worldZ) => {
    const { width, height } = getCanvasSize();
    const centerX = width / 2;
    const centerY = height / 2;
    return {
      x: centerX + (worldX + pan.x) * zoom,
      y: centerY - (worldZ + pan.y) * zoom // Используем Z как вертикаль в 2D
    };
  };

  // Преобразование экранных координат в мировые
  // Возвращаем X и Z (Y остается фиксированным)
  const screenToWorld = (screenX, screenY) => {
    const { width, height } = getCanvasSize();
    const centerX = width / 2;
    const centerY = height / 2;
    return {
      x: (screenX - centerX) / zoom - pan.x,
      z: (centerY - screenY) / zoom - pan.y // Z используется как вертикаль в 2D
    };
  };
  
  // Получение размеров блока для сущности
  const getBlockSize = () => {
    return {
      width: 120 * zoom,
      height: 80 * zoom
    };
  };
  
  // Проверка, находится ли точка внутри блока
  const isPointInBlock = (pointX, pointY, blockX, blockY) => {
    const { width, height } = getBlockSize();
    const dx = Math.abs(pointX - blockX);
    const dy = Math.abs(pointY - blockY);
    return dx <= width / 2 && dy <= height / 2;
  };

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

  // Отрисовка элемента в виде блока блок-схемы
  const drawElement = (ctx, element) => {
    // КРИТИЧЕСКИ ВАЖНО: Если блок перетаскивается, он должен рисоваться ТОЛЬКО по локальной позиции
    // Эта функция НЕ должна вызываться для перетаскиваемого блока в основном цикле
    // (он пропускается там и рисуется отдельно)
    
    // Защита: если блок перетаскивается, но нет локальной позиции - не рисуем
    let position2D;
    if (draggingElementId === element.id) {
      if (!localPositions2D[element.id]) {
        return;
      }
      // Используем ТОЛЬКО локальную позицию
      position2D = localPositions2D[element.id];
    } else {
      // Для не перетаскиваемых блоков используем позицию из store
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
        // Сокращаем текст с многоточием
        while (ctx.measureText(displayName + '...').width > maxWidth && displayName.length > 0) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '...';
      }
      
      ctx.fillText(displayName, x, blockY + blockHeight - padding);
      ctx.shadowBlur = 0;
    }
    
    // Индикатор подключений
    const hasConnections = connections.some(c => c.from === element.id || c.to === element.id);
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
      // Используем синусоиду для плавного перехода между красным и желтым
      // animationTime в миллисекундах, период мигания ~1000ms
      const blinkPhase = (animationTime % 1000) / 1000; // 0 to 1
      const sinValue = Math.sin(blinkPhase * Math.PI * 2); // -1 to 1
      
      // Переход от красного к желтому и обратно
      // sinValue от -1 до 1, преобразуем в 0 до 1 для перехода между цветами
      const colorMix = (sinValue + 1) / 2; // 0 to 1
      
      // Красный: #ff0000, Желтый: #ffff00
      const red = Math.floor(255); // Всегда 255
      const green = Math.floor(255 * colorMix); // От 0 до 255
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
    
    // Подсветка при наведении (НЕ показываем для перетаскиваемого элемента)
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
    
    // Индикатор режима подключения
    if (connectMode && connectingFrom === element.id) {
      ctx.beginPath();
      ctx.moveTo(blockX - 8, blockY);
      ctx.lineTo(blockX - 8, blockY + blockHeight);
      ctx.lineTo(blockX + blockWidth + 8, blockY + blockHeight);
      ctx.lineTo(blockX + blockWidth + 8, blockY);
      ctx.closePath();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Возвращаем размеры блока для использования в других функциях
    return { width: blockWidth, height: blockHeight };
  };

  // Отрисовка соединения между блоками
  const drawConnection = (ctx, connection) => {
    const fromElement = elements.find(e => e.id === connection.from);
    const toElement = elements.find(e => e.id === connection.to);
    
    if (!fromElement || !toElement) return;
    
    const blockWidth = 120 * zoom;
    const blockHeight = 80 * zoom;
    
    // Для перетаскиваемых блоков ВСЕГДА используем локальную позицию, иначе из store
    const fromPos2D = (draggingElementId === fromElement.id && localPositions2D[fromElement.id])
      ? localPositions2D[fromElement.id]
      : (localPositions2D[fromElement.id] || getElementPosition2D(fromElement));
    const toPos2D = (draggingElementId === toElement.id && localPositions2D[toElement.id])
      ? localPositions2D[toElement.id]
      : (localPositions2D[toElement.id] || getElementPosition2D(toElement));
    const fromPos = worldToScreen(fromPos2D[0], fromPos2D[1]);
    const toPos = worldToScreen(toPos2D[0], toPos2D[1]);
    
    // Вычисляем точки на краях прямоугольных блоков
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    // Определяем точки подключения на краях блоков
    let fromX, fromY, toX, toY;
    
    // Находим ближайший край для начальной точки
    const fromHalfWidth = blockWidth / 2;
    const fromHalfHeight = blockHeight / 2;
    
    // Определяем, с какой стороны блока выходит соединение
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    if (absDx > absDy) {
      // Горизонтальное соединение
      fromX = fromPos.x + (dx > 0 ? fromHalfWidth : -fromHalfWidth);
      fromY = fromPos.y;
    } else {
      // Вертикальное соединение
      fromX = fromPos.x;
      fromY = fromPos.y + (dy > 0 ? fromHalfHeight : -fromHalfHeight);
    }
    
    // Находим ближайший край для конечной точки
    const toHalfWidth = blockWidth / 2;
    const toHalfHeight = blockHeight / 2;
    
    if (absDx > absDy) {
      // Горизонтальное соединение
      toX = toPos.x + (dx > 0 ? -toHalfWidth : toHalfWidth);
      toY = toPos.y;
    } else {
      // Вертикальное соединение
      toX = toPos.x;
      toY = toPos.y + (dy > 0 ? -toHalfHeight : toHalfHeight);
    }
    
    const isSelected = selectedConnectionId === connection.id;
    
    // Рисуем плавную кривую
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2 - Math.min(distance * 0.2, 30);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.quadraticCurveTo(midX, midY, toX, toY);
    
    // Цвет соединения
    const isHovered = hoveredConnectionId === connection.id;
    let strokeColor = connection.color || '#ffffff';
    if (isSelected) strokeColor = '#ffff00';
    else if (isHovered) strokeColor = '#88ccff';
    
    // Эффект свечения для выбранных и hovered связей
    if (isSelected || isHovered) {
      ctx.shadowColor = isSelected ? 'rgba(255, 255, 0, 0.6)' : 'rgba(136, 204, 255, 0.5)';
      ctx.shadowBlur = 8;
    }
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 4 : (isHovered ? 3 : 2);
    ctx.stroke();
    
    // Сбрасываем тень
    ctx.shadowBlur = 0;
    
    // Рисуем стрелку на конце связи
    // Получаем направление кривой в конечной точке для правильной ориентации стрелки
    const curveEndX = toX;
    const curveEndY = toY;
    const curveControlX = midX;
    const curveControlY = midY;
    
    // Вычисляем направление стрелки на конце связи
    // Для квадратичной кривой: P(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
    // Производная в t=1: P'(1) = 2(P2 - P1) = 2(to - mid)
    const arrowEndDx = 2 * (curveEndX - curveControlX);
    const arrowEndDy = 2 * (curveEndY - curveControlY);
    const arrowEndAngle = Math.atan2(arrowEndDy, arrowEndDx);
    
    // Вычисляем направление стрелки на начале связи (для bidirectional)
    // Производная в t=0: P'(0) = 2(P1 - P0) = 2(mid - from)
    const arrowStartDx = 2 * (curveControlX - fromX);
    const arrowStartDy = 2 * (curveControlY - fromY);
    const arrowStartAngle = Math.atan2(arrowStartDy, arrowStartDx) + Math.PI;
    
    const arrowLength = 12 * zoom;
    
    // Рисуем стрелку на конце связи
    ctx.beginPath();
    ctx.moveTo(curveEndX, curveEndY);
    ctx.lineTo(
      curveEndX - arrowLength * Math.cos(arrowEndAngle - Math.PI / 6),
      curveEndY - arrowLength * Math.sin(arrowEndAngle - Math.PI / 6)
    );
    ctx.moveTo(curveEndX, curveEndY);
    ctx.lineTo(
      curveEndX - arrowLength * Math.cos(arrowEndAngle + Math.PI / 6),
      curveEndY - arrowLength * Math.sin(arrowEndAngle + Math.PI / 6)
    );
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 4 : (isHovered ? 3 : 2);
    
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
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(
        fromX - arrowLength * Math.cos(arrowStartAngle - Math.PI / 6),
        fromY - arrowLength * Math.sin(arrowStartAngle - Math.PI / 6)
      );
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(
        fromX - arrowLength * Math.cos(arrowStartAngle + Math.PI / 6),
        fromY - arrowLength * Math.sin(arrowStartAngle + Math.PI / 6)
      );
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 4 : (isHovered ? 3 : 2);
      
      // Эффект свечения для стрелки
      if (isSelected || isHovered) {
        ctx.shadowColor = isSelected ? 'rgba(255, 255, 0, 0.6)' : 'rgba(136, 204, 255, 0.5)';
        ctx.shadowBlur = 8;
      }
      
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // Рисуем метку (label) если она есть
    if (connection.label) {
      const labelX = curveControlX;
      const labelY = curveControlY - 20;
      
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

  // Основная отрисовка
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const { width, height } = getCanvasSize();
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    
    // Фон
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Сетка
    drawGrid(ctx, width, height);
    
    // Соединения
    connections.forEach(connection => {
      drawConnection(ctx, connection);
    });
    
    // Сущности - ВАЖНО: пропускаем перетаскиваемую сущность, чтобы она не рисовалась дважды
    elements.forEach(element => {
      // КРИТИЧЕСКИ ВАЖНО: ВО ВРЕМЯ ПЕРЕТАСКИВАНИЯ полностью пропускаем перетаскиваемую сущность
      // Это гарантирует, что блок НИКОГДА не рисуется по старой позиции из store
      if (draggingElementId === element.id) {
        return; // НЕ рисуем в основном цикле - только отдельно с локальной позицией
      }
      // Остальные сущности рисуем нормально
      drawElement(ctx, element);
    });
    
    // Перетаскиваемая сущность рисуется последней (поверх всего) ТОЛЬКО с локальной позицией
    // КРИТИЧЕСКИ ВАЖНО: блок должен рисоваться ТОЛЬКО если есть локальная позиция
    if (draggingElementId) {
      const draggedElement = elements.find(e => e.id === draggingElementId);
      if (draggedEntity) {
        // Если нет локальной позиции, используем позицию из store как fallback
        // Это гарантирует, что блок всегда будет нарисован
        if (!localPositions2D[draggingElementId]) {
          // Это не должно происходить, но на всякий случай используем позицию из store
          const position2D = getEntityPosition2D(draggedEntity);
          // Создаем локальную позицию из store, чтобы блок был виден
          setLocalPositions2D(prev => ({
            ...prev,
            [draggingElementId]: [...position2D]
          }));
        }
        // Рисуем блок ТОЛЬКО по локальной позиции
        drawEntity(ctx, draggedEntity);
      }
    }
  }, [elements, connections, selectedElementId, selectedConnectionId, pan, zoom, hoveredElementId, hoveredConnectionId, connectMode, connectingFrom, localPositions2D, draggingElementId, getElementPosition2D]);

  // Инициализация 2D позиций и распределение блоков при переключении в 2D
  const lastViewModeRef = useRef(null);
  const distributionTimeoutRef = useRef(null);
  
  useEffect(() => {
    if (viewMode !== '2d' || elements.length === 0) {
      if (viewMode !== '2d') {
        lastViewModeRef.current = null; // Сбрасываем при переключении из 2D
      }
      return;
    }
    
    // Проверяем, переключились ли мы в 2D
    const justSwitchedTo2D = lastViewModeRef.current !== '2d';
    lastViewModeRef.current = viewMode;
    
    // Инициализируем 2D позиции и сразу распределяем блоки при переключении в 2D
    if (justSwitchedTo2D) {
      // Сначала инициализируем 2D позиции
      initialize2DPositions();
      
      // Очищаем предыдущий timeout
      if (distributionTimeoutRef.current) {
        clearTimeout(distributionTimeoutRef.current);
      }
      
      // Функция распределения блоков - всегда распределяем при переключении в 2D
      const distributeBlocks = () => {
        if (entities.length <= 1) return;
        
        // Проверяем, есть ли блоки на одной позиции или очень близко
        let hasOverlapping = false;
        let allSamePosition = true;
        
        const firstPos = getEntityPosition2D(entities[0]);
        const threshold = 1; // Порог для определения "одинаковой" позиции
        
        for (let i = 0; i < entities.length; i++) {
          const pos2DI = getEntityPosition2D(entities[i]);
          
          // Проверяем, все ли на одной позиции (с учетом погрешности)
          if (Math.abs(pos2DI[0] - firstPos[0]) > threshold || Math.abs(pos2DI[1] - firstPos[1]) > threshold) {
            allSamePosition = false;
          }
          
          for (let j = i + 1; j < entities.length; j++) {
            const pos2DJ = getEntityPosition2D(entities[j]);
            const dx = Math.abs(pos2DI[0] - pos2DJ[0]);
            const dz = Math.abs(pos2DI[1] - pos2DJ[1]);
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance < 140) { // Блоки перекрываются
              hasOverlapping = true;
              break;
            }
          }
          if (hasOverlapping) break;
        }
        
        // Если все блоки на одной позиции или есть перекрытия, распределяем их в сетку
        if (hasOverlapping || allSamePosition) {
          const blockSpacing = 160; // Расстояние между блоками
          const cols = Math.ceil(Math.sqrt(elements.length));
          const rows = Math.ceil(elements.length / cols);
          
          // Распределяем блоки в сетку
          elements.forEach((element, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const newX = (col - (cols - 1) / 2) * blockSpacing;
            const newZ = (row - (rows - 1) / 2) * blockSpacing;
            
            // Обновляем только 2D позицию
            updateElementPosition2D(element.id, [newX, newZ]);
          });
          
          // Принудительно перерисовываем после распределения
          requestAnimationFrame(() => draw());
        }
      };
      
      // Запускаем распределение немедленно с помощью requestAnimationFrame
      // Это гарантирует, что распределение произойдет до первой перерисовки
      requestAnimationFrame(() => {
        distributeBlocks();
        // Дополнительный вызов для гарантии
        requestAnimationFrame(() => {
          distributeBlocks();
        });
      });
      
      // Также запускаем через небольшой интервал для надежности (на случай, если инициализация асинхронная)
      distributionTimeoutRef.current = setTimeout(() => {
        distributeBlocks();
      }, 10);
    }
    
    return () => {
      if (distributionTimeoutRef.current) {
        clearTimeout(distributionTimeoutRef.current);
      }
    };
  }, [viewMode, elements.length]); // При переключении вида или изменении количества

  // Анимация мигания для блоков без соединений
  useEffect(() => {
    let animationFrameId;
    let startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      setAnimationTime(elapsed);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Перерисовка при изменении данных с использованием requestAnimationFrame для плавности
  useEffect(() => {
    let animationFrameId;
    const redraw = () => {
      draw();
    };
    
    // Используем requestAnimationFrame для плавной перерисовки
    animationFrameId = requestAnimationFrame(redraw);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [draw, animationTime]); // Добавляем animationTime в зависимости для обновления мигания
  
  // Непрерывная перерисовка во время перетаскивания для максимальной плавности
  const isDraggingRef = useRef(false);
  const animationFrameRef = useRef(null);
  
  useEffect(() => {
    isDraggingRef.current = isDragging && !!draggingElementId;
  }, [isDragging, draggingElementId]);
  
  useEffect(() => {
    if (isDragging && draggingElementId) {
      const animate = () => {
        // Во время перетаскивания продолжаем обновлять позицию на основе последней известной позиции мыши
        if (lastMousePositionRef.current && draggingElementId) {
          const element = elements.find(e => e.id === draggingElementId);
          if (element) {
            const { worldPos } = lastMousePositionRef.current;
            // Используем ref для получения актуального значения dragStart
            const currentDragStart = dragStartRef.current;
            const newPosition2D = [
              worldPos.x - currentDragStart.x,
              worldPos.z - currentDragStart.z
            ];
            
            // Обновляем локальную позицию, чтобы блок оставался на месте даже когда мышь не двигается
            setLocalPositions2D(prev => {
              const updated = { ...prev };
              updated[draggingElementId] = [...newPosition2D];
              return updated;
            });
          }
        }
        
        draw();
        if (isDraggingRef.current) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Очищаем последнюю позицию мыши при остановке перетаскивания
      lastMousePositionRef.current = null;
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isDragging, draggingElementId, elements, dragStart]);
  
  // Обработка изменения размера окна с debounce
  useEffect(() => {
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        draw();
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [elements, connections, selectedElementId, selectedConnectionId, pan, zoom, hoveredElementId, hoveredConnectionId, connectMode, connectingFrom]);

  // Обработка клика на canvas - ЕДИНСТВЕННОЕ место для управления выделением
  const handleCanvasClick = (e) => {
    if (!clickStart) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Проверяем, был ли это клик (не перетаскивание)
    const moveDistance = Math.sqrt(
      Math.pow(x - clickStart.x, 2) + Math.pow(y - clickStart.y, 2)
    );
    
    // Если было перетаскивание, сохраняем выделение блока, который перетаскивался
    if (moveDistance > 5) {
      // При перетаскивании сохраняем выделение блока, который был перетаскан
      if (lastDraggedElementIdRef.current) {
        selectElement(lastDraggedElementIdRef.current);
      }
      setClickStart(null);
      return;
    }
    
    const worldPos = screenToWorld(x, y);
    
    // Проверяем клик по элементу
    let clickedElement = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      const position2D = getElementPosition2D(element);
      const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
      
      if (isPointInBlock(x, y, sx, sy)) {
        clickedElement = element;
        break;
      }
    }
    
    
    if (connectMode) {
      if (clickedElement) {
        if (connectingFrom) {
          if (connectingFrom !== clickedElement.id) {
            createConnection({
              from: connectingFrom,
              to: clickedElement.id
            });
            setConnectingFrom(null);
          } else {
            setConnectingFrom(null);
          }
        } else {
          setConnectingFrom(clickedElement.id);
        }
      }
    } else {
      // Проверяем клик по соединению (только если не кликнули по элементу)
      if (!clickedElement) {
        let clickedConnection = null;
        
        for (const connection of connections) {
          const fromElement = elements.find(e => e.id === connection.from);
          const toElement = elements.find(e => e.id === connection.to);
          if (!fromElement || !toElement) continue;
          
          const blockSize = getBlockSize();
          const fromPos2D = getElementPosition2D(fromElement);
          const toPos2D = getElementPosition2D(toElement);
          const fromPos = worldToScreen(fromPos2D[0], fromPos2D[1]);
          const toPos = worldToScreen(toPos2D[0], toPos2D[1]);
          
          const dx = toPos.x - fromPos.x;
          const dy = toPos.y - fromPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) continue;
          
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          let fromX, fromY, toX, toY;
          
          if (absDx > absDy) {
            fromX = fromPos.x + (dx > 0 ? blockSize.width / 2 : -blockSize.width / 2);
            fromY = fromPos.y;
            toX = toPos.x + (dx > 0 ? -blockSize.width / 2 : blockSize.width / 2);
            toY = toPos.y;
          } else {
            fromX = fromPos.x;
            fromY = fromPos.y + (dy > 0 ? blockSize.height / 2 : -blockSize.height / 2);
            toX = toPos.x;
            toY = toPos.y + (dy > 0 ? -blockSize.height / 2 : blockSize.height / 2);
          }
          const midX = (fromX + toX) / 2;
          const midY = (fromY + toY) / 2 - Math.min(distance * 0.2, 30);
          
          const pointOnCurve = (t) => {
            const tx = fromX + (midX - fromX) * t * 2;
            const ty = fromY + (midY - fromY) * t * 2;
            const tx2 = midX + (toX - midX) * (t - 0.5) * 2;
            const ty2 = midY + (toY - midY) * (t - 0.5) * 2;
            return { x: t < 0.5 ? tx : tx2, y: t < 0.5 ? ty : ty2 };
          };
          
          let minDist = Infinity;
          for (let t = 0; t <= 1; t += 0.05) {
            const point = pointOnCurve(t);
            const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
            if (dist < minDist) minDist = dist;
          }
          
          if (minDist < 8) {
            clickedConnection = connection;
            break;
          }
        }
        
        if (clickedConnection) {
          selectConnection(clickedConnection.id);
          selectElement(null);
          // Очищаем lastDraggedElementIdRef при клике на соединение
          lastDraggedElementIdRef.current = null;
        } else {
          // Клик на пустое место - всегда сбрасываем выделение
          selectElement(null);
          selectConnection(null);
          // Очищаем lastDraggedElementIdRef при клике на пустое место
          lastDraggedElementIdRef.current = null;
        }
      } else if (clickedElement) {
        // КЛИК НА БЛОК - устанавливаем выделение
        console.log('🎯 Clicked on element:', {
          elementId: clickedElement.id,
          elementName: clickedElement.name,
          currentSelected: selectedElementId,
          willSelect: selectedElementId !== clickedElement.id
        });
        // ВСЕГДА устанавливаем выделение при клике, чтобы панель обновилась
        selectElement(clickedElement.id);
        selectConnection(null);
        // Сохраняем ID для возможного перетаскивания
        lastDraggedElementIdRef.current = clickedElement.id;
      }
    }
    
    setClickStart(null);
    // Очищаем draggingElementId после обработки клика
    setDraggingElementId(null);
  };

  // Обработка перетаскивания
  const handleMouseDown = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = screenToWorld(x, y);
    
    // Сохраняем начальную позицию для определения клика vs перетаскивания
    setClickStart({ x, y });
    
    // Проверяем клик по блоку элемента
    let clickedElement = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      const position2D = getElementPosition2D(element);
      const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
      
      if (isPointInBlock(x, y, sx, sy)) {
        clickedElement = element;
        break;
      }
    }
    
    if (clickedElement && !connectMode) {
      setDraggingElementId(clickedElement.id);
      lastDraggedElementIdRef.current = clickedElement.id; // Сохраняем для использования в handleCanvasClick
      setIsDragging(true);
      // НЕ устанавливаем выделение здесь - оно будет установлено в handleCanvasClick, если это не перетаскивание
      
      // Очищаем hover эффект для перетаскиваемой сущности, чтобы избежать подсветки на старом месте
      if (hoveredElementId === clickedElement.id) {
        setHoveredEntityId(null);
      }
      
      // Сохраняем смещение для плавного перетаскивания (используем 2D позицию)
      const position2D = getElementPosition2D(clickedElement);
      const dragOffset = { 
        x: worldPos.x - position2D[0], 
        z: worldPos.z - position2D[1] 
      };
      setDragStart(dragOffset);
      dragStartRef.current = dragOffset; // Сохраняем в ref для использования в замыканиях
      
      // Сохраняем начальную позицию мыши для непрерывного обновления
      lastMousePositionRef.current = { x, y, worldPos };
      
      // Сразу устанавливаем локальную позицию на текущее место, чтобы блок не рисовался на старом месте
      // Начальная локальная позиция должна быть текущей позицией блока
      setLocalPositions2D(prev => ({
        ...prev,
        [clickedElement.id]: [...position2D] // Копируем массив, чтобы не было ссылки
      }));
      
      // Принудительно перерисовываем сразу после установки локальной позиции
      requestAnimationFrame(() => {
        draw();
      });
    } else if (!connectMode) {
      // Панорамирование
      setIsDragging(true);
      setDragStart({ 
        x: x / zoom - pan.x, 
        z: -y / zoom - pan.y // Используем z для панорамирования в 2D
      });
    }
  };

  const handleMouseMove = (e) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = screenToWorld(x, y);
    
    // Определяем наведение на сущности и соединения
    let newHoveredEntityId = null;
    let newHoveredConnectionId = null;
    
    // Обновляем курсор
    let cursorStyle = 'default';
    
    // Проверяем наведение на блоки сущностей
    // ВАЖНО: Пропускаем проверку для перетаскиваемой сущности, чтобы избежать подсветки на старом месте
    for (let i = entities.length - 1; i >= 0; i--) {
      const element = elements[i];
      
      // Пропускаем перетаскиваемую сущность - она не должна иметь hover эффект во время перетаскивания
      if (draggingElementId === element.id) {
        continue;
      }
      
      // Используем позицию из store (перетаскиваемая сущность уже пропущена выше)
      const position2D = getElementPosition2D(element);
      const { x: sx, y: sy } = worldToScreen(position2D[0], position2D[1]);
      
      if (isPointInBlock(x, y, sx, sy)) {
        newHoveredElementId = element.id;
        cursorStyle = connectMode ? 'crosshair' : 'grab';
        
        // Подсказка при наведении
        const elementType = ENTITY_TYPES[element.type] || ENTITY_TYPES.box;
        setTooltip({
          x: e.clientX,
          y: e.clientY,
          text: `${element.name || 'Без имени'} (${elementType.label})`,
          type: entityType.label
        });
        break;
      }
    }
    
    if (!newHoveredEntityId) {
      setTooltip(null);
    }
    
    // Проверяем наведение на соединения (только если не на сущности)
    if (!newHoveredElementId && !isDragging) {
      for (const connection of connections) {
        const fromElement = elements.find(e => e.id === connection.from);
        const toElement = elements.find(e => e.id === connection.to);
        if (!fromElement || !toElement) continue;
        
        const blockSize = getBlockSize();
        const fromPos2D = getElementPosition2D(fromElement);
        const toPos2D = getElementPosition2D(toElement);
        const fromPos = worldToScreen(fromPos2D[0], fromPos2D[1]);
        const toPos = worldToScreen(toPos2D[0], toPos2D[1]);
        
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) continue;
        
        // Находим точки на краях блоков
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        let fromX, fromY, toX, toY;
        
        if (absDx > absDy) {
          fromX = fromPos.x + (dx > 0 ? blockSize.width / 2 : -blockSize.width / 2);
          fromY = fromPos.y;
          toX = toPos.x + (dx > 0 ? -blockSize.width / 2 : blockSize.width / 2);
          toY = toPos.y;
        } else {
          fromX = fromPos.x;
          fromY = fromPos.y + (dy > 0 ? blockSize.height / 2 : -blockSize.height / 2);
          toX = toPos.x;
          toY = toPos.y + (dy > 0 ? -blockSize.height / 2 : blockSize.height / 2);
        }
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2 - Math.min(distance * 0.2, 30);
        
        // Упрощенная проверка близости к кривой
        const pointOnCurve = (t) => {
          const tx = fromX + (midX - fromX) * t * 2;
          const ty = fromY + (midY - fromY) * t * 2;
          const tx2 = midX + (toX - midX) * (t - 0.5) * 2;
          const ty2 = midY + (toY - midY) * (t - 0.5) * 2;
          return { x: t < 0.5 ? tx : tx2, y: t < 0.5 ? ty : ty2 };
        };
        
        // Проверяем несколько точек на кривой
        let minDist = Infinity;
        for (let t = 0; t <= 1; t += 0.1) {
          const point = pointOnCurve(t);
          const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
          if (dist < minDist) minDist = dist;
        }
        
        if (minDist < 10) {
          newHoveredConnectionId = connection.id;
          cursorStyle = 'pointer';
          
          // Подсказка для соединения
          const fromEntity = entities.find(e => e.id === connection.from);
          const toEntity = entities.find(e => e.id === connection.to);
          if (fromElement && toElement) {
            setTooltip({
              x: e.clientX,
              y: e.clientY,
              text: `Соединение: ${fromElement.name || 'Элемент 1'} → ${toElement.name || 'Элемент 2'}`,
              type: 'connection'
            });
          }
          break;
        }
      }
    }
    
    // Устанавливаем курсор
    if (canvasRef.current) {
      canvasRef.current.style.cursor = isDragging ? 'grabbing' : cursorStyle;
    }
    
    setHoveredEntityId(newHoveredEntityId);
    setHoveredConnectionId(newHoveredConnectionId);
    
    // Сохраняем позицию мыши для использования во время перетаскивания
    if (isDragging && draggingElementId) {
      lastMousePositionRef.current = { x, y, worldPos };
    }
    
    if (!isDragging) return;
    
    if (draggingElementId) {
      const element = elements.find(e => e.id === draggingElementId);
      if (element) {
        // Вычисляем новую позицию на основе текущей позиции мыши
        const newPosition2D = [
          worldPos.x - dragStart.x,
          worldPos.z - dragStart.z
        ];
        
        // ВСЕГДА обновляем локальное состояние для мгновенной перерисовки
        // Это гарантирует, что блок следует за мышью
        setLocalPositions2D(prev => {
          // Убеждаемся, что мы создаем новый объект для React
          const updated = { ...prev };
          updated[element.id] = [...newPosition2D]; // Создаем новый массив
          return updated;
        });
      }
    } else {
      // Панорамирование
      const newPanX = x / zoom - dragStart.x;
      const newPanY = -y / zoom - (dragStart.z || dragStart.y || 0);
      setPan({ x: newPanX, y: newPanY });
    }
  };

  const handleMouseUp = (e) => {
    // Сохраняем ID блока для сохранения выделения
    // ВАЖНО: Сохраняем выделение только если было перетаскивание (draggingElementId установлен)
    // Если был просто клик, выделение будет обработано в handleCanvasClick
    const elementIdToSelect = draggingElementId;
    
    // Обновляем позицию при перетаскивании
    if (draggingElementId) {
      const element = elements.find(e => e.id === draggingElementId);
      if (element) {
        // Если было перетаскивание - обновляем позицию
        if (localPositions2D[element.id]) {
          const finalPosition = localPositions2D[element.id];
          updateElementPosition2D(element.id, finalPosition);
          
          // Очищаем локальную позицию
          setLocalPositions2D(prev => {
            const newPositions = { ...prev };
            delete newPositions[draggingElementId];
            return newPositions;
          });
        }
        
        lastMousePositionRef.current = null;
        requestAnimationFrame(() => draw());
      }
    }
    
    // ВАЖНО: Сохраняем выделение только если было перетаскивание
    // Для простого клика выделение обрабатывается в handleCanvasClick
    if (entityIdToSelect) {
      requestAnimationFrame(() => {
        selectElement(elementIdToSelect);
      });
    }
    
    // Очищаем timeout
    if (draggingUpdateTimeoutRef.current) {
      clearTimeout(draggingUpdateTimeoutRef.current);
      draggingUpdateTimeoutRef.current = null;
    }
    
    setIsDragging(false);
    setDraggingEntityId(null);
  };
  
  // Сброс камеры (центрирование и зум)
  const resetCamera = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  // Обработка колесика мыши для зума (непассивный слушатель)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      
      const rect = container.getBoundingClientRect();
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

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, pan, screenToWorld, getCanvasSize]);

  return (
    <div 
      ref={containerRef}
      className="canvas-2d-container"
    >
      <canvas
        ref={canvasRef}
        className="canvas-2d"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      />
      
      {/* Информация о зуме и контролы */}
      <div className="canvas-2d-info">
        <div className="zoom-controls">
          <button onClick={() => setZoom(prev => Math.min(3, prev * 1.2))} title="Увеличить">+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))} title="Уменьшить">-</button>
          <button onClick={resetCamera} title="Сбросить камеру" className="reset-camera-btn">⌂</button>
        </div>
        {connectMode && (
          <div className="connect-mode-indicator">
            Режим подключения: {connectingFrom ? 'Выберите целевую сущность' : 'Выберите исходную сущность'}
          </div>
        )}
      </div>
      
      {/* Подсказка при наведении */}
      {tooltip && (
        <div 
          className="canvas-2d-tooltip"
          style={{
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y + 10}px`
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export default Canvas2D;

