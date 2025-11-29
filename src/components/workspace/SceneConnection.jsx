import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

// Константы
const CURVE_SEGMENTS = 50; // Оптимизировано с 60
const BEND_FACTOR = 0.1;
const MAX_BEND = 1.5;
const DASH_SCALE = 0.5;
const DASH_SIZE = 0.1;
const GAP_SIZE = 0.1;

function SceneConnection({ from, to, isParentChild, fromRadius = 1.5, toRadius = 1.5 }) {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  
  // Вычисляем точки на поверхности сфер с учетом реальных радиусов
  const { startPoint, endPoint } = useMemo(() => {
    const direction = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
    const distance = direction.length();
    
    if (distance < 0.001) {
      // Если сцены слишком близко, возвращаем точки на поверхности
      return {
        startPoint: new THREE.Vector3(x1, y1, z1 + fromRadius),
        endPoint: new THREE.Vector3(x2, y2, z2 + toRadius)
      };
    }
    
    direction.normalize();
    
    // Точка начала на поверхности первой сферы
    const start = new THREE.Vector3(x1, y1, z1).add(
      direction.clone().multiplyScalar(fromRadius)
    );
    
    // Направление от второй сцены к первой (обратное)
    const reverseDirection = direction.clone().negate();
    
    // Точка конца на поверхности второй сферы
    const end = new THREE.Vector3(x2, y2, z2).add(
      reverseDirection.multiplyScalar(toRadius)
    );
    
    return { startPoint: start, endPoint: end };
  }, [x1, y1, z1, x2, y2, z2, fromRadius, toRadius]);
  
  // Создаем плавную кривую с оптимизацией
  const curve = useMemo(() => {
    const start = startPoint;
    const end = endPoint;
    
    const distance = start.distanceTo(end);
    const bendAmount = Math.min(distance * BEND_FACTOR, MAX_BEND);
    
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // Используем перпендикулярный вектор для изгиба
    const perpendicular = new THREE.Vector3(-direction.z, direction.y, direction.x);
    const controlOffset = perpendicular.multiplyScalar(bendAmount);
    
    const control1 = new THREE.Vector3()
      .lerpVectors(start, midpoint, 0.33)
      .add(controlOffset);
    const control2 = new THREE.Vector3()
      .lerpVectors(midpoint, end, 0.33)
      .add(controlOffset);
    
    return new THREE.CubicBezierCurve3(start, control1, control2, end);
  }, [startPoint, endPoint]);
  
  // Генерируем точки для линии
  const points = useMemo(() => {
    return curve.getPoints(CURVE_SEGMENTS);
  }, [curve]);
  
  // Цвет и стиль связи с улучшенной визуализацией
  const color = isParentChild ? '#888888' : '#60a5fa';
  const lineWidth = isParentChild ? 1.5 : 3;
  const glowColor = isParentChild ? '#666666' : '#93c5fd';
  
  return (
    <group>
      {/* Эффект свечения для обычных связей */}
      {!isParentChild && (
        <Line
          points={points}
          color={glowColor}
          lineWidth={lineWidth * 1.5}
          transparent
          opacity={0.3}
        />
      )}
      
      {/* Основная линия */}
      <Line
        points={points}
        color={color}
        lineWidth={lineWidth}
        dashed={isParentChild}
        dashScale={DASH_SCALE}
        dashSize={DASH_SIZE}
        gapSize={GAP_SIZE}
        transparent
        opacity={isParentChild ? 0.5 : 0.9}
      />
    </group>
  );
}

export default SceneConnection;

