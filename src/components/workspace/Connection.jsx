import { useMemo, useState } from 'react';
import { Line, Text } from '@react-three/drei';
import { useSceneStore } from '../../store/sceneStore';
import { getEntityRadius } from '../../utils/collisionUtils';
import * as THREE from 'three';

function Connection({ connection, fromPosition, toPosition, fromEntity, toEntity }) {
  const selectConnection = useSceneStore((state) => state.selectConnection);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const isSelected = selectedConnectionId === connection.id;
  
  // Для hover состояния (можно добавить в store позже)
  const [isHovered, setIsHovered] = useState(false);

  // Вычисляем точки на поверхности сфер
  const { startPoint, endPoint } = useMemo(() => {
    const [x1, y1, z1] = fromPosition;
    const [x2, y2, z2] = toPosition;
    
    // Получаем радиусы сфер для обеих сущностей
    const radius1 = fromEntity ? getEntityRadius(fromEntity) : 0.5;
    const radius2 = toEntity ? getEntityRadius(toEntity) : 0.5;
    
    // Направление от первой сущности ко второй
    const direction = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
    direction.normalize();
    
    // Точка начала на поверхности первой сферы
    const start = new THREE.Vector3(x1, y1, z1).add(
      direction.multiplyScalar(radius1)
    );
    
    // Направление от второй сущности к первой (обратное)
    const reverseDirection = new THREE.Vector3(x1 - x2, y1 - y2, z1 - z2);
    reverseDirection.normalize();
    
    // Точка конца на поверхности второй сферы
    const end = new THREE.Vector3(x2, y2, z2).add(
      reverseDirection.multiplyScalar(radius2)
    );
    
    return { startPoint: start, endPoint: end };
  }, [fromPosition, toPosition, fromEntity, toEntity]);

  // Создаем плавную кривую между двумя точками на поверхности
  const curve = useMemo(() => {
    const start = startPoint;
    const end = endPoint;
    
    // Вычисляем расстояние между точками
    const distance = start.distanceTo(end);
    
    // Очень легкий изгиб - плавная линия, но не совсем прямая
    const bendAmount = Math.min(distance * 0.08, 1.0); // Максимальный изгиб 1 единица (более плавно)
    
    // Направление от start к end
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // Небольшой изгиб вверх для естественности
    const controlOffset = new THREE.Vector3(0, bendAmount, 0);
    
    // Контрольные точки расположены ближе к началу и концу для более плавной кривой
    const t1 = 0.33; // Первая контрольная точка на 1/3 пути
    const t2 = 0.67; // Вторая контрольная точка на 2/3 пути
    
    const control1 = new THREE.Vector3()
      .lerpVectors(start, midpoint, t1)
      .add(controlOffset);
    const control2 = new THREE.Vector3()
      .lerpVectors(midpoint, end, t2 - 0.33)
      .add(controlOffset);
    
    // Используем Cubic Bezier для очень плавной, слегка изогнутой линии
    return new THREE.CubicBezierCurve3(start, control1, control2, end);
  }, [startPoint, endPoint]);

  // Генерируем точки для линии (больше точек для более плавной кривой)
  const points = useMemo(() => {
    return curve.getPoints(60);
  }, [curve]);

  // Цвет связи
  const lineColor = useMemo(() => {
    if (isSelected) {
      return '#ffff00'; // Желтый для выбранной связи
    }
    if (isHovered) {
      return '#88ccff'; // Голубой для hover
    }
    return connection.color || '#ffffff';
  }, [isSelected, isHovered, connection.color]);

  // Вычисляем точки стрелки на конце связи
  const arrowPoints = useMemo(() => {
    // Получаем направление в конечной точке кривой
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2] || points[points.length - 1];
    
    const arrowDirection = new THREE.Vector3()
      .subVectors(lastPoint, secondLastPoint)
      .normalize();
    
    // Стрелка немного отступает от поверхности элемента
    const arrowOffset = 0.1;
    const arrowPosition = new THREE.Vector3(lastPoint.x, lastPoint.y, lastPoint.z)
      .sub(arrowDirection.clone().multiplyScalar(arrowOffset));
    
    // Параметры стрелки
    const arrowLength = 0.15;
    const arrowAngle = Math.PI / 6;
    
    // Перпендикулярный вектор для создания конуса стрелки
    const perp = new THREE.Vector3(1, 0, 0);
    if (Math.abs(arrowDirection.dot(perp)) > 0.9) {
      perp.set(0, 1, 0);
    }
    const right = new THREE.Vector3().crossVectors(arrowDirection, perp).normalize();
    
    const tip = arrowPosition;
    const back1 = arrowPosition.clone().sub(
      arrowDirection.clone().multiplyScalar(arrowLength)
    ).add(right.clone().multiplyScalar(arrowLength * Math.tan(arrowAngle)));
    const back2 = arrowPosition.clone().sub(
      arrowDirection.clone().multiplyScalar(arrowLength)
    ).sub(right.clone().multiplyScalar(arrowLength * Math.tan(arrowAngle)));
    
    return [tip, back1, back2, tip];
  }, [points]);
  
  // Вычисляем точки стрелки на начале связи (для bidirectional)
  const startArrowPoints = useMemo(() => {
    if (!connection.bidirectional) return null;
    
    const firstPoint = points[0];
    const secondPoint = points[1] || points[0];
    const startDirection = new THREE.Vector3()
      .subVectors(secondPoint, firstPoint)
      .normalize();
    
    const startArrowOffset = 0.1;
    const startArrowPosition = new THREE.Vector3(firstPoint.x, firstPoint.y, firstPoint.z)
      .add(startDirection.clone().multiplyScalar(startArrowOffset));
    
    const startArrowLength = 0.15;
    const startArrowAngle = Math.PI / 6;
    
    const startPerp = new THREE.Vector3(1, 0, 0);
    if (Math.abs(startDirection.dot(startPerp)) > 0.9) {
      startPerp.set(0, 1, 0);
    }
    const startRight = new THREE.Vector3().crossVectors(startDirection, startPerp).normalize();
    
    const startTip = startArrowPosition;
    const startBack1 = startArrowPosition.clone().sub(
      startDirection.clone().multiplyScalar(startArrowLength)
    ).add(startRight.clone().multiplyScalar(startArrowLength * Math.tan(startArrowAngle)));
    const startBack2 = startArrowPosition.clone().sub(
      startDirection.clone().multiplyScalar(startArrowLength)
    ).sub(startRight.clone().multiplyScalar(startArrowLength * Math.tan(startArrowAngle)));
    
    return [startTip, startBack1, startBack2, startTip];
  }, [points, connection.bidirectional]);

  const handleClick = (e) => {
    e.stopPropagation();
    selectConnection(connection.id);
  };

  // Позиция для метки (середина кривой)
  const labelPosition = useMemo(() => {
    const midIndex = Math.floor(points.length / 2);
    return points[midIndex];
  }, [points]);

  return (
    <group>
      {/* Основная линия с эффектом свечения для выбранных */}
      {isSelected && (
        <Line
          points={points}
          color={lineColor}
          lineWidth={7}
          transparent
          opacity={0.3}
        />
      )}
      
      {/* Основная линия */}
      <Line
        points={points}
        color={lineColor}
        lineWidth={isSelected ? 5 : (isHovered ? 4.5 : 4)}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setIsHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setIsHovered(false);
          document.body.style.cursor = 'default';
        }}
      />
      
      {/* Стрелка на конце связи */}
      <Line
        points={arrowPoints}
        color={lineColor}
        lineWidth={isSelected ? 5 : (isHovered ? 4.5 : 4)}
        onClick={handleClick}
      />
      
      {/* Стрелка на начале связи (если bidirectional) */}
      {startArrowPoints && (
        <Line
          points={startArrowPoints}
          color={lineColor}
          lineWidth={isSelected ? 5 : (isHovered ? 4.5 : 4)}
          onClick={handleClick}
        />
      )}
      
      {/* Метка (label) если есть */}
      {connection.label && (
        <Text
          position={[labelPosition.x, labelPosition.y + 0.3, labelPosition.z]}
          fontSize={0.15}
          color={lineColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {connection.label}
        </Text>
      )}
    </group>
  );
}

export default Connection;

