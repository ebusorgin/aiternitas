/**
 * Вычисляет радиус сферы для сущности
 */
export function getEntityRadius(entity) {
  const [sx, sy, sz] = entity.size || [1, 1, 1];
  const maxDimension = Math.max(sx, sy, sz);
  const entityType = entity.type || 'box';
  
  // Для персонажей используем сферу, для других - максимальный размер
  if (entityType !== 'box') {
    return maxDimension * 0.7;
  }
  return maxDimension / 2;
}

/**
 * Проверяет, пересекаются ли две сущности
 */
export function checkCollision(entity1, entity2) {
  const [x1, y1, z1] = entity1.position;
  const [x2, y2, z2] = entity2.position;
  
  const radius1 = getEntityRadius(entity1);
  const radius2 = getEntityRadius(entity2);
  
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
 * Проверяет, пересекается ли сущность в заданной позиции с другими сущностями
 */
export function checkPositionCollision(position, size, type, entities, excludeId = null) {
  const testEntity = {
    position,
    size,
    type,
    id: excludeId || 'temp'
  };
  
  return entities.some(entity => {
    if (entity.id === excludeId) return false;
    return checkCollision(testEntity, entity);
  });
}

/**
 * Находит свободную позицию для новой сущности
 */
export function findFreePosition(size, type, entities, startPosition = [0, 1, 0]) {
  const radius = getEntityRadius({ size, type });
  const spacing = radius * 2.5; // Расстояние между объектами
  
  // Если стартовая позиция свободна, используем её
  if (!checkPositionCollision(startPosition, size, type, entities)) {
    return startPosition;
  }
  
  // Поиск свободной позиции по спирали (расширяющиеся круги)
  for (let layer = 1; layer < 15; layer++) {
    const layerRadius = spacing * layer;
    const entitiesPerLayer = Math.max(8, layer * 6); // Количество точек на слое увеличивается
    
    // Пробуем разные углы
    for (let i = 0; i < entitiesPerLayer; i++) {
      const angle = (i / entitiesPerLayer) * Math.PI * 2;
      const x = startPosition[0] + Math.cos(angle) * layerRadius;
      const z = startPosition[2] + Math.sin(angle) * layerRadius;
      const y = startPosition[1]; // Сохраняем Y координату
      
      const testPosition = [x, y, z];
      
      if (!checkPositionCollision(testPosition, size, type, entities)) {
        return testPosition;
      }
    }
    
    // Также пробуем позиции выше и ниже на этом слое
    for (let i = 0; i < entitiesPerLayer; i++) {
      const angle = (i / entitiesPerLayer) * Math.PI * 2;
      const x = startPosition[0] + Math.cos(angle) * layerRadius;
      const z = startPosition[2] + Math.sin(angle) * layerRadius;
      
      // Позиция выше
      const yUp = startPosition[1] + spacing * 1.5;
      const testPositionUp = [x, yUp, z];
      
      if (!checkPositionCollision(testPositionUp, size, type, entities)) {
        return testPositionUp;
      }
      
      // Позиция ниже (если не ниже нуля)
      const yDown = Math.max(0.5, startPosition[1] - spacing * 1.5);
      const testPositionDown = [x, yDown, z];
      
      if (!checkPositionCollision(testPositionDown, size, type, entities)) {
        return testPositionDown;
      }
    }
  }
  
  // Если не нашли свободное место на горизонтальных слоях, возвращаем позицию значительно выше
  return [startPosition[0], startPosition[1] + spacing * 5, startPosition[2]];
}

