import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function AnimatedSphere({ 
  radius, 
  color, 
  emissive,
  hasConnections, 
  onClick, 
  onPointerOver, 
  onPointerOut, 
  userData 
}) {
  const meshRef = useRef();
  const pulsePhase = useRef(0);

  // Анимация пульсации для сфер без соединений
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    if (!hasConnections) {
      // Пульсация: плавное увеличение и уменьшение размера
      pulsePhase.current += delta * 2.0; // Скорость пульсации
      // Пульсация от 0.95 до 1.05 (5% в каждую сторону)
      const pulseScale = 1.0 + Math.sin(pulsePhase.current) * 0.05;
      
      meshRef.current.scale.set(pulseScale, pulseScale, pulseScale);
    } else {
      // Если есть соединения, возвращаем к нормальному размеру
      const currentScale = meshRef.current.scale.x;
      const newScale = THREE.MathUtils.lerp(currentScale, 1, 0.15);
      meshRef.current.scale.set(newScale, newScale, newScale);
    }
  });

  return (
    <mesh
      ref={meshRef}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      userData={userData}
    >
      <sphereGeometry args={[radius, 32, 32]} />
      <meshStandardMaterial
        color={hasConnections ? color : '#ff6600'} // Желто-красный для пульсирующих
        transparent={true}
        opacity={hasConnections ? 0.2 : 0.3}
        wireframe={false}
        side={THREE.DoubleSide}
        emissive={hasConnections ? (emissive || 0x000000) : '#ff6600'}
        emissiveIntensity={hasConnections ? (emissive ? 0.3 : 0) : 0.3} // Свечение для пульсирующих или из element
      />
    </mesh>
  );
}

export default AnimatedSphere;

