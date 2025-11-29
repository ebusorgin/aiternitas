import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Grid } from '@react-three/drei';
import * as THREE from 'three';

// Константы цветов и материалов
const COLORS = {
  selected: 0x3b82f6,
  connecting: 0x00ff00,
  default: 0x667eea,
  emissiveSelected: 0x1e3a8a,
  emissiveConnecting: 0x00aa00,
  entity: 0x3b82f6,
  entityEmissive: 0x1e3a8a
};

const MATERIAL_PROPS = {
  metalness: 0.7,
  roughness: 0.3,
  entityMetalness: 0.8,
  entityRoughness: 0.2
};

const OPACITY = {
  selected: 0.4,
  default: 0.25,
  entity: 0.9
};

const MAX_VISIBLE_ENTITIES = 12;
const ENTITY_SIZE = 0.15;
const ENTITY_RADIUS_FACTOR = 0.7;
const GRID_MULTIPLIER = 2;

function SceneSphere({ scene, position, radius = 1.5, isSelected, isConnecting, onClick, onDoubleClick, allScenes, hasChildren = false, isChild = false, entitiesCount = 0 }) {
  const meshRef = useRef();
  const [x, y, z] = position;
  
  // Оптимизация: создаем цвета один раз и переиспользуем
  const color = useMemo(() => {
    const colorValue = isSelected ? COLORS.selected : 
                      isConnecting ? COLORS.connecting : 
                      COLORS.default;
    return new THREE.Color(colorValue);
  }, [isSelected, isConnecting]);
  
  // Подсветка
  const emissiveColor = useMemo(() => {
    const emissiveValue = isSelected ? COLORS.emissiveSelected : 
                          isConnecting ? COLORS.emissiveConnecting : 
                          0x000000;
    return new THREE.Color(emissiveValue);
  }, [isSelected, isConnecting]);
  
  const emissiveIntensity = isSelected || isConnecting ? 0.5 : 0;
  const opacity = isSelected ? OPACITY.selected : OPACITY.default;
  
  // Эффект свечения для выбранных сцен
  const glowRef = useRef();
  useFrame((state) => {
    if (glowRef.current && (isSelected || isConnecting)) {
      // Плавное пульсирование свечения
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 0.9;
      glowRef.current.scale.setScalar(1 + pulse * 0.05);
    }
  });
  
  return (
    <group position={[x, y, z]} renderOrder={isChild ? 1 : 0}>
      {/* Эффект свечения для выбранных сцен */}
      {(isSelected || isConnecting) && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[radius * 1.15, 32, 32]} />
          <meshStandardMaterial
            color={isSelected ? color : new THREE.Color(COLORS.connecting)}
            emissive={emissiveColor}
            emissiveIntensity={0.8}
            transparent={true}
            opacity={0.2}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (onDoubleClick) {
            onDoubleClick();
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
        }}
        renderOrder={isChild ? 1 : 0}
        castShadow
        receiveShadow
        // Включаем обработку двойного клика
        userData={{ isScene: true, sceneId: scene.id }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          metalness={MATERIAL_PROPS.metalness}
          roughness={MATERIAL_PROPS.roughness}
          transparent={true}
          opacity={opacity}
          depthWrite={false}
          depthTest={true}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Отображение entities внутри сцены (маленькие кубики) */}
      {entitiesCount > 0 && (
        <group>
          {Array.from({ length: Math.min(entitiesCount, MAX_VISIBLE_ENTITIES) }).map((_, i) => {
            const totalVisible = Math.min(entitiesCount, MAX_VISIBLE_ENTITIES);
            const angle = (i / totalVisible) * Math.PI * 2;
            const verticalAngle = (i % 3) * 0.5 - 0.5;
            const entityRadius = radius * ENTITY_RADIUS_FACTOR;
            const entityX = Math.cos(angle) * entityRadius * Math.cos(verticalAngle);
            const entityY = Math.sin(verticalAngle) * entityRadius;
            const entityZ = Math.sin(angle) * entityRadius * Math.cos(verticalAngle);
            
            return (
              <mesh key={i} position={[entityX, entityY, entityZ]}>
                <boxGeometry args={[ENTITY_SIZE, ENTITY_SIZE, ENTITY_SIZE]} />
                <meshStandardMaterial
                  color={new THREE.Color(COLORS.entity)}
                  emissive={new THREE.Color(COLORS.entityEmissive)}
                  emissiveIntensity={0.3}
                  metalness={MATERIAL_PROPS.entityMetalness}
                  roughness={MATERIAL_PROPS.entityRoughness}
                  transparent={true}
                  opacity={OPACITY.entity}
                />
              </mesh>
            );
          })}
          {entitiesCount > MAX_VISIBLE_ENTITIES && (
            <Text
              position={[0, -radius * 0.9, 0]}
              fontSize={0.12}
              color="#aaaaaa"
              anchorX="center"
              anchorY="middle"
            >
              +{entitiesCount - MAX_VISIBLE_ENTITIES}
            </Text>
          )}
        </group>
      )}
      
      {/* Координатная сетка внутри сцены (только для сцен с entities или дочерними) */}
      {(entitiesCount > 0 || hasChildren) && (
        <Grid
          args={[radius * GRID_MULTIPLIER, radius * GRID_MULTIPLIER]}
          cellColor="#4a5568"
          sectionColor="#667eea"
          cellThickness={0.3}
          sectionThickness={0.5}
          fadeDistance={radius * GRID_MULTIPLIER}
          fadeStrength={0.5}
          followCamera={false}
          infiniteGrid={false}
          position={[0, 0, 0]}
        />
      )}
      
      {/* Название сцены с улучшенной типографикой - выше для избежания перекрытий */}
      <Text
        position={[0, radius + 0.8, 0]}
        fontSize={0.3}
        color={isSelected ? '#ffffff' : '#e0e0e0'}
        anchorX="center"
        anchorY="middle"
        maxWidth={radius * 3}
        outlineWidth={isSelected ? 0.06 : 0.04}
        outlineColor="#000000"
        fontWeight="bold"
        renderOrder={1000} // Рендерим поверх всего
      >
        {scene.name || `Scene ${scene.id}`}
      </Text>
      
      {/* Индикатор количества entities - еще выше */}
      {entitiesCount > 0 && (
        <Text
          position={[0, radius + 0.5, 0]}
          fontSize={0.12}
          color="#aaaaaa"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
          renderOrder={1000}
        >
          {entitiesCount} {entitiesCount === 1 ? 'entity' : 'entities'}
        </Text>
      )}
    </group>
  );
}

export default SceneSphere;

