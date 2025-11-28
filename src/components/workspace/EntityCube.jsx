import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, TransformControls } from '@react-three/drei';
import { useSceneStore } from '../../store/sceneStore';
import MoveArrows from './MoveArrows';
import EntityShape from './EntityShape';
import AnimatedSphere from './AnimatedSphere';
import * as THREE from 'three';

function EntityCube({ entity }) {
  const meshRef = useRef();
  const selectEntity = useSceneStore((state) => state.selectEntity);
  const selectedEntityId = useSceneStore((state) => state.selectedEntityId);
  const updateEntity = useSceneStore((state) => state.updateEntity);
  const connectMode = useSceneStore((state) => state.connectMode);
  const createConnection = useSceneStore((state) => state.createConnection);
  const connectingFrom = useSceneStore((state) => state.connectingFrom);
  const setConnectingFrom = useSceneStore((state) => state.setConnectingFrom);
  
  const isSelected = selectedEntityId === entity.id;
  const isConnecting = connectMode && connectingFrom === entity.id;
  const connections = useSceneStore((state) => state.connections);
  
  // Проверяем, имеет ли сущность соединения
  const hasConnections = connections.some(
    (conn) => conn.from === entity.id || conn.to === entity.id
  );

  // Цвет куба
  const color = useMemo(() => {
    return new THREE.Color(entity.color || '#3b82f6');
  }, [entity.color]);

  // Подсветка при выборе или соединении
  const emissiveColor = useMemo(() => {
    if (isSelected) {
      return new THREE.Color(0x444444); // Подсветка для выбранного куба
    }
    if (isConnecting) {
      return new THREE.Color(0x00ff00); // Зеленая подсветка для соединения
    }
    return new THREE.Color(0x000000);
  }, [isSelected, isConnecting]);

  // Обработка клика
  const handleClick = (e) => {
    e.stopPropagation();
    
    if (connectMode) {
      // Режим соединения
      if (connectingFrom) {
        if (connectingFrom !== entity.id) {
          // Создаем связь
          createConnection({
            from: connectingFrom,
            to: entity.id
          });
          setConnectingFrom(null);
        } else {
          // Отменяем выбор
          setConnectingFrom(null);
        }
      } else {
        // Начинаем соединение
        setConnectingFrom(entity.id);
      }
    } else {
      // Обычный режим - выделение
      selectEntity(entity.id);
    }
  };

  // Обработка изменения позиции через TransformControls
  const handleObjectChange = () => {
    if (meshRef.current) {
      const position = meshRef.current.position;
      updateEntity(entity.id, {
        position: [position.x, position.y, position.z]
      });
    }
  };

  const [sx, sy, sz] = entity.size || [1, 1, 1];
  const entityType = entity.type || 'box';
  
  // Вычисляем размер сферы: персонаж должен быть внутри, но не касаться краев
  // Для персонажей используем более точный расчет, учитывая что они обычно выше чем шире
  const maxDimension = Math.max(sx, sy, sz);
  // Сфера должна быть достаточно большой, чтобы персонаж был внутри с небольшим отступом
  const sphereRadius = maxDimension * 0.7; // Размер сферы
  const hasSphere = entityType !== 'box';

  // Анимация позиции - локальное состояние для плавного перемещения
  const [x, y, z] = entity.position || [0, 0, 0];
  const animatedPosition = useRef(new THREE.Vector3(x, y, z));
  const groupRef = useRef();

  // Инициализируем позицию при первом рендере
  useEffect(() => {
    const [posX, posY, posZ] = entity.position || [0, 0, 0];
    animatedPosition.current.set(posX, posY, posZ);
    if (groupRef.current) {
      groupRef.current.position.set(posX, posY, posZ);
    }
  }, [entity.id]); // Только при создании новой сущности

  // Плавная интерполяция позиции в каждом кадре
  useFrame(() => {
    if (!groupRef.current) return;
    
    const [targetX, targetY, targetZ] = entity.position || [0, 0, 0];
    const target = new THREE.Vector3(targetX, targetY, targetZ);
    
    // Используем lerp для плавной интерполяции (скорость 0.2 - быстрее, но все еще плавно)
    animatedPosition.current.lerp(target, 0.2);
    
    // Обновляем позицию группы
    groupRef.current.position.copy(animatedPosition.current);
    
    // Если очень близко к целевой позиции, устанавливаем точное значение
    if (animatedPosition.current.distanceTo(target) < 0.01) {
      animatedPosition.current.copy(target);
      groupRef.current.position.copy(target);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Сфера-оболочка вокруг персонажа (только для не-box типов) - кликабельная */}
      {hasSphere && (
        <AnimatedSphere
          radius={sphereRadius}
          color={color}
          hasConnections={hasConnections}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default';
          }}
          userData={{ isEntity: true, entityId: entity.id }}
        />
      )}
      
      {/* Форма сущности в зависимости от типа */}
      <group ref={meshRef} userData={{ isEntity: true, entityId: entity.id }}>
        <EntityShape
          key={`${entity.id}-${entityType}`}
          type={entityType}
          size={[sx, sy, sz]}
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={isSelected ? 0.3 : 0}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default';
          }}
          userData={{ isEntity: true, entityId: entity.id }}
        />
      </group>

      {/* Текст с именем над кубом */}
      {entity.name && (
        <Text
          position={[0, sy / 2 + 0.5, 0]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {entity.name}
        </Text>
      )}

      {/* Стрелки для перемещения по осям - внутри группы куба, чтобы следовать за ним */}
      {isSelected && (
        <MoveArrows
          entity={entity}
          size={[sx, sy, sz]}
          sphereRadius={hasSphere ? sphereRadius : null}
        />
      )}

      {/* TransformControls для перемещения (опционально, можно отключить) */}
      {false && isSelected && meshRef.current && (
        <TransformControls
          object={meshRef.current}
          mode="translate"
          onObjectChange={handleObjectChange}
        />
      )}
    </group>
  );
}

export default EntityCube;

