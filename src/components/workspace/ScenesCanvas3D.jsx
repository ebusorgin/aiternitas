import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment, Text } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import { AxesHelper } from 'three';
import * as THREE from 'three';
import SceneSphere from './SceneSphere';
import SceneConnection from './SceneConnection';
import NestedScene3D from './NestedScene3D';
import { getEntityRadius } from '../../utils/collisionUtils';

function ScenesCanvas3D({ 
  allScenes, 
  sceneConnections, 
  selectedSceneId, 
  onSceneSelect,
  connectMode,
  connectingFrom,
  onConnectingFromChange,
  onCreateConnection,
  scenesEntitiesCount = {}, // { sceneId: count }
  onSceneDoubleClick // Обработчик двойного клика для перехода внутрь сцены
}) {
  // Разделяем сцены на корневые и дочерние
  const rootScenes = useMemo(() => {
    return allScenes.filter(s => !s.parent_id);
  }, [allScenes]);

  // Оптимизация: создаем Maps для быстрого доступа (на уровне компонента)
  const scenesMap = useMemo(() => {
    return new Map(allScenes.map(s => [s.id, s]));
  }, [allScenes]);

  const childrenMap = useMemo(() => {
    const map = new Map();
    allScenes.forEach(scene => {
      if (scene.parent_id) {
        if (!map.has(scene.parent_id)) {
          map.set(scene.parent_id, []);
        }
        map.get(scene.parent_id).push(scene);
      }
    });
    return map;
  }, [allScenes]);

  // 1. Функция для нахождения максимальной глубины вложенности
  const findMaxDepth = useMemo(() => {
    const visited = new Set();
    
    const getDepth = (sceneId, currentDepth = 0) => {
      if (visited.has(sceneId)) return currentDepth;
      visited.add(sceneId);
      
      const children = allScenes.filter(s => s.parent_id === sceneId);
      if (children.length === 0) {
        return currentDepth;
      }
      
      let maxChildDepth = currentDepth;
      children.forEach(child => {
        const childDepth = getDepth(child.id, currentDepth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      });
      
      return maxChildDepth;
    };
    
    let maxDepth = 0;
    rootScenes.forEach(rootScene => {
      const depth = getDepth(rootScene.id, 0);
      maxDepth = Math.max(maxDepth, depth);
    });
    
    return maxDepth;
  }, [allScenes, rootScenes]);

  // Константы для расчета размеров
  const BASE_ENTITY_RADIUS = 0.2; // Базовый радиус сущности
  const BASE_CHILD_SCENE_RADIUS = 0.3; // Базовый радиус дочерней сцены
  const MIN_SCENE_RADIUS = 0.4; // Минимальный радиус сцены
  const CHILD_SCENE_SIZE_FACTOR = 0.15; // Размер дочерней сцены прямо пропорционален количеству
  const ENTITY_SIZE_FACTOR = 0.12; // Размер сущности прямо пропорционален количеству
  const SPACING_FACTOR = 0.1; // Зазор между объектами
  const COLLISION_MARGIN = 0.15; // Увеличенный зазор для предотвращения коллизий

  // 3. Реализация алгоритма расчета размеров снизу вверх
  const calculateSceneRadiiBottomUp = useMemo(() => {
    // Оптимизация: создаем Map для быстрого доступа к сценам по ID
    const scenesMap = new Map(allScenes.map(s => [s.id, s]));
    const childrenMap = new Map(); // sceneId -> children[]
    
    // Предварительно строим карту детей для каждого родителя
    allScenes.forEach(scene => {
      if (scene.parent_id) {
        if (!childrenMap.has(scene.parent_id)) {
          childrenMap.set(scene.parent_id, []);
        }
        childrenMap.get(scene.parent_id).push(scene);
      }
    });
    
    // Функция расчета размера сцены на основе количества дочерних сцен (прямо пропорционально)
    const calculateSceneRadiusFromChildren = (childrenCount) => {
      if (childrenCount === 0) {
        return MIN_SCENE_RADIUS;
      }
      // Прямо пропорциональный расчет: размер = базовый * количество
      return BASE_CHILD_SCENE_RADIUS + (childrenCount * CHILD_SCENE_SIZE_FACTOR);
    };
    
    // Функция расчета размера сущности внутри сцены
    const calculateEntitySizeInScene = (entitiesCount, childrenCount) => {
      if (entitiesCount === 0) {
        return 0;
      }
      
      // Если есть и сущности и дочерние сцены
      if (childrenCount > 0) {
        const totalObjects = entitiesCount + childrenCount;
        // Если 1 сущность и 1 сцена - одинаковый размер
        if (entitiesCount === 1 && childrenCount === 1) {
          return BASE_ENTITY_RADIUS;
        }
        // Если 1 сущность и 2+ сцены - сущность больше
        if (entitiesCount === 1 && childrenCount >= 2) {
          return BASE_ENTITY_RADIUS * 1.3;
        }
        // В остальных случаях пропорционально
        return BASE_ENTITY_RADIUS + (entitiesCount * ENTITY_SIZE_FACTOR);
      }
      
      // Только сущности
      return BASE_ENTITY_RADIUS + (entitiesCount * ENTITY_SIZE_FACTOR);
    };
    
    const sceneRadii = {};
    
    // Строим дерево сцен с уровнями (оптимизированная версия)
    const sceneLevels = {};
    const visited = new Set();
    
    const assignLevel = (sceneId, level) => {
      if (visited.has(sceneId)) return;
      visited.add(sceneId);
      
      if (!sceneLevels[level]) {
        sceneLevels[level] = [];
      }
      sceneLevels[level].push(sceneId);
      
      const children = childrenMap.get(sceneId) || [];
      children.forEach(child => {
        assignLevel(child.id, level + 1);
      });
    };
    
    rootScenes.forEach(rootScene => {
      assignLevel(rootScene.id, 0);
    });
    
    // Начинаем с максимальной глубины (листья) и идем вверх
    for (let level = findMaxDepth; level >= 0; level--) {
      const scenesAtLevel = sceneLevels[level] || [];
      
      scenesAtLevel.forEach(sceneId => {
        const scene = scenesMap.get(sceneId);
        if (!scene) return;
        
        const entitiesCount = scenesEntitiesCount[sceneId] || 0;
        const children = childrenMap.get(sceneId) || [];
        const childrenCount = children.length;
        
        // Размер сцены прямо пропорционален количеству дочерних сцен
        let sceneRadius = calculateSceneRadiusFromChildren(childrenCount);
        
        // Если есть дочерние сцены, учитываем их размеры для предотвращения коллизий
        if (childrenCount > 0) {
          let totalChildrenRadius = 0;
          let maxChildRadius = 0;
          
          children.forEach(child => {
            const childRadius = sceneRadii[child.id];
            if (childRadius === undefined) {
              // Если дочерняя сцена еще не рассчитана, используем базовый размер
              const childChildrenCount = (childrenMap.get(child.id) || []).length;
              const tempChildRadius = calculateSceneRadiusFromChildren(childChildrenCount);
              totalChildrenRadius += tempChildRadius;
              maxChildRadius = Math.max(maxChildRadius, tempChildRadius);
            } else {
              totalChildrenRadius += childRadius;
              maxChildRadius = Math.max(maxChildRadius, childRadius);
            }
          });
          
          // Размер родительской сферы должен быть достаточным для размещения всех детей
          // Прямо пропорционально количеству + зазоры + проверка коллизий
          const childrenSpacing = childrenCount * SPACING_FACTOR;
          // Учитываем, что дети размещаются в нижней части, нужен достаточный радиус
          const requiredRadius = Math.max(
            totalChildrenRadius * 0.6 + childrenSpacing + maxChildRadius + COLLISION_MARGIN * 2,
            maxChildRadius * 2 + COLLISION_MARGIN * 2 // Минимум 2x самого большого ребенка + зазоры
          );
          sceneRadius = Math.max(sceneRadius, requiredRadius);
        }
        
        // Учитываем сущности - они занимают верхнюю часть, но не влияют на размер сферы напрямую
        // Размер сферы определяется дочерними сценами
        
        sceneRadii[sceneId] = Math.max(sceneRadius, MIN_SCENE_RADIUS);
      });
    }
    
    // Обрабатываем сцены, которые не попали в дерево
    allScenes.forEach(scene => {
      if (!sceneRadii[scene.id]) {
        const childrenCount = (childrenMap.get(scene.id) || []).length;
        sceneRadii[scene.id] = calculateSceneRadiusFromChildren(childrenCount);
      }
    });
    
    return sceneRadii;
  }, [allScenes, rootScenes, findMaxDepth, scenesEntitiesCount]);

  // Функция проверки коллизии между двумя сценами
  const checkSceneCollision = (pos1, radius1, pos2, radius2) => {
    const [x1, y1, z1] = pos1;
    const [x2, y2, z2] = pos2;
    const distance = Math.sqrt(
      Math.pow(x2 - x1, 2) + 
      Math.pow(y2 - y1, 2) + 
      Math.pow(z2 - z1, 2)
    );
    const minDistance = radius1 + radius2 + COLLISION_MARGIN; // Зазор для предотвращения коллизий
    return distance < minDistance;
  };

  // Вычисляем позиции и размеры для всех сцен с учетом вложенности и количества entities
  // Дочерние сцены размещаются ВНУТРИ родительской сферы
  // Размеры уже рассчитаны снизу вверх
  const scenePositions = useMemo(() => {
    const positions = {};
    const visited = new Set();
    
    // Используем предварительно рассчитанные размеры
    const sceneRadii = calculateSceneRadiiBottomUp;
    
    // Функция проверки коллизии с уже размещенными сценами
    const checkCollisionWithPlaced = (testPos, testRadius, placedScenes, sceneRadii) => {
      return placedScenes.some(placedSceneId => {
        const placedPos = positions[placedSceneId];
        if (!placedPos) return false;
        const placedRadius = sceneRadii[placedSceneId] || 0;
        return checkSceneCollision(testPos, testRadius, placedPos, placedRadius);
      });
    };
    
    // Используем предварительно созданные Maps
    const siblingsMap = new Map(); // parentId -> siblings[]
    
    allScenes.forEach(scene => {
      if (scene.parent_id) {
        if (!siblingsMap.has(scene.parent_id)) {
          siblingsMap.set(scene.parent_id, []);
        }
        siblingsMap.get(scene.parent_id).push(scene);
      }
    });
    
    // Функция для вычисления позиции с учетом вложенности и коллизий
    const calculatePosition = (scene, baseX = 0, baseY = 0, baseZ = 0, level = 0, parentRadius = 0, placedSiblings = []) => {
      if (visited.has(scene.id)) return;
      visited.add(scene.id);
      
      const children = childrenMap.get(scene.id) || [];
      const hasChildren = children.length > 0;
      const baseRadius = sceneRadii[scene.id] || MIN_SCENE_RADIUS;
      
      let x, y, z;
      if (level > 0 && parentRadius > 0) {
        // Дочерние сцены размещаются в НИЖНЕЙ части родительской сферы
        const childRadius = baseRadius;
        const siblings = siblingsMap.get(scene.parent_id) || [];
        const siblingsCount = siblings.length;
        const childIndex = siblings.findIndex(s => s.id === scene.id);
        
        // Размещаем в НИЖНЕЙ части сферы (отрицательный Y)
        // Используем меньший радиус, чтобы дети точно поместились
        const lowerPartRadius = parentRadius * 0.45; // 45% радиуса для нижней части
        const verticalOffset = -parentRadius * 0.45; // Смещение вниз (45% от радиуса) - четко в нижней части
        
        // Распределяем по кругу в горизонтальной плоскости
        const angleStep = (Math.PI * 2) / Math.max(siblingsCount, 1);
        const baseAngle = angleStep * childIndex;
        
        // Пробуем разместить сцену, избегая коллизий
        let attempts = 0;
        const maxAttempts = 100; // Увеличено для лучшего поиска позиции
        let foundPosition = false;
        
        while (!foundPosition && attempts < maxAttempts) {
          // Спиральное распределение в нижней части с учетом коллизий
          const angleOffset = attempts * 0.15;
          const tryAngle = baseAngle + angleOffset;
          // Уменьшаем радиус при каждой попытке
          const tryRadius = lowerPartRadius * (1 - attempts * 0.008);
          // Вертикальное смещение для лучшего распределения
          const verticalShift = -Math.abs(Math.sin(attempts * 0.3)) * 0.1;
          
          x = baseX + Math.cos(tryAngle) * tryRadius;
          y = baseY + verticalOffset + verticalShift;
          z = baseZ + Math.sin(tryAngle) * tryRadius;
          
          // Проверяем, что сцена не выходит за границы родительской сферы
          const distanceFromCenter = Math.sqrt(x ** 2 + (y - baseY) ** 2 + z ** 2);
          if (distanceFromCenter + childRadius + COLLISION_MARGIN > parentRadius) {
            attempts++;
            continue;
          }
          
          const testPos = [x, y, z];
          if (!checkCollisionWithPlaced(testPos, childRadius + COLLISION_MARGIN, placedSiblings, sceneRadii)) {
            foundPosition = true;
          } else {
            attempts++;
          }
        }
        
        // Fallback: равномерное распределение по кругу в нижней части
        if (!foundPosition) {
          const safeRadius = Math.min(lowerPartRadius, parentRadius - childRadius - COLLISION_MARGIN);
          x = baseX + Math.cos(baseAngle) * safeRadius;
          y = baseY + verticalOffset;
          z = baseZ + Math.sin(baseAngle) * safeRadius;
        }
      } else {
        x = baseX;
        y = baseY;
        z = baseZ;
      }
      
      positions[scene.id] = [x, y, z];
      
      if (hasChildren) {
        const placedChildren = [];
        children.forEach((child) => {
          calculatePosition(child, x, y, z, level + 1, baseRadius, placedChildren);
          placedChildren.push(child.id);
        });
      }
    };
    
    // Вычисляем позиции для корневых сцен - размещаем их в ряд с учетом коллизий
    const placedRootScenes = [];
    const rootRadii = rootScenes.map(s => sceneRadii[s.id] || MIN_SCENE_RADIUS);
    const maxRootRadius = Math.max(...rootRadii);
    // Компактное размещение корневых сцен с учетом коллизий
    const minSpacing = Math.max(maxRootRadius * 2.5 + COLLISION_MARGIN * 2, 3); // Увеличенное расстояние для предотвращения коллизий
    
    rootScenes.forEach((scene, index) => {
      const sceneRadius = sceneRadii[scene.id] || MIN_SCENE_RADIUS;
      
      // Начальная позиция с учетом размеров всех сцен
      let x = (index - (rootScenes.length - 1) / 2) * minSpacing;
      let attempts = 0;
      const maxAttempts = 15; // Уменьшено для производительности
      
      while (attempts < maxAttempts && checkCollisionWithPlaced([x, 0, 0], sceneRadius, placedRootScenes, sceneRadii)) {
        x += minSpacing * 0.25; // Увеличено смещение для более быстрого поиска
        attempts++;
      }
      
      calculatePosition(scene, x, 0, 0, 0, 0, []);
      placedRootScenes.push(scene.id);
    });
    
    return { positions, sceneRadii: calculateSceneRadiiBottomUp };
  }, [allScenes, rootScenes, calculateSceneRadiiBottomUp, childrenMap]);

  // Обработка клика на пустое место
  const handlePointerMissed = (event) => {
    if (!connectMode) {
      onSceneSelect(null);
    } else {
      onConnectingFromChange(null);
    }
  };

  return (
    <Canvas
      gl={{ 
        antialias: true, 
        alpha: false, 
        toneMappingExposure: 1.3,
        toneMapping: THREE.ACESFilmicToneMapping,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
      }}
      dpr={[1, 2]}
      style={{ 
        width: '100%', 
        height: '100%', 
        background: 'radial-gradient(ellipse at center, #1a1f3a 0%, #0f1419 100%)' 
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#0f1419', 1);
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.fog = null;
        // Настройки для правильного рендеринга прозрачных объектов
        gl.sortObjects = true;
      }}
      onPointerMissed={handlePointerMissed}
    >
      {/* Улучшенное многоуровневое освещение */}
      <ambientLight intensity={1.0} color="#ffffff" />
      
      {/* Основной направленный свет с тенями */}
      <directionalLight 
        position={[15, 20, 15]} 
        intensity={2.0} 
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      
      {/* Дополнительный направленный свет для контраста */}
      <directionalLight 
        position={[-15, 12, -15]} 
        intensity={1.2} 
        color="#a0c4ff"
      />
      
      {/* Точечные источники света для глубины */}
      <pointLight position={[15, -10, 15]} intensity={0.8} color="#ffd89b" distance={30} decay={2} />
      <pointLight position={[-15, 12, -15]} intensity={0.8} color="#a0c4ff" distance={30} decay={2} />
      <pointLight position={[0, 25, 0]} intensity={0.6} color="#ffffff" distance={40} decay={2} />
      
      {/* Полусферический свет для мягкого освещения */}
      <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#2a3441" />
      
      {/* Environment для реалистичных отражений */}
      <Environment preset="sunset" />

      {/* Камера - оптимизирована для компактного вида */}
      <PerspectiveCamera makeDefault position={[0, 6, 12]} fov={60} />
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={20}
      />

      {/* Улучшенная сетка с лучшей видимостью */}
      <Grid
        args={[60, 60]}
        cellColor="#3a4458"
        sectionColor="#667eea"
        cellThickness={0.8}
        sectionThickness={1.5}
        fadeDistance={60}
        fadeStrength={0.9}
        infiniteGrid={true}
      />
      
      {/* Оси координат с улучшенной видимостью */}
      <primitive object={new AxesHelper(12)} />
      
      {/* Дополнительный свет снизу для подсветки */}
      <pointLight position={[0, -8, 0]} intensity={0.5} color="#667eea" distance={25} decay={2} />

      {/* Сцены как шары - сначала родительские, потом дочерние */}
      <Suspense fallback={null}>
        {allScenes.map((scene) => {
          const position = scenePositions.positions[scene.id];
          const radius = scenePositions.sceneRadii[scene.id] || MIN_SCENE_RADIUS;
          if (!position) return null;

          // Оптимизация: используем childrenMap вместо filter
          const children = childrenMap.get(scene.id) || [];
          const hasChildren = children.length > 0;
          const isChild = !!scene.parent_id;
          const parentScene = isChild ? scenesMap.get(scene.parent_id) : null;
          const parentRadius = parentScene ? (scenePositions.sceneRadii[parentScene.id] || MIN_SCENE_RADIUS) : 0;
          
          return (
            <group key={scene.id}>
              {/* Сфера сцены */}
              <SceneSphere
                scene={scene}
                position={position}
                radius={radius}
                isSelected={selectedSceneId === scene.id}
                isConnecting={connectMode && connectingFrom === scene.id}
                allScenes={allScenes}
                hasChildren={hasChildren}
                isChild={isChild}
                entitiesCount={scenesEntitiesCount[scene.id] || 0}
                onClick={() => {
                  if (connectMode) {
                    if (connectingFrom) {
                      if (connectingFrom !== scene.id) {
                        onCreateConnection(connectingFrom, scene.id);
                        onConnectingFromChange(null);
                      } else {
                        onConnectingFromChange(null);
                      }
                    } else {
                      onConnectingFromChange(scene.id);
                    }
                  } else {
                    onSceneSelect(scene.id);
                  }
                }}
                onDoubleClick={() => {
                  // Двойной клик для перехода внутрь сцены
                  if (!connectMode && onSceneDoubleClick) {
                    onSceneDoubleClick(scene.id);
                  }
                }}
              />
              
              {/* Отображаем содержимое сцены (entities) для всех сцен - и корневых, и дочерних */}
              <NestedScene3D
                scene={scene}
                position={position}
                radius={radius}
                parentRadius={isChild ? parentRadius : 0}
                isSelected={selectedSceneId === scene.id}
                onClick={() => onSceneSelect(scene.id)}
                childrenCount={hasChildren ? children.length : 0}
              />
            </group>
          );
        })}
      </Suspense>

      {/* Связи между сценами */}
      {sceneConnections.map((connection) => {
        const fromScene = scenesMap.get(connection.from);
        const toScene = scenesMap.get(connection.to);
        
        if (!fromScene || !toScene) return null;
        
        const fromPos = scenePositions.positions[connection.from];
        const toPos = scenePositions.positions[connection.to];
        
        if (!fromPos || !toPos) return null;
        
        // Проверяем, не является ли одна сцена дочерней другой
        const isParentChild = 
          (fromScene.parent_id === toScene.id) || 
          (toScene.parent_id === fromScene.id);
        
        // Получаем радиусы сцен для правильного отображения связей
        const fromRadius = scenePositions.sceneRadii[connection.from] || MIN_SCENE_RADIUS;
        const toRadius = scenePositions.sceneRadii[connection.to] || MIN_SCENE_RADIUS;
        
        return (
          <SceneConnection
            key={connection.id}
            from={fromPos}
            to={toPos}
            isParentChild={isParentChild}
            fromRadius={fromRadius}
            toRadius={toRadius}
          />
        );
      })}
    </Canvas>
  );
}

export default ScenesCanvas3D;

