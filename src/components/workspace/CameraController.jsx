import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { useSceneStore } from '../../store/sceneStore';

function CameraController() {
  const { camera, gl } = useThree();
  const selectedElementId = useSceneStore((state) => state.selectedElementId);
  const elements = useSceneStore((state) => state.elements);
  const setOrbitControls = useSceneStore((state) => state.setOrbitControls);
  const controlsRef = useRef();

  // Обработка горячих клавиш
  useEffect(() => {
    const handleKeyPress = (event) => {
      // H - сброс камеры в домашнее положение
      if (event.key === 'h' || event.key === 'H') {
        camera.position.set(0, 5, 10);
        camera.lookAt(0, 0, 0);
      }
      
      // F - фокус на выбранном элементе
      if ((event.key === 'f' || event.key === 'F') && selectedElementId) {
        const element = elements.find((e) => e.id === selectedElementId);
        if (element) {
          const [x, y, z] = element.position;
          camera.position.set(x + 3, y + 3, z + 3);
          camera.lookAt(x, y, z);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [camera, selectedElementId, elements]);

  return (
    <OrbitControls
      ref={(controls) => {
        controlsRef.current = controls;
        if (controls) {
          setOrbitControls(controls);
        }
      }}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={2}
      maxDistance={50}
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 2}
    />
  );
}

export default CameraController;

