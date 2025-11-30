import { useState, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useSceneStore } from '../../store/sceneStore';
import MoveArrow from './MoveArrow';
import { checkPositionCollision } from '../../utils/collisionUtils';
import * as THREE from 'three';

function MoveArrows({ element, size, sphereRadius }) {
  const { camera, raycaster } = useThree();
  const updateElement = useSceneStore((state) => state.updateElement);
  const elements = useSceneStore((state) => state.elements);
  const orbitControls = useSceneStore((state) => state.orbitControls);
  const [sx, sy, sz] = size || [1, 1, 1];
  const [hoveredDirection, setHoveredDirection] = useState(null);
  const groupRef = useRef();
  
  // Состояние для перетаскивания
  const [isDragging, setIsDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState(null);
  const dragStartPositionRef = useRef(null);
  const dragStartElementPositionRef = useRef(null);
  
  // Состояние видимости стрелок (обновляется в каждом кадре)
  const [visibleArrows, setVisibleArrows] = useState({
    up: true,
    down: true,
    right: true,
    left: true,
    forward: true,
    back: true
  });
  
  // Ref для хранения предыдущих значений, чтобы избежать лишних обновлений
  const prevVisibleArrowsRef = useRef(visibleArrows);
  

  // Расстояние для перемещения равно размеру куба или сферы
  const moveDistance = sphereRadius ? sphereRadius * 2 : Math.max(sx, sy, sz);
  
  // Если есть сфера, стрелки должны быть на её краях, иначе на краях куба
  const radiusForArrows = sphereRadius || Math.max(sx, sy, sz) / 2;

  // Начало перетаскивания
  const handleArrowDown = (direction, e) => {
    e.stopPropagation();
    
    setIsDragging(true);
    setDragDirection(direction);
    
    // Сохраняем начальную позицию мыши и элемента
    const [x, y] = [e.clientX, e.clientY];
    dragStartPositionRef.current = { x, y };
    dragStartElementPositionRef.current = [...element.position];
    
    // Блокируем камеру
    if (orbitControls) {
      orbitControls.enabled = false;
    }
    
    // Блокируем прокрутку страницы
    document.body.style.overflow = 'hidden';
    document.body.style.userSelect = 'none';
  };
  
  // Обработка движения мыши во время перетаскивания
  useEffect(() => {
    if (!isDragging || !dragDirection) return;
    
    const handleMouseMove = (e) => {
      if (!dragStartPositionRef.current || !dragStartElementPositionRef.current || !groupRef.current) return;
      
      // Вычисляем направление стрелки в локальных координатах
      let directionLocal = new THREE.Vector3();
      switch (dragDirection) {
        case 'up':
          directionLocal.set(0, 1, 0);
          break;
        case 'down':
          directionLocal.set(0, -1, 0);
          break;
        case 'right':
          directionLocal.set(1, 0, 0);
          break;
        case 'left':
          directionLocal.set(-1, 0, 0);
          break;
        case 'forward':
          directionLocal.set(0, 0, 1);
          break;
        case 'back':
          directionLocal.set(0, 0, -1);
          break;
      }
      
      // Преобразуем направление в мировые координаты
      // Для направления используем только ротацию, без трансляции
      const directionWorld = new THREE.Vector3();
      directionWorld.copy(directionLocal);
      // Применяем только ротацию из матрицы мира
      const matrix = new THREE.Matrix4();
      matrix.extractRotation(groupRef.current.matrixWorld);
      directionWorld.applyMatrix4(matrix);
      directionWorld.normalize();
      
      // Получаем позицию элемента в мировых координатах
      const elementWorldPosition = new THREE.Vector3(...dragStartElementPositionRef.current);
      
      // Вычисляем смещение мыши в экранных координатах
      const deltaX = e.clientX - dragStartPositionRef.current.x;
      const deltaY = e.clientY - dragStartPositionRef.current.y;
      
      // Преобразуем движение мыши в движение в 3D пространстве
      // Используем raycaster для проекции движения мыши
      const mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      const mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
      
      const startMouseX = (dragStartPositionRef.current.x / window.innerWidth) * 2 - 1;
      const startMouseY = -(dragStartPositionRef.current.y / window.innerHeight) * 2 + 1;
      
      // Создаем два луча: один для начальной позиции, другой для текущей
      raycaster.setFromCamera(new THREE.Vector2(startMouseX, startMouseY), camera);
      const startRay = raycaster.ray.clone();
      
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const currentRay = raycaster.ray.clone();
      
      // Находим точку пересечения начального луча с плоскостью, проходящей через элемент
      // Плоскость перпендикулярна направлению камеры
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(cameraDirection, elementWorldPosition);
      
      const startIntersect = new THREE.Vector3();
      const currentIntersect = new THREE.Vector3();
      
      const startIntersected = startRay.intersectPlane(plane, startIntersect);
      const currentIntersected = currentRay.intersectPlane(plane, currentIntersect);
      
      if (startIntersected && currentIntersected) {
        // Вычисляем смещение в плоскости
        const planeDelta = new THREE.Vector3().subVectors(currentIntersect, startIntersect);
        
        // Проецируем это смещение на направление стрелки
        const moveAmount = planeDelta.dot(directionWorld);
        
        // Вычисляем новую позицию вдоль прямой линии
        const moveVector = directionWorld.clone().multiplyScalar(moveAmount);
        const newPosition = new THREE.Vector3(...dragStartElementPositionRef.current)
          .add(moveVector);
        
        // Проверяем коллизии
        const hasCollision = checkPositionCollision(
          [newPosition.x, newPosition.y, newPosition.z],
          element.size || [1, 1, 1],
          element.type || 'box',
          elements,
          element.id
        );
        
        // Обновляем позицию, если нет коллизии
        if (!hasCollision) {
          updateElement(element.id, { 
            position: [newPosition.x, newPosition.y, newPosition.z] 
          });
        }
      }
    };
    
    const handleMouseUp = () => {
      // Разблокируем камеру
      if (orbitControls) {
        orbitControls.enabled = true;
      }
      
      // Разблокируем прокрутку страницы
      document.body.style.overflow = '';
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      setIsDragging(false);
      setDragDirection(null);
      dragStartPositionRef.current = null;
      dragStartElementPositionRef.current = null;
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragDirection, element, camera, raycaster, updateElement, elements, orbitControls]);

  const handleHover = (direction) => {
    setHoveredDirection(direction);
  };

  const handleLeave = () => {
    setHoveredDirection(null);
  };

  // Размер стрелок зависит от размера сферы или куба
  const arrowSize = radiusForArrows * 0.3;

  // Позиции стрелок в локальных координатах
  const arrowPositions = {
    up: [0, radiusForArrows + arrowSize * 0.5, 0],
    down: [0, -radiusForArrows - arrowSize * 0.5, 0],
    right: [radiusForArrows + arrowSize * 0.5, 0, 0],
    left: [-radiusForArrows - arrowSize * 0.5, 0, 0],
    forward: [0, 0, radiusForArrows + arrowSize * 0.5],
    back: [0, 0, -radiusForArrows - arrowSize * 0.5]
  };

  // Обновляем видимость стрелок в каждом кадре на основе позиции камеры
  useFrame(() => {
    if (!groupRef.current) return;
    
    // Получаем мировую позицию камеры
    const cameraWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPosition);
    
    // Получаем мировую позицию центра элемента (группа MoveArrows находится в центре элемента)
    const elementWorldPosition = new THREE.Vector3();
    groupRef.current.getWorldPosition(elementWorldPosition);
    
    // Направление от центра элемента к камере (в мировых координатах)
    const toCamera = new THREE.Vector3().subVectors(cameraWorldPosition, elementWorldPosition).normalize();
    
    // Вычисляем видимость каждой стрелки
    const newVisibleArrows = {};
    
    Object.keys(arrowPositions).forEach(direction => {
      const arrowLocalPos = arrowPositions[direction];
      
      // Преобразуем локальную позицию стрелки в мировые координаты
      const arrowWorldPos = new THREE.Vector3().fromArray(arrowLocalPos);
      groupRef.current.localToWorld(arrowWorldPos);
      
      // Направление от центра элемента к стрелке (в мировых координатах)
      const toArrow = new THREE.Vector3().subVectors(arrowWorldPos, elementWorldPosition).normalize();
      
      // Если скалярное произведение положительное, стрелка видна
      const dotProduct = toCamera.dot(toArrow);
      newVisibleArrows[direction] = dotProduct > 0;
    });
    
    // Обновляем состояние только если изменилось
    const hasChanged = Object.keys(newVisibleArrows).some(
      key => newVisibleArrows[key] !== prevVisibleArrowsRef.current[key]
    );
    
    if (hasChanged) {
      prevVisibleArrowsRef.current = newVisibleArrows;
      setVisibleArrows(newVisibleArrows);
    }
  });

  // Стрелки должны быть в группе, которая следует за позицией куба
  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Стрелка вверх (+Y) */}
      {visibleArrows.up && (
        <MoveArrow
          direction="up"
          position={[0, radiusForArrows + arrowSize * 0.5, 0]}
          rotation={[0, 0, 0]}
          color="#00ff00"
          onPointerDown={(e) => handleArrowDown('up', e)}
          onHover={() => handleHover('up')}
          onLeave={handleLeave}
          isHovered={hoveredDirection === 'up'}
          otherHovered={hoveredDirection !== null && hoveredDirection !== 'up'}
          arrowSize={arrowSize}
          isDragging={isDragging && dragDirection === 'up'}
        />
      )}

      {/* Стрелка вниз (-Y) */}
      {visibleArrows.down && (
        <MoveArrow
          direction="down"
          position={[0, -radiusForArrows - arrowSize * 0.5, 0]}
          rotation={[Math.PI, 0, 0]}
          color="#ff0000"
          onPointerDown={(e) => handleArrowDown('down', e)}
          onHover={() => handleHover('down')}
          onLeave={handleLeave}
          isHovered={hoveredDirection === 'down'}
          otherHovered={hoveredDirection !== null && hoveredDirection !== 'down'}
          arrowSize={arrowSize}
          isDragging={isDragging && dragDirection === 'down'}
        />
      )}

      {/* Стрелка вправо (+X) */}
      {visibleArrows.right && (
        <MoveArrow
          direction="right"
          position={[radiusForArrows + arrowSize * 0.5, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          color="#0000ff"
          onPointerDown={(e) => handleArrowDown('right', e)}
          onHover={() => handleHover('right')}
          onLeave={handleLeave}
          isHovered={hoveredDirection === 'right'}
          otherHovered={hoveredDirection !== null && hoveredDirection !== 'right'}
          arrowSize={arrowSize}
          isDragging={isDragging && dragDirection === 'right'}
        />
      )}

      {/* Стрелка влево (-X) */}
      {visibleArrows.left && (
        <MoveArrow
          direction="left"
          position={[-radiusForArrows - arrowSize * 0.5, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          color="#ffff00"
          onPointerDown={(e) => handleArrowDown('left', e)}
          onHover={() => handleHover('left')}
          onLeave={handleLeave}
          isHovered={hoveredDirection === 'left'}
          otherHovered={hoveredDirection !== null && hoveredDirection !== 'left'}
          arrowSize={arrowSize}
          isDragging={isDragging && dragDirection === 'left'}
        />
      )}

      {/* Стрелка вперед (+Z) */}
      {visibleArrows.forward && (
        <MoveArrow
          direction="forward"
          position={[0, 0, radiusForArrows + arrowSize * 0.5]}
          rotation={[Math.PI / 2, 0, 0]}
          color="#ff00ff"
          onPointerDown={(e) => handleArrowDown('forward', e)}
          onHover={() => handleHover('forward')}
          onLeave={handleLeave}
          isHovered={hoveredDirection === 'forward'}
          otherHovered={hoveredDirection !== null && hoveredDirection !== 'forward'}
          arrowSize={arrowSize}
          isDragging={isDragging && dragDirection === 'forward'}
        />
      )}

      {/* Стрелка назад (-Z) */}
      {visibleArrows.back && (
        <MoveArrow
          direction="back"
          position={[0, 0, -radiusForArrows - arrowSize * 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          color="#00ffff"
          onPointerDown={(e) => handleArrowDown('back', e)}
          onHover={() => handleHover('back')}
          onLeave={handleLeave}
          isHovered={hoveredDirection === 'back'}
          otherHovered={hoveredDirection !== null && hoveredDirection !== 'back'}
          arrowSize={arrowSize}
          isDragging={isDragging && dragDirection === 'back'}
        />
      )}
    </group>
  );
}

export default MoveArrows;

