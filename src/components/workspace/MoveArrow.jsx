import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function MoveArrow({ 
  direction, 
  position, 
  rotation, 
  color, 
  onClick, 
  onHover, 
  onLeave,
  isHovered,
  otherHovered,
  arrowSize
}) {
  const groupRef = useRef();
  const targetScale = useRef(1);

  // Плавная анимация масштаба
  useFrame(() => {
    if (!groupRef.current) return;
    
    let target = 1;
    
    if (isHovered) {
      // Эта стрелка наведена - увеличиваем
      target = 1.4;
    } else if (otherHovered) {
      // Другая стрелка наведена - уменьшаем
      target = 0.75;
    } else {
      // Нет наведений - нормальный размер
      target = 1;
    }
    
    targetScale.current = target;
    
    const currentScale = groupRef.current.scale.x;
    // Плавная интерполяция масштаба
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale.current, 0.2);
    groupRef.current.scale.set(newScale, newScale, newScale);
    
    // Если очень близко к целевому масштабу, устанавливаем точное значение
    if (Math.abs(newScale - targetScale.current) < 0.01) {
      groupRef.current.scale.set(targetScale.current, targetScale.current, targetScale.current);
    }
  });

  const handlePointerOver = (e) => {
    e.stopPropagation();
    if (onHover) onHover();
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    if (onLeave) onLeave();
    document.body.style.cursor = 'default';
  };

  return (
    <group 
      ref={groupRef} 
      position={position} 
      rotation={rotation}
      onClick={onClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh>
        <coneGeometry args={[arrowSize * 0.3, arrowSize, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -arrowSize / 2, 0]}>
        <cylinderGeometry args={[arrowSize * 0.1, arrowSize * 0.1, arrowSize * 0.5, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export default MoveArrow;

