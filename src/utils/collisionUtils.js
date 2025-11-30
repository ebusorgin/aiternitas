/**
 * Вычисляет радиус сферы для элемента
 */
export function getEntityRadius(element) {
  const [sx, sy, sz] = element.size || [1, 1, 1];
  const maxDimension = Math.max(sx, sy, sz);
  const elementType = element.type || 'box';
  
  // Для персонажей используем сферу, для других - максимальный размер
  if (elementType !== 'box') {
    return maxDimension * 0.7;
  }
  return maxDimension / 2;
}

/**
 * Проверяет, пересекаются ли два элемента
 */
export function checkCollision(element1, element2) {
  // Проверяем, что у обоих элементов есть position
  if (!element1.position || !element2.position) {
    return false;
  }
  
  const [x1, y1, z1] = element1.position;
  const [x2, y2, z2] = element2.position;
  
  const radius1 = getEntityRadius(element1);
  const radius2 = getEntityRadius(element2);
  
  // Вычисляем расстояние между центрами
  const distance = Math.sqrt(
    Math.pow(x2 - x1, 2) + 
    Math.pow(y2 - y1, 2) + 
    Math.pow(z2 - z1, 2)
  );
  
  // Если расстояние меньше суммы радиусов + небольшой зазор, то коллизия
  const minDistance = radius1 + radius2 + 0.2; // 0.2 - зазор между объектами
  
  return distance < minDistance;
}

/**
 * Проверяет, пересекается ли элемент в заданной позиции с другими элементами
 */
export function checkPositionCollision(position, size, type, elements, excludeId = null) {
  // Убеждаемся, что elements - это массив
  if (!Array.isArray(elements) || elements.length === 0) {
    return false;
  }
  
  const testElement = {
    position,
    size,
    type,
    id: excludeId || 'temp'
  };
  
  return elements.some(element => {
    if (element.id === excludeId) return false;
    // Проверяем, что у element есть position
    if (!element.position) return false;
    return checkCollision(testElement, element);
  });
}

/**
 * Находит свободную позицию для нового элемента
 */
export function findFreePosition(size, type, elements, startPosition = [0, 1, 0]) {
  // Убеждаемся, что elements - это массив
  const elementsArray = Array.isArray(elements) ? elements : [];
  
  const radius = getEntityRadius({ size, type });
  const spacing = radius * 2.5; // Расстояние между объектами
  
  // Если стартовая позиция свободна, используем её
  if (!checkPositionCollision(startPosition, size, type, elementsArray)) {
    return startPosition;
  }
  
  // Поиск свободной позиции по спирали (расширяющиеся круги)
  for (let layer = 1; layer < 15; layer++) {
    const layerRadius = spacing * layer;
    const elementsPerLayer = Math.max(8, layer * 6); // Количество точек на слое увеличивается
    
    // Пробуем разные углы
    for (let i = 0; i < elementsPerLayer; i++) {
      const angle = (i / elementsPerLayer) * Math.PI * 2;
      const x = startPosition[0] + Math.cos(angle) * layerRadius;
      const z = startPosition[2] + Math.sin(angle) * layerRadius;
      const y = startPosition[1]; // Сохраняем Y координату
      
      const testPosition = [x, y, z];
      
      if (!checkPositionCollision(testPosition, size, type, elementsArray)) {
        return testPosition;
      }
    }
    
    // Также пробуем позиции выше и ниже на этом слое
    for (let i = 0; i < elementsPerLayer; i++) {
      const angle = (i / elementsPerLayer) * Math.PI * 2;
      const x = startPosition[0] + Math.cos(angle) * layerRadius;
      const z = startPosition[2] + Math.sin(angle) * layerRadius;
      
      // Позиция выше
      const yUp = startPosition[1] + spacing * 1.5;
      const testPositionUp = [x, yUp, z];
      
      if (!checkPositionCollision(testPositionUp, size, type, elementsArray)) {
        return testPositionUp;
      }
      
      // Позиция ниже (если не ниже нуля)
      const yDown = Math.max(0.5, startPosition[1] - spacing * 1.5);
      const testPositionDown = [x, yDown, z];
      
      if (!checkPositionCollision(testPositionDown, size, type, elementsArray)) {
        return testPositionDown;
      }
    }
  }
  
  // Если не нашли свободное место на горизонтальных слоях, возвращаем позицию значительно выше
  return [startPosition[0], startPosition[1] + spacing * 5, startPosition[2]];
}

