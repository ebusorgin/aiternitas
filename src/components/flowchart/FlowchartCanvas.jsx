import { useRef, useEffect, useState, useCallback } from 'react';
import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_TYPES } from '../../store/flowchartStore';
import ContextMenu from './ContextMenu';
import PluginTypeModal from './PluginTypeModal';
import ElementInfoModal from './ElementInfoModal';
import './FlowchartCanvas.css';

// Базовый размер квадратного элемента
const BASE_SIZE = 120;
// Отступ внутри родителя
const PADDING = 12;
// Отступ для заголовка
const HEADER_HEIGHT = 28;

function FlowchartCanvas() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const lastCanvasSizeRef = useRef({ width: 0, height: 0 });
  
  // Store state
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const selectedElementId = useFlowchartStore((state) => state.selectedElementId);
  const selectedConnectionId = useFlowchartStore((state) => state.selectedConnectionId);
  const pan = useFlowchartStore((state) => state.pan);
  const zoom = useFlowchartStore((state) => state.zoom);
  const isConnecting = useFlowchartStore((state) => state.isConnecting);
  const connectingFrom = useFlowchartStore((state) => state.connectingFrom);
  const dropTargetId = useFlowchartStore((state) => state.dropTargetId);
  const currentViewId = useFlowchartStore((state) => state.currentViewId);
  
  // Store actions
  const selectElement = useFlowchartStore((state) => state.selectElement);
  const selectConnection = useFlowchartStore((state) => state.selectConnection);
  const updateElement = useFlowchartStore((state) => state.updateElement);
  const deleteElement = useFlowchartStore((state) => state.deleteElement);
  const deleteConnection = useFlowchartStore((state) => state.deleteConnection);
  const setPan = useFlowchartStore((state) => state.setPan);
  const setZoom = useFlowchartStore((state) => state.setZoom);
  const finishConnecting = useFlowchartStore((state) => state.finishConnecting);
  const cancelConnecting = useFlowchartStore((state) => state.cancelConnecting);
  const clearSelection = useFlowchartStore((state) => state.clearSelection);
  const nestElement = useFlowchartStore((state) => state.nestElement);
  const setDropTarget = useFlowchartStore((state) => state.setDropTarget);
  const navigateInto = useFlowchartStore((state) => state.navigateInto);
  const navigateUp = useFlowchartStore((state) => state.navigateUp);
  const navigateToRoot = useFlowchartStore((state) => state.navigateToRoot);
  const addElement = useFlowchartStore((state) => state.addElement);
  const addChildElement = useFlowchartStore((state) => state.addChildElement);
  const getElementPath = useFlowchartStore((state) => state.getElementPath);
  const saveNow = useFlowchartStore((state) => state.saveNow);
  const fitToView = useFlowchartStore((state) => state.fitToView);
  const autoLayoutElements = useFlowchartStore((state) => state.autoLayoutElements);
  const needsAutoLayout = useFlowchartStore((state) => state.needsAutoLayout);
  const openPluginSettings = useFlowchartStore((state) => state.openPluginSettings);

  // Local state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingElementId, setDraggingElementId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);
  
  // Info modal state (for non-department elements)
  const [infoModalElement, setInfoModalElement] = useState(null);

  // Plugin type selection state
  const [showPluginTypeModal, setShowPluginTypeModal] = useState(false);
  const [pendingPluginPos, setPendingPluginPos] = useState(null);

  // Get visible elements based on current view
  const getVisibleElements = useCallback(() => {
    if (currentViewId === null) {
      return elements.filter(e => !e.parentId);
    } else {
      return elements.filter(e => e.parentId === currentViewId);
    }
  }, [elements, currentViewId]);

  // Get breadcrumb path
  const getBreadcrumbPath = useCallback(() => {
    if (!currentViewId) return [];
    return getElementPath(currentViewId);
  }, [currentViewId, getElementPath]);

  // Преобразование координат
  const screenToWorld = useCallback((screenX, screenY) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    return {
      x: (screenX - rect.left - centerX) / zoom - pan.x,
      y: (screenY - rect.top - centerY) / zoom - pan.y
    };
  }, [pan, zoom]);

  const worldToScreen = useCallback((worldX, worldY) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    return {
      x: centerX + (worldX + pan.x) * zoom,
      y: centerY + (worldY + pan.y) * zoom
    };
  }, [pan, zoom]);

  // Отрисовка элемента
  const drawElement = useCallback((ctx, element) => {
    const elementType = ELEMENT_TYPES[element.type];
    const isSelected = element.id === selectedElementId;
    const isDropTargetEl = element.id === dropTargetId && draggingElementId && draggingElementId !== element.id;
    const isDepartment = elementType?.canContain;
    const children = elements.filter(e => e.parentId === element.id);
    
    const { x, y } = worldToScreen(element.position.x, element.position.y);
    
    // Департаменты с детьми отображаются крупнее
    const hasChildren = children.length > 0;
    const baseSize = isDepartment && hasChildren ? BASE_SIZE * 1.4 : BASE_SIZE;
    const size = baseSize * zoom;
    const halfSize = size / 2;
    const cornerRadius = 14 * zoom;
    
    ctx.save();
    
    // Тень
    ctx.shadowColor = isDepartment ? 'rgba(59, 130, 246, 0.4)' : 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = isDepartment ? 30 : 20;
    ctx.shadowOffsetY = isDepartment ? 8 : 6;
    
    // Фон элемента
    const drawRoundedRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };
    
    drawRoundedRect(x - halfSize, y - halfSize, size, size, cornerRadius);
    
    if (isDepartment) {
      // Градиент для департаментов - более объёмный
      const gradient = ctx.createLinearGradient(x - halfSize, y - halfSize, x + halfSize, y + halfSize);
      gradient.addColorStop(0, '#1e3a5f');
      gradient.addColorStop(0.5, '#1e3a5f');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Верхняя полоса-заголовок
      ctx.save();
      ctx.clip();
      const headerHeight = 32 * zoom;
      const headerGradient = ctx.createLinearGradient(x - halfSize, y - halfSize, x + halfSize, y - halfSize + headerHeight);
      headerGradient.addColorStop(0, element.color + 'ee');
      headerGradient.addColorStop(1, element.color + 'aa');
      ctx.fillStyle = headerGradient;
      ctx.fillRect(x - halfSize, y - halfSize, size, headerHeight);
      ctx.restore();
    } else {
      // Градиент для обычных элементов
      const gradient = ctx.createLinearGradient(x - halfSize, y - halfSize, x + halfSize, y + halfSize);
      gradient.addColorStop(0, element.color + 'ff');
      gradient.addColorStop(1, element.color + 'aa');
      ctx.fillStyle = gradient;
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;
    
    // Обводка
    drawRoundedRect(x - halfSize, y - halfSize, size, size, cornerRadius);
    if (isDropTargetEl) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 5]);
    } else if (isSelected) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
    } else if (isDepartment) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.restore();
    
    if (isDepartment) {
      // Иконка в заголовке
      const iconSize = 18 * zoom;
      ctx.font = `${iconSize}px Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(elementType?.icon || '🏢', x - halfSize + 10 * zoom, y - halfSize + 16 * zoom);
      
      // Название в заголовке
      ctx.font = `bold ${12 * zoom}px Arial`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      const name = element.name || 'Департамент';
      const maxWidth = size - 80 * zoom;
      let displayName = name;
      if (ctx.measureText(name).width > maxWidth) {
        while (ctx.measureText(displayName + '...').width > maxWidth && displayName.length > 0) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '...';
      }
      ctx.fillText(displayName, x - halfSize + 32 * zoom, y - halfSize + 16 * zoom);
      
      // Счётчик дочерних элементов в углу заголовка
      if (hasChildren) {
        ctx.font = `bold ${10 * zoom}px Arial`;
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(`${children.length}`, x + halfSize - 10 * zoom, y - halfSize + 16 * zoom);
      }
      
      // Область для превью дочерних элементов
      const contentTop = y - halfSize + 38 * zoom;
      const contentHeight = size - 44 * zoom;
      const contentWidth = size - 16 * zoom;
      
      if (hasChildren) {
        // Отрисовка мини-превью дочерних элементов
        const miniSize = Math.min(28 * zoom, (contentWidth - 10 * zoom) / Math.min(children.length, 4));
        const cols = Math.floor((contentWidth - 4 * zoom) / (miniSize + 4 * zoom));
        const rows = Math.floor((contentHeight - 4 * zoom) / (miniSize + 4 * zoom));
        const maxVisible = cols * rows;
        const visibleChildren = children.slice(0, maxVisible);
        
        visibleChildren.forEach((child, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const childType = ELEMENT_TYPES[child.type];
          
          const cx = x - halfSize + 12 * zoom + col * (miniSize + 4 * zoom) + miniSize / 2;
          const cy = contentTop + 8 * zoom + row * (miniSize + 4 * zoom) + miniSize / 2;
          
          // Мини-карточка
          ctx.beginPath();
          ctx.arc(cx, cy, miniSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = child.color + 'dd';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Мини-иконка
          ctx.font = `${miniSize * 0.5}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(childType?.icon || '❓', cx, cy);
        });
        
        // Индикатор "и ещё N"
        if (children.length > maxVisible) {
          ctx.font = `${9 * zoom}px Arial`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`+${children.length - maxVisible}`, x + halfSize - 8 * zoom, y + halfSize - 6 * zoom);
        }
      } else {
        // Пустой департамент
        ctx.font = `${11 * zoom}px Arial`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Пусто', x, y + 10 * zoom);
        ctx.font = `${9 * zoom}px Arial`;
        ctx.fillText('2×клик для входа', x, y + 26 * zoom);
      }
    } else {
      // Обычный элемент (не департамент)
      // Иконка
      const iconSize = 28 * zoom;
      ctx.font = `${iconSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(elementType?.icon || '❓', x, y - size * 0.12);
      
      // Название
      ctx.font = `bold ${13 * zoom}px Arial`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const name = element.name || elementType?.name || 'Элемент';
      const maxWidth = size * 0.85;
      let displayName = name;
      if (ctx.measureText(name).width > maxWidth) {
        while (ctx.measureText(displayName + '...').width > maxWidth && displayName.length > 0) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '...';
      }
      ctx.fillText(displayName, x, y + size * 0.22);
      
      // Тип элемента
      ctx.font = `${9 * zoom}px Arial`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(elementType?.name || '', x, y + size * 0.38);
    }

    // Plugin gear indicator (clickable in handleMouseDown)
    if (element.type === 'plugin') {
      const gearR = 13 * zoom;
      const gx = x + halfSize - gearR - 6 * zoom;
      const gy = y - halfSize + gearR + 6 * zoom;

      ctx.save();
      ctx.beginPath();
      ctx.arc(gx, gy, gearR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = `${16 * zoom}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e0f2fe';
      ctx.fillText('⚙️', gx, gy + 1 * zoom);

      // Status dot (top-left of the gear circle)
      const status = element.properties?.connection?.status || 'unknown';
      const dotColor = status === 'connected'
        ? 'rgba(34, 197, 94, 0.95)'
        : status === 'not_configured'
          ? 'rgba(251, 146, 60, 0.95)'
          : (status === 'invalid' || status === 'connection_failed')
            ? 'rgba(239, 68, 68, 0.95)'
            : 'rgba(148, 163, 184, 0.9)';
      ctx.beginPath();
      ctx.arc(gx - gearR + 4 * zoom, gy - gearR + 4 * zoom, 4.5 * zoom, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      ctx.restore();
    }
    
    // Индикатор соединения
    if (isConnecting && connectingFrom !== element.id) {
      ctx.beginPath();
      ctx.arc(x, y, 10 * zoom, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
      ctx.fill();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [elements, selectedElementId, dropTargetId, draggingElementId, isConnecting, connectingFrom, zoom, worldToScreen]);

  // Отрисовка связи с учетом направления
  const drawConnection = useCallback((ctx, connection, isSelected) => {
    const fromElement = elements.find((e) => e.id === connection.from);
    const toElement = elements.find((e) => e.id === connection.to);
    
    if (!fromElement || !toElement) return;
    
    // Проверяем, что оба элемента видимы на текущем уровне
    const visibleElements = getVisibleElements();
    const fromVisible = visibleElements.some(e => e.id === fromElement.id);
    const toVisible = visibleElements.some(e => e.id === toElement.id);
    if (!fromVisible || !toVisible) return;
    
    const from = worldToScreen(fromElement.position.x, fromElement.position.y);
    const to = worldToScreen(toElement.position.x, toElement.position.y);
    
    const halfSize = (BASE_SIZE * zoom) / 2;
    
    // Вычисляем угол между элементами
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    
    // Точки на краях элементов
    const fromEdge = {
      x: from.x + Math.cos(angle) * halfSize,
      y: from.y + Math.sin(angle) * halfSize
    };
    const toEdge = {
      x: to.x - Math.cos(angle) * halfSize,
      y: to.y - Math.sin(angle) * halfSize
    };
    
    const direction = connection.direction || 'outgoing';
    const arrowSize = Math.max(12, 16 * zoom);
    
    // Корректируем конечные точки для стрелок
    const toArrowOffset = (direction === 'outgoing' || direction === 'bidirectional') ? arrowSize * 0.7 : 0;
    const fromArrowOffset = (direction === 'incoming' || direction === 'bidirectional') ? arrowSize * 0.7 : 0;
    
    const adjustedToEdge = {
      x: toEdge.x - Math.cos(angle) * toArrowOffset,
      y: toEdge.y - Math.sin(angle) * toArrowOffset
    };
    const adjustedFromEdge = {
      x: fromEdge.x + Math.cos(angle) * fromArrowOffset,
      y: fromEdge.y + Math.sin(angle) * fromArrowOffset
    };
    
    // Цвета на основе типа связи
    const connType = CONNECTION_TYPES[connection.type] || CONNECTION_TYPES.collaborates;
    const typeColor = connType?.color || '#60a5fa';
    const lineColor = isSelected ? '#fbbf24' : typeColor;
    const lineWidth = isSelected ? 4 : 3;
    
    // Рисуем линию
    ctx.beginPath();
    ctx.moveTo(adjustedFromEdge.x, adjustedFromEdge.y);
    ctx.lineTo(adjustedToEdge.x, adjustedToEdge.y);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Функция рисования стрелки (заполненный треугольник)
    const drawArrow = (tipX, tipY, arrowAngle) => {
      const arrowWidth = arrowSize * 0.6;
      
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - arrowSize * Math.cos(arrowAngle - Math.PI / 7),
        tipY - arrowSize * Math.sin(arrowAngle - Math.PI / 7)
      );
      ctx.lineTo(
        tipX - arrowSize * 0.6 * Math.cos(arrowAngle),
        tipY - arrowSize * 0.6 * Math.sin(arrowAngle)
      );
      ctx.lineTo(
        tipX - arrowSize * Math.cos(arrowAngle + Math.PI / 7),
        tipY - arrowSize * Math.sin(arrowAngle + Math.PI / 7)
      );
      ctx.closePath();
      ctx.fillStyle = lineColor;
      ctx.fill();
    };
    
    // Стрелка на конце (для outgoing и bidirectional)
    if (direction === 'outgoing' || direction === 'bidirectional') {
      drawArrow(toEdge.x, toEdge.y, angle);
    }
    
    // Стрелка на начале (для incoming и bidirectional)
    if (direction === 'incoming' || direction === 'bidirectional') {
      drawArrow(fromEdge.x, fromEdge.y, angle + Math.PI);
    }
    
    // Метка связи (показываем тип или description)
    const showLabel = connection.type || connection.label || connection.description;
    if (showLabel && zoom > 0.4) {
      const connTypeInfo = CONNECTION_TYPES[connection.type];
      const labelText = connection.label || connTypeInfo?.name || '';
      const icon = connTypeInfo?.icon || '';
      const displayText = icon ? `${icon} ${labelText}` : labelText;
      
      if (displayText) {
        const midX = (fromEdge.x + toEdge.x) / 2;
        const midY = (fromEdge.y + toEdge.y) / 2;
        
        ctx.font = `bold ${11 * zoom}px Arial`;
        const labelWidth = ctx.measureText(displayText).width + 16 * zoom;
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.beginPath();
        ctx.roundRect(midX - labelWidth/2, midY - 11 * zoom, labelWidth, 22 * zoom, 6 * zoom);
        ctx.fill();
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, midX, midY);
      }
    }
  }, [elements, getVisibleElements, worldToScreen, zoom]);

  // Основная функция отрисовки
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    const { width, height } = container.getBoundingClientRect();

    // Avoid resizing canvas if size hasn't changed: resizing can trigger expensive reflow and
    // may cause cascaded mousemove events in some browsers.
    const last = lastCanvasSizeRef.current;
    if (last.width !== width || last.height !== height) {
      canvas.width = width;
      canvas.height = height;
      lastCanvasSizeRef.current = { width, height };
    }
    
    // Фон
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);
    
    // Сетка
    const gridSize = 40 * zoom;
    const offsetX = (width / 2 + pan.x * zoom) % gridSize;
    const offsetY = (height / 2 + pan.y * zoom) % gridSize;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    
    for (let x = offsetX; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Центральные линии
    const center = worldToScreen(0, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(center.x, 0);
    ctx.lineTo(center.x, height);
    ctx.moveTo(0, center.y);
    ctx.lineTo(width, center.y);
    ctx.stroke();
    
    // Получаем видимые элементы
    const visibleElements = getVisibleElements();
    
    // Соединения
    connections.forEach((conn) => {
      drawConnection(ctx, conn, conn.id === selectedConnectionId);
    });
    
    // Линия при создании соединения
    if (isConnecting && connectingFrom) {
      const fromElement = elements.find((e) => e.id === connectingFrom);
      if (fromElement) {
        const from = worldToScreen(fromElement.position.x, fromElement.position.y);
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Элементы текущего уровня
    visibleElements.forEach((element) => {
      drawElement(ctx, element);
    });
  }, [elements, connections, selectedElementId, selectedConnectionId, pan, zoom, 
      isConnecting, connectingFrom, mousePos, drawElement, drawConnection, 
      worldToScreen, getVisibleElements]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [draw]);

  // Auto-fit when navigation changes (entering/leaving departments)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    // Small delay to let the state settle
    const timer = setTimeout(() => {
      // Check if auto-layout is needed (overlapping elements or all at origin)
      if (needsAutoLayout()) {
        autoLayoutElements(rect.width, rect.height);
      } else {
        fitToView(rect.width, rect.height);
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, [currentViewId, fitToView, autoLayoutElements, needsAutoLayout]);

  // Auto-fit when elements are added or removed on current level
  const visibleElementIds = getVisibleElements().map(e => e.id).join(',');
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    // Small delay to let the state settle
    const timer = setTimeout(() => {
      if (needsAutoLayout()) {
        autoLayoutElements(rect.width, rect.height);
      } else {
        fitToView(rect.width, rect.height);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [visibleElementIds, fitToView, autoLayoutElements, needsAutoLayout]);

  // Проверка попадания в элемент
  const hitTestElement = useCallback((worldX, worldY) => {
    const visibleElements = getVisibleElements();
    const halfSize = BASE_SIZE / 2;
    
    for (let i = visibleElements.length - 1; i >= 0; i--) {
      const element = visibleElements[i];
      if (
        worldX >= element.position.x - halfSize &&
        worldX <= element.position.x + halfSize &&
        worldY >= element.position.y - halfSize &&
        worldY <= element.position.y + halfSize
      ) {
        return element;
      }
    }
    return null;
  }, [getVisibleElements]);

  // Проверка попадания в связь
  const hitTestConnection = useCallback((screenX, screenY) => {
    const visibleElements = getVisibleElements();
    const threshold = 10;
    
    for (const connection of connections) {
      const fromElement = elements.find(e => e.id === connection.from);
      const toElement = elements.find(e => e.id === connection.to);
      
      if (!fromElement || !toElement) continue;
      if (!visibleElements.some(e => e.id === fromElement.id)) continue;
      if (!visibleElements.some(e => e.id === toElement.id)) continue;
      
      const from = worldToScreen(fromElement.position.x, fromElement.position.y);
      const to = worldToScreen(toElement.position.x, toElement.position.y);
      
      // Простая проверка расстояния до линии
      const lineLength = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
      if (lineLength === 0) continue;
      
      const t = Math.max(0, Math.min(1, 
        ((screenX - from.x) * (to.x - from.x) + (screenY - from.y) * (to.y - from.y)) / (lineLength * lineLength)
      ));
      
      const closestX = from.x + t * (to.x - from.x);
      const closestY = from.y + t * (to.y - from.y);
      
      const distance = Math.sqrt(Math.pow(screenX - closestX, 2) + Math.pow(screenY - closestY, 2));
      
      if (distance < threshold) {
        return connection;
      }
    }
    return null;
  }, [connections, elements, getVisibleElements, worldToScreen]);

  // Найти контейнер для drop (только департаменты могут содержать дочерние элементы)
  const findDropTarget = useCallback((worldX, worldY, excludeId) => {
    const visibleElements = getVisibleElements();
    const halfSize = BASE_SIZE / 2;
    
    for (const element of visibleElements) {
      if (element.id === excludeId) continue;
      
      // Только элементы с canContain: true могут быть целью вложения
      const elementType = ELEMENT_TYPES[element.type];
      if (!elementType?.canContain) continue;
      
      if (
        worldX >= element.position.x - halfSize &&
        worldX <= element.position.x + halfSize &&
        worldY >= element.position.y - halfSize &&
        worldY <= element.position.y + halfSize
      ) {
        return element;
      }
    }
    return null;
  }, [getVisibleElements]);

  // Обработчики событий
  const handleMouseDown = useCallback((e) => {
    if (e.button === 2) return; // Правая кнопка обрабатывается в contextmenu
    
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const element = hitTestElement(worldPos.x, worldPos.y);
    
    // Закрываем контекстное меню при любом клике
    setContextMenu(null);
    
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Средняя кнопка или Alt+левая - панорамирование
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x * zoom, y: e.clientY - pan.y * zoom });
    } else if (element) {
      if (isConnecting) {
        finishConnecting(element.id);
      } else {
        // Gear click for plugin element opens settings popup (no dragging).
        if (element.type === 'plugin') {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const { x, y } = worldToScreen(element.position.x, element.position.y);
            const size = BASE_SIZE * zoom;
            const halfSize = size / 2;
            const gearR = 13 * zoom;
            const gx = x + halfSize - gearR - 6 * zoom;
            const gy = y - halfSize + gearR + 6 * zoom;
            const dx = clickX - gx;
            const dy = clickY - gy;
            if (dx * dx + dy * dy <= (gearR + 3) * (gearR + 3)) {
              selectElement(element.id);
              openPluginSettings(element.id);
              return;
            }
          }
        }

        selectElement(element.id);
        setDraggingElementId(element.id);
        setDragStart({ x: worldPos.x - element.position.x, y: worldPos.y - element.position.y });
        setIsDragging(true);
      }
    } else {
      // Проверяем клик по связи
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const connection = hitTestConnection(e.clientX - rect.left, e.clientY - rect.top);
        if (connection) {
          selectConnection(connection.id);
        } else {
          clearSelection();
          cancelConnecting();
        }
      }
    }
  }, [screenToWorld, hitTestElement, hitTestConnection, pan, zoom, isConnecting,
      worldToScreen, openPluginSettings, selectElement, selectConnection, finishConnecting, clearSelection, cancelConnecting]);

  const handleMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      // mousePos is only needed for drawing the "connecting" line.
      // Don't update state unless it affects rendering; also guard against redundant updates.
      if (isConnecting) {
        const next = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setMousePos((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
      }
    }
    
    if (isPanning) {
      const newPanX = (e.clientX - dragStart.x) / zoom;
      const newPanY = (e.clientY - dragStart.y) / zoom;
      setPan({ x: newPanX, y: newPanY });
    } else if (isDragging && draggingElementId) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const newPosition = {
        x: worldPos.x - dragStart.x,
        y: worldPos.y - dragStart.y
      };
      
      updateElement(draggingElementId, { position: newPosition });
      
      const dropTarget = findDropTarget(newPosition.x, newPosition.y, draggingElementId);
      setDropTarget(dropTarget?.id || null);
    }
  }, [isConnecting, isPanning, isDragging, draggingElementId, dragStart, zoom, screenToWorld, setPan, updateElement, findDropTarget, setDropTarget]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && draggingElementId && dropTargetId) {
      nestElement(draggingElementId, dropTargetId);
    }
    
    // Save immediately when drag ends (position changed)
    if (isDragging && draggingElementId) {
      saveNow();
    }
    
    setIsPanning(false);
    setIsDragging(false);
    setDraggingElementId(null);
    setDropTarget(null);
  }, [isDragging, draggingElementId, dropTargetId, nestElement, setDropTarget, saveNow]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(zoom + delta);
  }, [zoom, setZoom]);

  // Двойной клик - навигация внутрь департамента или показ информации
  const handleDoubleClick = useCallback((e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const element = hitTestElement(worldPos.x, worldPos.y);
    
    if (element) {
      const elementType = ELEMENT_TYPES[element.type];
      
      // Только департаменты поддерживают навигацию внутрь (даже пустые)
      if (elementType?.canContain) {
        navigateInto(element.id);
      } else if (element.type === 'plugin') {
        openPluginSettings(element.id);
      } else {
        // Для других типов - показываем информационный диалог
        setInfoModalElement(element);
      }
    }
  }, [screenToWorld, hitTestElement, navigateInto, openPluginSettings]);

  // Контекстное меню (правый клик)
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const element = hitTestElement(worldPos.x, worldPos.y);
    
    if (element) {
      selectElement(element.id);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'element',
        target: element,
        worldPos
      });
    } else {
      // Проверяем клик по связи
      const connection = hitTestConnection(e.clientX - rect.left, e.clientY - rect.top);
      if (connection) {
        selectConnection(connection.id);
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'connection',
          target: connection,
          worldPos
        });
      } else {
        // Пустое место
        clearSelection();
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'empty',
          target: null,
          worldPos
        });
      }
    }
  }, [screenToWorld, hitTestElement, hitTestConnection, selectElement, selectConnection, clearSelection]);

  // Создание элемента из контекстного меню
  const handleCreateElement = useCallback((typeId) => {
    if (contextMenu?.worldPos) {
      if (typeId === 'plugin') {
        setPendingPluginPos(contextMenu.worldPos);
        setShowPluginTypeModal(true);
        setContextMenu(null);
        return;
      }
      
      if (currentViewId) {
        // Если мы внутри элемента, создаем дочерний
        addChildElement(currentViewId, typeId);
      } else {
        // Создаем корневой элемент
        addElement(typeId, contextMenu.worldPos);
      }
    }
  }, [contextMenu, currentViewId, addElement, addChildElement]);

  // Обработка выбора типа плагина
  const handlePluginTypeSelect = useCallback((pluginTypeId, pluginTypeName) => {
    setShowPluginTypeModal(false);
    
    if (pendingPluginPos) {
      let newElement;
      if (currentViewId) {
        newElement = addChildElement(currentViewId, 'plugin');
      } else {
        newElement = addElement('plugin', pendingPluginPos);
      }
      
      if (newElement) {
        // Обновляем имя и тип плагина в свойствах
        const updates = {
          name: pluginTypeName,
          properties: {
            ...newElement.properties,
            pluginId: pluginTypeId
          }
        };
        
        updateElement(newElement.id, updates);
        
        // Если выбран Telegram, сразу открываем настройки
        if (pluginTypeId === 'telegram') {
          openPluginSettings(newElement.id);
        }
      }
    }
    
    setPendingPluginPos(null);
  }, [pendingPluginPos, currentViewId, addElement, addChildElement, updateElement, openPluginSettings]);

  // Клавиатурные сокращения
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElementId) {
        const element = elements.find(el => el.id === selectedElementId);
        const children = elements.filter(el => el.parentId === selectedElementId);
        const message = children.length > 0
          ? `Удалить "${element?.name}" и все ${children.length} дочерних элемента?`
          : `Удалить элемент "${element?.name}"?`;
        if (confirm(message)) {
          deleteElement(selectedElementId);
        }
      } else if (selectedConnectionId) {
        if (confirm('Удалить эту связь?')) {
          deleteConnection(selectedConnectionId);
        }
      }
    } else if (e.key === 'Escape') {
      setContextMenu(null);
      cancelConnecting();
      clearSelection();
    }
  }, [selectedElementId, selectedConnectionId, elements, deleteElement, deleteConnection, cancelConnecting, clearSelection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Breadcrumb path
  const breadcrumbPath = getBreadcrumbPath();
  const currentViewElement = currentViewId ? elements.find(e => e.id === currentViewId) : null;

  return (
    <div className="flowchart-canvas-wrapper">
      {/* Навигационная панель */}
      {currentViewId && (
        <div className="flowchart-navigation">
          <button className="nav-btn nav-root" onClick={navigateToRoot}>
            🏠 В корень
          </button>
          <button className="nav-btn nav-up" onClick={navigateUp}>
            ⬆️ На уровень выше
          </button>
          <div className="nav-breadcrumb">
            <span className="breadcrumb-root" onClick={navigateToRoot}>Корень</span>
            {breadcrumbPath.map((el, index) => (
              <span key={el.id} className="breadcrumb-item">
                <span className="breadcrumb-separator">/</span>
                <span 
                  className={`breadcrumb-name ${index === breadcrumbPath.length - 1 ? 'current' : ''}`}
                  onClick={() => index < breadcrumbPath.length - 1 && navigateInto(breadcrumbPath[index].id)}
                >
                  {ELEMENT_TYPES[el.type]?.icon} {el.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Заголовок текущего уровня */}
      {currentViewElement && (
        <div className="current-level-header">
          <span className="level-icon">{ELEMENT_TYPES[currentViewElement.type]?.icon}</span>
          <span className="level-name">{currentViewElement.name}</span>
          <span className="level-children">
            ({elements.filter(e => e.parentId === currentViewId).length} элементов)
          </span>
        </div>
      )}

      <div 
        ref={containerRef} 
        className="flowchart-canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <canvas ref={canvasRef} className="flowchart-canvas" />
        
        {/* Подсказки */}
        <div className="flowchart-hints">
          <span>ПКМ — меню</span>
          <span>2×клик — инфо / внутрь 🏢</span>
          <span>Del — удалить</span>
        </div>
        
        {/* Кнопка авто-подгонки */}
        <button 
          className="fit-to-view-btn"
          onClick={() => {
            const container = containerRef.current;
            if (container) {
              const rect = container.getBoundingClientRect();
              fitToView(rect.width, rect.height);
            }
          }}
          title="Подогнать масштаб"
        >
          ⊞
        </button>
        
        {isConnecting && (
          <div className="flowchart-connecting-hint">
            Кликните на элемент для создания связи
          </div>
        )}
        
        {dropTargetId && (
          <div className="flowchart-drop-hint">
            Отпустите для вложения
          </div>
        )}
      </div>

      {/* Контекстное меню */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
          onCreateElement={handleCreateElement}
        />
      )}

      {infoModalElement && (
        <ElementInfoModal
          element={infoModalElement}
          onClose={() => setInfoModalElement(null)}
        />
      )}

      {showPluginTypeModal && (
        <PluginTypeModal
          onClose={() => setShowPluginTypeModal(false)}
          onSelect={handlePluginTypeSelect}
        />
      )}
    </div>
  );
}

export default FlowchartCanvas;
