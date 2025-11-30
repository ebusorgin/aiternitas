import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, TransformControls } from '@react-three/drei';
import { useSceneStore } from '../../store/sceneStore';
import MoveArrows from './MoveArrows';
import EntityShape from './EntityShape';
import AnimatedSphere from './AnimatedSphere';
import * as THREE from 'three';

function EntityCube({ element }) {
  const meshRef = useRef();
  const selectElement = useSceneStore((state) => state.selectElement);
  const selectedElementId = useSceneStore((state) => state.selectedElementId);
  const updateElement = useSceneStore((state) => state.updateElement);
  const connectMode = useSceneStore((state) => state.connectMode);
  const createConnection = useSceneStore((state) => state.createConnection);
  const connectingFrom = useSceneStore((state) => state.connectingFrom);
  const setConnectingFrom = useSceneStore((state) => state.setConnectingFrom);
  
  const isSelected = selectedElementId === element.id;
  const isConnecting = connectMode && connectingFrom === element.id;
  const connections = useSceneStore((state) => state.connections);
  
  // Проверяем, имеет ли элемент соединения
  const hasConnections = connections.some(
    (conn) => conn.from === element.id || conn.to === element.id
  );

  // Цвет куба
  const color = useMemo(() => {
    return new THREE.Color(element.color || '#3b82f6');
  }, [element.color]);

  // Цвет сферы из element (для воркеров)
  const sphereEmissiveColor = useMemo(() => {
    if (element.emissive) {
      return new THREE.Color(element.emissive);
    }
    return null;
  }, [element.emissive]);

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
        if (connectingFrom !== element.id) {
          // Создаем связь
          createConnection({
            from: connectingFrom,
            to: element.id
          });
          setConnectingFrom(null);
        } else {
          // Отменяем выбор
          setConnectingFrom(null);
        }
      } else {
        // Начинаем соединение
        setConnectingFrom(element.id);
      }
    } else {
      // Обычный режим - выделение
      selectElement(element.id);
    }
  };

  // Обработка изменения позиции через TransformControls
  const handleObjectChange = () => {
    if (meshRef.current) {
      const position = meshRef.current.position;
      updateElement(element.id, {
        position: [position.x, position.y, position.z]
      });
    }
  };

  const [sx, sy, sz] = element.size || [1, 1, 1];
  const elementType = element.type || 'box';
  
  // Вычисляем размер сферы: персонаж должен быть внутри, но не касаться краев
  // Для персонажей используем более точный расчет, учитывая что они обычно выше чем шире
  const maxDimension = Math.max(sx, sy, sz);
  // Сфера должна быть достаточно большой, чтобы персонаж был внутри с небольшим отступом
  const sphereRadius = maxDimension * 0.7; // Размер сферы
  const hasSphere = elementType !== 'box';

  // Анимация позиции - локальное состояние для плавного перемещения
  const [x, y, z] = element.position || [0, 0, 0];
  const animatedPosition = useRef(new THREE.Vector3(x, y, z));
  const groupRef = useRef();

  // Инициализируем позицию при первом рендере
  useEffect(() => {
    const [posX, posY, posZ] = element.position || [0, 0, 0];
    animatedPosition.current.set(posX, posY, posZ);
    if (groupRef.current) {
      groupRef.current.position.set(posX, posY, posZ);
    }
  }, [element.id]); // Только при создании нового элемента

  // Плавная интерполяция позиции в каждом кадре
  useFrame(() => {
    if (!groupRef.current) return;
    
    const [targetX, targetY, targetZ] = element.position || [0, 0, 0];
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
          emissive={sphereEmissiveColor}
          hasConnections={hasConnections}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default';
          }}
          userData={{ isElement: true, elementId: element.id }}
        />
      )}
      
      {/* Форма элемента в зависимости от типа */}
      <group ref={meshRef} userData={{ isElement: true, elementId: element.id }}>
        <EntityShape
          key={`${element.id}-${elementType}`}
          type={elementType}
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
          userData={{ isElement: true, elementId: element.id }}
        />
      </group>

      {/* Текст с именем над кубом - улучшенная читаемость */}
      {element.name && (
        <Text
          position={[0, sy / 2 + 0.6, 0]}
          fontSize={0.25}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000000"
          maxWidth={2}
          renderOrder={1000}
        >
          {/* Показываем только первые 20 символов для читаемости */}
          {element.name.length > 20 ? element.name.substring(0, 20) + '...' : element.name}
        </Text>
      )}

      {/* Стрелки для перемещения по осям - внутри группы куба, чтобы следовать за ним */}
      {isSelected && (
        <MoveArrows
          element={element}
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

