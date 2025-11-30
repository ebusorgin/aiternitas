import { ElementFactory } from '../models/Elements';

/**
 * Определяет тип элемента (scene, worker, block)
 * @param {Object} element - элемент
 * @returns {string} - тип элемента
 */
export function getElementType(element) {
  if (!element) return null;
  
  // Используем ElementFactory для определения типа
  return ElementFactory.getElementType(element);
}

/**
 * Получает размер элемента в экранных координатах
 * @param {Object} element - элемент
 * @param {number} zoom - уровень зума
 * @param {Function} getSceneSize - функция для получения размера сцены (опционально)
 * @returns {Object} - { width, height } в экранных координатах
 */
export function getElementSize(element, zoom, getSceneSize = null) {
  if (!element) return { width: 0, height: 0 };
  
  const elementType = getElementType(element);
  
  if (elementType === 'scene') {
    // Для сцен используем getSceneSize если предоставлена, иначе из size_2d
    if (getSceneSize) {
      const [worldWidth, worldHeight] = getSceneSize(element);
      return {
        width: worldWidth * zoom,
        height: worldHeight * zoom
      };
    }
    const size = element.size_2d || [200, 150];
    return {
      width: size[0] * zoom,
      height: size[1] * zoom
    };
  } else {
    // Для worker и block - фиксированный размер
    return {
      width: 120 * zoom,
      height: 80 * zoom
    };
  }
}

/**
 * Получает границы элемента в экранных координатах
 * @param {Object} element - элемент
 * @param {number} zoom - уровень зума
 * @param {Function} getPositionFn - функция для получения позиции элемента [x, z]
 * @param {Function} worldToScreen - функция преобразования мировых координат в экранные
 * @param {Function} getSceneSize - функция для получения размера сцены (опционально)
 * @returns {Object} - { x, y, width, height } в экранных координатах
 */
export function getElementBounds(element, zoom, getPositionFn, worldToScreen, getSceneSize = null) {
  if (!element || !getPositionFn || !worldToScreen) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  const position = getPositionFn(element);
  if (!position || position.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  const screenPos = worldToScreen(position[0], position[1]);
  const size = getElementSize(element, zoom, getSceneSize);
  
  return {
    x: screenPos.x,
    y: screenPos.y,
    width: size.width,
    height: size.height
  };
}

/**
 * Находит точку пересечения с краем прямоугольника
 * @param {number} centerX - центр прямоугольника по X
 * @param {number} centerY - центр прямоугольника по Y
 * @param {number} width - ширина прямоугольника
 * @param {number} height - высота прямоугольника
 * @param {number} targetX - целевая точка X
 * @param {number} targetY - целевая точка Y
 * @returns {Object} - { x, y } точка пересечения
 */
export function getRectangleEdgeIntersection(centerX, centerY, width, height, targetX, targetY) {
  // Границы прямоугольника
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;
  
  // Вектор направления от центра к цели
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  
  // Находим точку пересечения с каждой стороной прямоугольника
  let intersections = [];
  
  // Левая сторона (x = left)
  if (dx < 0) {
    const t = (left - centerX) / dx;
    const y = centerY + dy * t;
    if (y >= top && y <= bottom) {
      intersections.push({ x: left, y: y });
    }
  }
  
  // Правая сторона (x = right)
  if (dx > 0) {
    const t = (right - centerX) / dx;
    const y = centerY + dy * t;
    if (y >= top && y <= bottom) {
      intersections.push({ x: right, y: y });
    }
  }
  
  // Верхняя сторона (y = top)
  if (dy < 0) {
    const t = (top - centerY) / dy;
    const x = centerX + dx * t;
    if (x >= left && x <= right) {
      intersections.push({ x: x, y: top });
    }
  }
  
  // Нижняя сторона (y = bottom)
  if (dy > 0) {
    const t = (bottom - centerY) / dy;
    const x = centerX + dx * t;
    if (x >= left && x <= right) {
      intersections.push({ x: x, y: bottom });
    }
  }
  
  // Выбираем ближайшую точку пересечения
  if (intersections.length === 0) {
    // Если нет пересечений (не должно происходить), возвращаем угол
    return { x: centerX, y: centerY };
  }
  
  let closest = intersections[0];
  let minDist = Math.sqrt(
    Math.pow(intersections[0].x - targetX, 2) + 
    Math.pow(intersections[0].y - targetY, 2)
  );
  
  for (let i = 1; i < intersections.length; i++) {
    const dist = Math.sqrt(
      Math.pow(intersections[i].x - targetX, 2) + 
      Math.pow(intersections[i].y - targetY, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      closest = intersections[i];
    }
  }
  
  return closest;
}

/**
 * Вычисляет точки подключения на краях элементов
 * @param {Object} fromElement - элемент-источник
 * @param {Object} toElement - элемент-приемник
 * @param {Object} fromBounds - границы элемента-источника { x, y, width, height }
 * @param {Object} toBounds - границы элемента-приемника { x, y, width, height }
 * @returns {Object} - { fromPoint: {x, y}, toPoint: {x, y} }
 */
export function getConnectionPoints(fromElement, toElement, fromBounds, toBounds) {
  if (!fromBounds || !toBounds) {
    return { fromPoint: { x: 0, y: 0 }, toPoint: { x: 0, y: 0 } };
  }
  
  const fromCenterX = fromBounds.x;
  const fromCenterY = fromBounds.y;
  const toCenterX = toBounds.x;
  const toCenterY = toBounds.y;
  
  // Вычисляем точки на краях элементов
  const fromPoint = getRectangleEdgeIntersection(
    fromCenterX, fromCenterY, fromBounds.width, fromBounds.height,
    toCenterX, toCenterY
  );
  
  const toPoint = getRectangleEdgeIntersection(
    toCenterX, toCenterY, toBounds.width, toBounds.height,
    fromCenterX, fromCenterY
  );
  
  return { fromPoint, toPoint };
}

/**
 * Проверяет, находится ли точка на квадратичной кривой связи
 * @param {number} pointX - координата X точки
 * @param {number} pointY - координата Y точки
 * @param {Object} fromPoint - точка начала связи { x, y }
 * @param {Object} toPoint - точка конца связи { x, y }
 * @param {number} tolerance - допустимое расстояние от кривой (по умолчанию 5)
 * @returns {boolean} - true, если точка находится на кривой
 */
export function isPointOnConnection(pointX, pointY, fromPoint, toPoint, tolerance = 5) {
  if (!fromPoint || !toPoint) return false;
  
  // Вычисляем параметры квадратичной кривой (как в drawConnection2D)
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) return false;
  
  // Контрольная точка для квадратичной кривой
  const midX = (fromPoint.x + toPoint.x) / 2;
  const midY = (fromPoint.y + toPoint.y) / 2 - Math.min(distance * 0.2, 30);
  
  // Проверяем расстояние от точки до кривой
  // Используем метод деления пополам для поиска ближайшей точки на кривой
  let minDistance = Infinity;
  const steps = 50; // Количество точек для проверки
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Квадратичная кривая: P(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
    const curveX = (1 - t) * (1 - t) * fromPoint.x + 2 * (1 - t) * t * midX + t * t * toPoint.x;
    const curveY = (1 - t) * (1 - t) * fromPoint.y + 2 * (1 - t) * t * midY + t * t * toPoint.y;
    
    const dist = Math.sqrt(
      Math.pow(pointX - curveX, 2) + Math.pow(pointY - curveY, 2)
    );
    
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  
  return minDistance <= tolerance;
}

/**
 * Проверяет возможность создания связи между элементами
 * @param {Object} fromElement - элемент-источник
 * @param {Object} toElement - элемент-приемник
 * @returns {Object} - { valid: boolean, reason?: string }
 */
export function isValidConnection(fromElement, toElement) {
  if (!fromElement || !toElement) {
    return { valid: false, reason: 'Элементы не найдены' };
  }
  
  if (fromElement.id === toElement.id) {
    return { valid: false, reason: 'Нельзя создать связь элемента с самим собой' };
  }
  
  // Дополнительные проверки можно добавить здесь
  // Например, проверка на циклические зависимости для иерархических связей
  
  return { valid: true };
}

/**
 * Проверяет, существует ли уже связь между элементами
 * @param {Array} connections - массив всех связей
 * @param {string} fromId - ID элемента-источника
 * @param {string} toId - ID элемента-приемника
 * @param {boolean} checkBidirectional - учитывать bidirectional связи (по умолчанию true)
 * @returns {boolean} - true, если связь уже существует
 */
export function connectionExists(connections, fromId, toId, checkBidirectional = true) {
  if (!connections || !Array.isArray(connections)) return false;
  
  return connections.some(conn => {
    // Прямая связь
    if (conn.from === fromId && conn.to === toId) {
      return true;
    }
    
    // Обратная связь (если bidirectional или если проверяем все связи)
    if (checkBidirectional) {
      if (conn.from === toId && conn.to === fromId) {
        return true;
      }
      
      // Если связь bidirectional, она работает в обе стороны
      if (conn.bidirectional && (conn.from === fromId || conn.to === fromId) && (conn.from === toId || conn.to === toId)) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Валидирует связь перед созданием
 * @param {Object} connectionData - данные связи { from, to, bidirectional }
 * @param {Array} connections - массив всех существующих связей
 * @param {Array} allElements - массив всех элементов
 * @returns {Object} - { valid: boolean, reason?: string }
 */
export function validateConnectionBeforeCreate(connectionData, connections, allElements) {
  const { from, to } = connectionData;
  
  // Проверка базовой валидности
  const fromElement = allElements.find(e => e.id === from);
  const toElement = allElements.find(e => e.id === to);
  
  const basicValidation = isValidConnection(fromElement, toElement);
  if (!basicValidation.valid) {
    return basicValidation;
  }
  
  // Проверка на дубликаты
  if (connectionExists(connections, from, to)) {
    return { valid: false, reason: 'Связь между этими элементами уже существует' };
  }
  
  // Дополнительные проверки можно добавить здесь
  // Например, проверка на циклические зависимости
  
  return { valid: true };
}

/**
 * Получает позицию элемента с учетом перетаскивания
 * @param {Object} element - элемент
 * @param {string} elementType - тип элемента (scene, worker, block)
 * @param {string} draggingSceneId - ID перетаскиваемой сцены (если есть)
 * @param {string} draggingElementId - ID перетаскиваемого элемента (если есть)
 * @param {Object} localPositions - локальные позиции сцен
 * @param {Object} localPositions2D - локальные позиции элементов
 * @param {Function} getSceneAbsolutePositionWithLayout - функция для получения позиции сцены
 * @param {Function} getElementPosition2D - функция для получения позиции элемента
 * @returns {Array} - [x, z] позиция элемента
 */
export function getElementPosition(
  element,
  elementType,
  draggingSceneId,
  draggingElementId,
  localPositions,
  localPositions2D,
  getSceneAbsolutePositionWithLayout,
  getElementPosition2D
) {
  if (!element) return [0, 0];
  
  if (elementType === 'scene') {
    // Для сцен: проверяем localPositions при перетаскивании
    if (draggingSceneId === element.id && localPositions && localPositions[element.id]) {
      return localPositions[element.id];
    }
    // Иначе используем getSceneAbsolutePositionWithLayout
    if (getSceneAbsolutePositionWithLayout) {
      return getSceneAbsolutePositionWithLayout(element);
    }
    return element.position_2d || [0, 0];
  } else {
    // Для worker и block: проверяем localPositions2D при перетаскивании
    if (draggingElementId === element.id && localPositions2D && localPositions2D[element.id]) {
      return localPositions2D[element.id];
    }
    // Иначе используем getElementPosition2D
    if (getElementPosition2D) {
      return getElementPosition2D(element);
    }
    return element.position_2d || (element.position ? [element.position[0], element.position[2] || 0] : [0, 0]);
  }
}

