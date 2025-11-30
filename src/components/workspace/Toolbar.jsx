import { useEffect, useState } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import ElementTypeModal from './ElementTypeModal';
import CreateSceneModal from './CreateSceneModal';
import CreateWorkerModal from './CreateWorkerModal';
import CreateBlockModal from './CreateBlockModal';
import './Toolbar.css';

function Toolbar() {
  const createEntity = useSceneStore((state) => state.createEntity);
  const deleteEntity = useSceneStore((state) => state.deleteEntity);
  const deleteConnection = useSceneStore((state) => state.deleteConnection);
  const selectedEntityId = useSceneStore((state) => state.selectedEntityId);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const currentSceneId = useSceneStore((state) => state.currentSceneId);
  const allScenes = useSceneStore((state) => state.allScenes);
  const connectMode = useSceneStore((state) => state.connectMode);
  const setConnectMode = useSceneStore((state) => state.setConnectMode);
  const viewMode = useSceneStore((state) => state.viewMode);
  const setViewMode = useSceneStore((state) => state.setViewMode);
  const clearSelection = useSceneStore((state) => state.clearSelection);
  const createScene = useSceneStore((state) => state.createScene);
  const getCanvasCenter = useSceneStore((state) => state.getCanvasCenter);
  const [isElementTypeModalOpen, setIsElementTypeModalOpen] = useState(false);
  const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

  // Обработка горячих клавиш
  useEffect(() => {
    const handleKeyPress = (event) => {
      // N - создать новый элемент
      if (event.key === 'n' || event.key === 'N') {
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          setIsElementTypeModalOpen(true);
        }
      }

      // C - режим соединения
      if (event.key === 'c' || event.key === 'C') {
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          setConnectMode(!connectMode);
        }
      }

      // Delete - удалить выбранный объект
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedEntityId) {
          event.preventDefault();
          deleteEntity(selectedEntityId);
        } else if (selectedConnectionId) {
          event.preventDefault();
          deleteConnection(selectedConnectionId);
        }
      }

      // Escape - снять выделение
      if (event.key === 'Escape') {
        clearSelection();
        setConnectMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [connectMode, selectedEntityId, selectedConnectionId, setConnectMode, deleteEntity, deleteConnection, clearSelection]);

  const handleElementTypeSelect = (elementType) => {
    setIsElementTypeModalOpen(false);
    switch (elementType) {
      case 'scene':
        setIsSceneModalOpen(true);
        break;
      case 'worker':
        setIsWorkerModalOpen(true);
        break;
      case 'block':
        setIsBlockModalOpen(true);
        break;
      default:
        console.error('Unknown element type:', elementType);
    }
  };

  const handleCreateScene = async (sceneData) => {
    try {
      // Для корневых сцен устанавливаем позицию в центре canvas
      // Для дочерних сцен позиция будет рассчитана через layout
      let position_2d = null;
      if (!currentSceneId) {
        // Получаем центр canvas через callback из store
        const center = getCanvasCenter ? getCanvasCenter() : null;
        if (center) {
          position_2d = [center.x, center.z];
        } else {
          position_2d = [0, 0]; // Fallback
        }
      }
      
      const sceneDataWithParent = {
        ...sceneData,
        parent_id: currentSceneId || null,
        position_2d: position_2d
      };
      await createScene(sceneDataWithParent);
      setIsSceneModalOpen(false);
    } catch (error) {
      console.error('Ошибка создания сцены:', error);
    }
  };

  const handleCreateWorker = async (workerData) => {
    try {
      // Создаем воркера в центре экрана (позиция будет рассчитана в store)
      createEntity({
        position: null, // null означает, что нужно использовать центр canvas
        size: [1, 1, 1],
        name: workerData.name,
        description: workerData.description || '',
        color: workerData.color || '#3b82f6',
        emissive: workerData.emissive || '#000000',
        type: workerData.type || 'worker',
        elementType: 'worker'
      });
      setIsWorkerModalOpen(false);
    } catch (error) {
      console.error('Ошибка создания воркера:', error);
    }
  };

  const handleCreateBlock = async (blockData) => {
    try {
      // Создаем блок в центре экрана (позиция будет рассчитана в store)
      createEntity({
        position: null, // null означает, что нужно использовать центр canvas
        size: [1, 1, 1],
        name: blockData.name,
        description: blockData.description || '',
        color: blockData.color || '#3b82f6',
        type: 'block',
        elementType: 'block'
      });
      setIsBlockModalOpen(false);
    } catch (error) {
      console.error('Ошибка создания блока:', error);
    }
  };

  const handleDelete = () => {
    if (selectedEntityId) {
      deleteEntity(selectedEntityId);
    } else if (selectedConnectionId) {
      deleteConnection(selectedConnectionId);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => setIsElementTypeModalOpen(true)}
          title="Создать элемент (N)"
        >
          ➕ New Element
        </button>
        <button
          className="toolbar-btn"
          onClick={handleDelete}
          disabled={!selectedEntityId && !selectedConnectionId}
          title="Удалить (Delete)"
        >
          🗑️ Delete
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${connectMode ? 'active' : ''}`}
          onClick={() => setConnectMode(!connectMode)}
          title="Режим соединения (C)"
        >
          🔗 {connectMode ? 'Exit Connect' : 'Connect Mode'}
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${viewMode === '2d' ? 'active' : ''}`}
          onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
          title={`Переключить на ${viewMode === '2d' ? '3D' : '2D'} вид`}
        >
          {viewMode === '2d' ? '🎮 3D View' : '📊 2D View'}
        </button>
      </div>


      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={clearSelection}
          title="Снять выделение (Esc)"
        >
          ✖️ Clear Selection
        </button>
      </div>

      <ElementTypeModal
        isOpen={isElementTypeModalOpen}
        onClose={() => setIsElementTypeModalOpen(false)}
        onSelectType={handleElementTypeSelect}
      />
      
      <CreateSceneModal
        isOpen={isSceneModalOpen}
        onClose={() => setIsSceneModalOpen(false)}
        onCreate={handleCreateScene}
      />

      <CreateWorkerModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        onCreate={handleCreateWorker}
      />

      <CreateBlockModal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        onCreate={handleCreateBlock}
      />
    </div>
  );
}

export default Toolbar;

