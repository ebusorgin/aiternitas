import { useEffect, useState, useMemo } from 'react';
import { Grid } from '@react-three/drei';
import { useSceneStore } from '../../store/sceneStore';
import EntityCube from './EntityCube';
import Connection from './Connection';
import { getEntityRadius } from '../../utils/collisionUtils';

function NestedScene3D({ scene, position, radius, parentRadius, isSelected, onClick, childrenCount = 0 }) {
  const [x, y, z] = position;
  const socket = useSceneStore((state) => state.socket);
  const [sceneEntities, setSceneEntities] = useState([]);
  const [sceneConnections, setSceneConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Загружаем entities и connections для этой сцены
  useEffect(() => {
    if (!socket || !socket.connected || !scene.id) {
      return;
    }
    
    setLoading(true);
    
    // Загружаем сцену через socket
    socket.emit('scene:load', scene.id);
    
    const handleSceneState = (data) => {
      if (data.sceneId === scene.id) {
        setSceneEntities(data.entities || []);
        setSceneConnections(data.connections || []);
        setLoading(false);
      }
    };
    
    const handleEntityCreated = (entity) => {
      // Проверяем, относится ли entity к этой сцене
      // Для этого нужно проверить через текущее состояние
      setSceneEntities(prev => {
        // Если entity уже есть, не добавляем
        if (prev.find(e => e.id === entity.id)) return prev;
        return [...prev, entity];
      });
    };
    
    const handleEntityUpdated = (entity) => {
      setSceneEntities(prev => prev.map(e => e.id === entity.id ? entity : e));
    };
    
    const handleEntityDeleted = ({ id }) => {
      setSceneEntities(prev => prev.filter(e => e.id !== id));
      setSceneConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    };
    
    const handleConnectionsUpdated = (connections) => {
      // Обновляем connections для entities этой сцены
      setSceneConnections(prev => {
        const entityIds = new Set(sceneEntities.map(e => e.id));
        return connections.filter(c => entityIds.has(c.from) || entityIds.has(c.to));
      });
    };
    
    socket.on('scene:state', handleSceneState);
    socket.on('entity:created', handleEntityCreated);
    socket.on('entity:updated', handleEntityUpdated);
    socket.on('entity:deleted', handleEntityDeleted);
    socket.on('connections:updated', handleConnectionsUpdated);
    
    return () => {
      socket.off('scene:state', handleSceneState);
      socket.off('entity:created', handleEntityCreated);
      socket.off('entity:updated', handleEntityUpdated);
      socket.off('entity:deleted', handleEntityDeleted);
      socket.off('connections:updated', handleConnectionsUpdated);
    };
  }, [socket, scene.id]);
  
  // Константы для размещения entities в верхней части сферы
  const MIN_SCALE = 0.05;
  const MAX_SCALE = 1.0;
  const MIN_ENTITY_RADIUS = 0.2;
  const UPPER_PART_RADIUS_FACTOR = 0.55; // Используем 55% радиуса для верхней части
  
  // childrenCount передается через props
  
  // ВАЖНО: entities должны быть в ВЕРХНЕЙ части, дочерние сцены в НИЖНЕЙ
  
  // Масштабирование entities с учетом количества дочерних сцен
  const scale = useMemo(() => {
    if (sceneEntities.length === 0) {
      return MIN_SCALE;
    }
    
    const entitiesCount = sceneEntities.length;
    
    // Находим максимальный радиус сущности
    let maxEntityRadius = MIN_ENTITY_RADIUS;
    for (let i = 0; i < sceneEntities.length; i++) {
      const entityRadius = getEntityRadius(sceneEntities[i]);
      if (entityRadius > maxEntityRadius) {
        maxEntityRadius = entityRadius;
      }
    }
    
    // Размер сущности зависит от количества entities и дочерних сцен
    let entitySizeFactor = 0.12; // Базовый фактор
    
    // Если есть и сущности и дочерние сцены
    if (childrenCount > 0) {
      // Если 1 сущность и 1 сцена - одинаковый размер
      if (entitiesCount === 1 && childrenCount === 1) {
        entitySizeFactor = 0.15;
      }
      // Если 1 сущность и 2+ сцены - сущность больше
      else if (entitiesCount === 1 && childrenCount >= 2) {
        entitySizeFactor = 0.2;
      }
      // В остальных случаях пропорционально
      else {
        entitySizeFactor = 0.12 + (entitiesCount * 0.02);
      }
    } else {
      // Только сущности
      entitySizeFactor = 0.12 + (entitiesCount * 0.02);
    }
    
    // Рассчитываем масштаб для размещения в верхней части
    const availableRadius = radius * UPPER_PART_RADIUS_FACTOR;
    const calculatedScale = (availableRadius * entitySizeFactor) / Math.max(maxEntityRadius, MIN_ENTITY_RADIUS);
    
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, calculatedScale));
  }, [radius, sceneEntities, childrenCount]);
  
  // Размещаем entities в ВЕРХНЕЙ части сферы с проверкой коллизий
  const constrainedEntities = useMemo(() => {
    const entitiesCount = sceneEntities.length;
    const upperPartRadius = radius * UPPER_PART_RADIUS_FACTOR;
    const verticalOffset = radius * 0.45; // Смещение вверх (45% от радиуса) - четко в верхней части
    const COLLISION_MARGIN = 0.08; // Увеличенный зазор между entities
    
    const placedEntities = [];
    
    return sceneEntities.map((entity, index) => {
      const [sx, sy, sz] = entity.size || [1, 1, 1];
      
      // Масштабируем размеры сущности
      const scaledSize = [sx * scale, sy * scale, sz * scale];
      const entityRadius = getEntityRadius({ ...entity, size: scaledSize });
      
      // Размещаем в ВЕРХНЕЙ части сферы по кругу с проверкой коллизий
      let finalX, finalY, finalZ;
      let attempts = 0;
      const maxAttempts = 100;
      let foundPosition = false;
      
      while (!foundPosition && attempts < maxAttempts) {
        // Базовый угол для равномерного распределения
        const baseAngle = (index / Math.max(entitiesCount, 1)) * Math.PI * 2;
        const angle = baseAngle + attempts * 0.15; // Смещение при попытках
        const tryRadius = upperPartRadius * 0.75 * (1 - attempts * 0.008); // Уменьшаем радиус при попытках
        
        // ВАЖНО: entities в ВЕРХНЕЙ части (положительный Y)
        finalX = Math.cos(angle) * tryRadius;
        finalY = verticalOffset + Math.abs(Math.sin(attempts * 0.2)) * 0.1; // В верхней части, немного выше
        finalZ = Math.sin(angle) * tryRadius;
        
        // Проверяем, что сущность не выходит за границы верхней части
        const distanceFromCenter = Math.sqrt(finalX ** 2 + (finalY - verticalOffset) ** 2 + finalZ ** 2);
        if (distanceFromCenter + entityRadius + COLLISION_MARGIN > upperPartRadius) {
          attempts++;
          continue;
        }
        
        // Проверяем коллизии с уже размещенными entities
        let hasCollision = false;
        for (const placed of placedEntities) {
          const [px, py, pz] = placed.position;
          const pr = placed.radius;
          const distance = Math.sqrt(
            (finalX - px) ** 2 + (finalY - py) ** 2 + (finalZ - pz) ** 2
          );
          if (distance < entityRadius + pr + COLLISION_MARGIN) {
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
        const angle = (index / Math.max(entitiesCount, 1)) * Math.PI * 2;
        const safeRadius = Math.min(upperPartRadius * 0.65, upperPartRadius - entityRadius - COLLISION_MARGIN);
        finalX = Math.cos(angle) * safeRadius;
        finalY = verticalOffset + 0.05; // В верхней части
        finalZ = Math.sin(angle) * safeRadius;
      }
      
      const result = {
        ...entity,
        position: [finalX, finalY, finalZ],
        size: scaledSize,
        radius: entityRadius
      };
      
      placedEntities.push(result);
      return result;
    });
  }, [sceneEntities, scale, radius]);
  
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
      
      {/* Entities внутри сцены */}
      {constrainedEntities.map((entity) => (
        <EntityCube
          key={entity.id}
          entity={{
            ...entity,
            position: entity.position
          }}
        />
      ))}
      
      {/* Connections между entities */}
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

