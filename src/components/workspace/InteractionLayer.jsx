import { useRef, useState, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useSceneStore } from '../../store/sceneStore';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

function InteractionLayer() {
  const { camera, raycaster, pointer } = useThree();
  const connectMode = useSceneStore((state) => state.connectMode);
  const connectingFrom = useSceneStore((state) => state.connectingFrom);
  const elements = useSceneStore((state) => state.elements);
  const [dragPosition, setDragPosition] = useState(null);

  useFrame(() => {
    if (!connectMode || !connectingFrom) return;

    // Обновляем позицию курсора в 3D пространстве
    raycaster.setFromCamera(pointer, camera);
    
    // Используем плоскость на уровне Y=0 для визуализации
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);
    setDragPosition(intersectPoint);
  });

  // Временная линия при создании связи
  const tempLinePoints = useMemo(() => {
    if (!connectingFrom || !dragPosition) return null;

    const fromElement = elements.find((e) => e.id === connectingFrom);
    if (!fromElement) return null;

    const [x1, y1, z1] = fromElement.position;
    const start = new THREE.Vector3(x1, y1, z1);
    const end = dragPosition.clone();

    return [start, end];
  }, [connectingFrom, dragPosition, elements]);

  return (
    <>
      {/* Временная линия при создании связи */}
      {tempLinePoints && (
        <Line
          points={tempLinePoints}
          color="#00ff00"
          lineWidth={2}
          dashed
        />
      )}
    </>
  );
}

export default InteractionLayer;

