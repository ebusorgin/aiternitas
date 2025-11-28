import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useSceneStore } from '../../store/sceneStore';
import { getEntityRadius } from '../../utils/collisionUtils';
import * as THREE from 'three';

function Connection({ connection, fromPosition, toPosition, fromEntity, toEntity }) {
  const selectConnection = useSceneStore((state) => state.selectConnection);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const isSelected = selectedConnectionId === connection.id;

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
    return connection.color || '#ffffff';
  }, [isSelected, connection.color]);

  const handleClick = (e) => {
    e.stopPropagation();
    selectConnection(connection.id);
  };

  return (
    <Line
      points={points}
      color={lineColor}
      lineWidth={isSelected ? 5 : 4}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    />
  );
}

export default Connection;

