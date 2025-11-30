import { useEffect, useState, useMemo } from 'react';
import { Grid } from '@react-three/drei';
import { useSceneStore } from '../../store/sceneStore';
import EntityCube from './EntityCube';
import Connection from './Connection';
import { getEntityRadius } from '../../utils/collisionUtils';

function NestedScene3D({ scene, position, radius, parentRadius, isSelected, onClick, childrenCount = 0 }) {
  const [x, y, z] = position;
  const socket = useSceneStore((state) => state.socket);
  const [sceneElements, setSceneElements] = useState([]);
  const [sceneConnections, setSceneConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Загружаем elements и connections для этой сцены
  useEffect(() => {
    if (!socket || !socket.connected || !scene.id) {
      return;
    }
    
    setLoading(true);
    
    // Загружаем сцену через socket
    socket.emit('scene:load', scene.id);
    
    const handleSceneState = (data) => {
      if (data.sceneId === scene.id) {
        setSceneElements(data.elements || []);
        setSceneConnections(data.connections || []);
        setLoading(false);
      }
    };
    
    const handleElementCreated = (element) => {
      // Проверяем, относится ли element к этой сцене
      // Для этого нужно проверить через текущее состояние
      setSceneElements(prev => {
        // Если element уже есть, не добавляем
        if (prev.find(e => e.id === element.id)) return prev;
        return [...prev, element];
      });
    };
    
    const handleElementUpdated = (element) => {
      setSceneElements(prev => prev.map(e => e.id === element.id ? element : e));
    };
    
    const handleElementDeleted = ({ id }) => {
      setSceneElements(prev => prev.filter(e => e.id !== id));
      setSceneConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    };
    
    const handleConnectionsUpdated = (connections) => {
      // Обновляем connections для elements этой сцены
      setSceneConnections(prev => {
        const elementIds = new Set(sceneElements.map(e => e.id));
        return connections.filter(c => elementIds.has(c.from) || elementIds.has(c.to));
      });
    };
    
    socket.on('scene:state', handleSceneState);
    socket.on('element:created', handleElementCreated);
    socket.on('element:updated', handleElementUpdated);
    socket.on('element:deleted', handleElementDeleted);
    socket.on('connections:updated', handleConnectionsUpdated);
    
    return () => {
      socket.off('scene:state', handleSceneState);
      socket.off('element:created', handleElementCreated);
      socket.off('element:updated', handleElementUpdated);
      socket.off('element:deleted', handleElementDeleted);
      socket.off('connections:updated', handleConnectionsUpdated);
    };
  }, [socket, scene.id]);
  
  // Константы для размещения elements в верхней части сферы
  const MIN_SCALE = 0.05;
  const MAX_SCALE = 1.0;
  const MIN_ELEMENT_RADIUS = 0.2;
  const UPPER_PART_RADIUS_FACTOR = 0.55; // Используем 55% радиуса для верхней части
  
  // childrenCount передается через props
  
  // ВАЖНО: elements должны быть в ВЕРХНЕЙ части, дочерние сцены в НИЖНЕЙ
  
  // Масштабирование elements с учетом количества дочерних сцен
  const scale = useMemo(() => {
    if (sceneElements.length === 0) {
      return MIN_SCALE;
    }
    
    const elementsCount = sceneElements.length;
    
    // Находим максимальный радиус элемента
    let maxElementRadius = MIN_ELEMENT_RADIUS;
    for (let i = 0; i < sceneElements.length; i++) {
      const elementRadius = getEntityRadius(sceneElements[i]);
      if (elementRadius > maxElementRadius) {
        maxElementRadius = elementRadius;
      }
    }
    
    // Размер элемента зависит от количества elements и дочерних сцен
    let elementSizeFactor = 0.12; // Базовый фактор
    
    // Если есть и elements и дочерние сцены
    if (childrenCount > 0) {
      // Если 1 element и 1 сцена - одинаковый размер
      if (elementsCount === 1 && childrenCount === 1) {
        elementSizeFactor = 0.15;
      }
      // Если 1 element и 2+ сцены - element больше
      else if (elementsCount === 1 && childrenCount >= 2) {
        elementSizeFactor = 0.2;
      }
      // В остальных случаях пропорционально
      else {
        elementSizeFactor = 0.12 + (elementsCount * 0.02);
      }
    } else {
      // Только elements
      elementSizeFactor = 0.12 + (elementsCount * 0.02);
    }
    
    // Рассчитываем масштаб для размещения в верхней части
    const availableRadius = radius * UPPER_PART_RADIUS_FACTOR;
    const calculatedScale = (availableRadius * elementSizeFactor) / Math.max(maxElementRadius, MIN_ELEMENT_RADIUS);
    
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, calculatedScale));
  }, [radius, sceneElements, childrenCount]);
  
  // Размещаем elements в ВЕРХНЕЙ части сферы с проверкой коллизий
  const constrainedElements = useMemo(() => {
    const elementsCount = sceneElements.length;
    const upperPartRadius = radius * UPPER_PART_RADIUS_FACTOR;
    const verticalOffset = radius * 0.45; // Смещение вверх (45% от радиуса) - четко в верхней части
    const COLLISION_MARGIN = 0.08; // Увеличенный зазор между elements
    
    const placedElements = [];
    
    return sceneElements.map((element, index) => {
      const [sx, sy, sz] = element.size || [1, 1, 1];
      
      // Масштабируем размеры элемента
      const scaledSize = [sx * scale, sy * scale, sz * scale];
      const elementRadius = getEntityRadius({ ...element, size: scaledSize });
      
      // Размещаем в ВЕРХНЕЙ части сферы по кругу с проверкой коллизий
      let finalX, finalY, finalZ;
      let attempts = 0;
      const maxAttempts = 100;
      let foundPosition = false;
      
      while (!foundPosition && attempts < maxAttempts) {
        // Базовый угол для равномерного распределения
        const baseAngle = (index / Math.max(elementsCount, 1)) * Math.PI * 2;
        const angle = baseAngle + attempts * 0.15; // Смещение при попытках
        const tryRadius = upperPartRadius * 0.75 * (1 - attempts * 0.008); // Уменьшаем радиус при попытках
        
        // ВАЖНО: elements в ВЕРХНЕЙ части (положительный Y)
        finalX = Math.cos(angle) * tryRadius;
        finalY = verticalOffset + Math.abs(Math.sin(attempts * 0.2)) * 0.1; // В верхней части, немного выше
        finalZ = Math.sin(angle) * tryRadius;
        
        // Проверяем, что элемент не выходит за границы верхней части
        const distanceFromCenter = Math.sqrt(finalX ** 2 + (finalY - verticalOffset) ** 2 + finalZ ** 2);
        if (distanceFromCenter + elementRadius + COLLISION_MARGIN > upperPartRadius) {
          attempts++;
          continue;
        }
        
        // Проверяем коллизии с уже размещенными elements
        let hasCollision = false;
        for (const placed of placedElements) {
          const [px, py, pz] = placed.position;
          const pr = placed.radius;
          const distance = Math.sqrt(
            (finalX - px) ** 2 + (finalY - py) ** 2 + (finalZ - pz) ** 2
          );
          if (distance < elementRadius + pr + COLLISION_MARGIN) {
            hasCollision = true;
            break;
          }
        }
        
        if (!hasCollision) {
          foundPosition = true;
        } else {
          attempts++;
        }
      }
      
      // Fallback: равномерное распределение по кругу в ВЕРХНЕЙ части
      if (!foundPosition) {
        const angle = (index / Math.max(elementsCount, 1)) * Math.PI * 2;
        const safeRadius = Math.min(upperPartRadius * 0.65, upperPartRadius - elementRadius - COLLISION_MARGIN);
        finalX = Math.cos(angle) * safeRadius;
        finalY = verticalOffset + 0.05; // В верхней части
        finalZ = Math.sin(angle) * safeRadius;
      }
      
      const result = {
        ...element,
        position: [finalX, finalY, finalZ],
        size: scaledSize,
        radius: elementRadius
      };
      
      placedElements.push(result);
      return result;
    });
  }, [sceneElements, scale, radius]);
  
  if (loading) {
    return null; // Не показываем ничего пока загружается
  }
  
  return (
    <group position={[x, y, z]}>
      {/* Координатная сетка внутри сцены */}
      <Grid
        args={[radius * 1.5, radius * 1.5]}
        cellColor="#4a5568"
        sectionColor="#667eea"
        cellThickness={0.2}
        sectionThickness={0.4}
        fadeDistance={radius * 1.5}
        fadeStrength={0.6}
        followCamera={false}
        infiniteGrid={false}
      />
      
      {/* Elements внутри сцены */}
      {constrainedElements.map((element) => (
        <EntityCube
          key={element.id}
          element={{
            ...element,
            position: element.position
          }}
        />
      ))}
      
      {/* Connections между elements */}
      {sceneConnections.map((connection) => {
        const fromEntity = constrainedEntities.find(e => e.id === connection.from);
        const toEntity = constrainedEntities.find(e => e.id === connection.to);
        
        if (!fromEntity || !toEntity) return null;
        
        return (
          <Connection
            key={connection.id}
            connection={connection}
            fromPosition={fromEntity.position}
            toPosition={toEntity.position}
            fromEntity={fromEntity}
            toEntity={toEntity}
          />
        );
      })}
    </group>
  );
}

export default NestedScene3D;

