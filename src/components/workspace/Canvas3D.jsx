import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment } from '@react-three/drei';
import { Suspense } from 'react';
import { AxesHelper } from 'three';
import CameraController from './CameraController';
import EntityCube from './EntityCube';
import Connection from './Connection';
import InteractionLayer from './InteractionLayer';
import { useSceneStore } from '../../store/sceneStore';

function Canvas3D() {
  const elements = useSceneStore((state) => state.elements);
  const connections = useSceneStore((state) => state.connections);
  const clearSelection = useSceneStore((state) => state.clearSelection);
  const connectMode = useSceneStore((state) => state.connectMode);
  const setConnectingFrom = useSceneStore((state) => state.setConnectingFrom);

  console.log('Canvas3D render:', { elementsCount: elements.length, connectionsCount: connections.length });

  // Обработка клика на пустое место
  const handlePointerMissed = (event) => {
    // Если не в режиме соединения, сбрасываем выделение
    if (!connectMode) {
      clearSelection();
    } else {
      // В режиме соединения отменяем выбор начальной точки
      setConnectingFrom(null);
    }
  };

  return (
    <Canvas
      gl={{ antialias: true, alpha: false, toneMappingExposure: 1.2 }}
      dpr={[1, 2]}
      style={{ 
        width: '100%', 
        height: '100%', 
        background: 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 50%, #0f1419 100%)' 
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#1a1a2e');
        scene.fog = null; // Отключаем туман для яркости
        console.log('Canvas3D created');
      }}
      onError={(error) => {
        console.error('Canvas3D error:', error);
      }}
      onPointerMissed={handlePointerMissed}
    >
      {/* Освещение - яркое и многоуровневое */}
      <ambientLight intensity={1.2} color="#ffffff" />
      <directionalLight 
        position={[10, 15, 10]} 
        intensity={1.5} 
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight 
        position={[-10, 10, -10]} 
        intensity={0.8} 
        color="#a0c4ff"
      />
      <pointLight position={[10, -10, 10]} intensity={0.6} color="#ffd89b" />
      <pointLight position={[-10, 10, -10]} intensity={0.6} color="#a0c4ff" />
      <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#4a5568" />
      
      {/* Environment для отражений и общего освещения - более легкий вариант */}
      <Environment preset="sunset" />

      {/* Камера */}
      <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={50} />
      <CameraController />

      {/* Вспомогательные элементы - улучшенная сетка */}
      <Grid
        args={[30, 30]}
        cellColor="#4a5568"
        sectionColor="#667eea"
        cellThickness={0.6}
        sectionThickness={1.2}
        fadeDistance={30}
        fadeStrength={0.8}
        followCamera={false}
        infiniteGrid={true}
      />
      <primitive object={new AxesHelper(8)} />
      
      {/* Дополнительный свет снизу для лучшей видимости */}
      <pointLight position={[0, -5, 0]} intensity={0.4} color="#667eea" />

      {/* Элементы (кубы) */}
      <Suspense fallback={null}>
        {elements.map((element) => (
          <EntityCube key={element.id} element={element} />
        ))}
      </Suspense>

      {/* Связи между элементами */}
      {connections.map((connection) => {
        const fromElement = elements.find((e) => e.id === connection.from);
        const toElement = elements.find((e) => e.id === connection.to);
        
        if (!fromElement || !toElement) return null;

        return (
          <Connection
            key={connection.id}
            connection={connection}
            fromPosition={fromElement.position}
            toPosition={toElement.position}
            fromElement={fromElement}
            toElement={toElement}
          />
        );
      })}

      {/* Слой взаимодействий */}
      <InteractionLayer />
    </Canvas>
  );
}

export default Canvas3D;

