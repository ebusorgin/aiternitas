import { useEffect, useState } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import EntityTypeModal from './EntityTypeModal';
import './Toolbar.css';

function Toolbar() {
  const createEntity = useSceneStore((state) => state.createEntity);
  const deleteEntity = useSceneStore((state) => state.deleteEntity);
  const deleteConnection = useSceneStore((state) => state.deleteConnection);
  const selectedEntityId = useSceneStore((state) => state.selectedEntityId);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const connectMode = useSceneStore((state) => state.connectMode);
  const setConnectMode = useSceneStore((state) => state.setConnectMode);
  const viewMode = useSceneStore((state) => state.viewMode);
  const setViewMode = useSceneStore((state) => state.setViewMode);
  const clearSelection = useSceneStore((state) => state.clearSelection);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Обработка горячих клавиш
  useEffect(() => {
    const handleKeyPress = (event) => {
      // N - создать новый персонаж
      if (event.key === 'n' || event.key === 'N') {
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          setIsModalOpen(true);
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

  const handleNewPersonage = (type) => {
    // Создаем сущность в центре сцены с выбранным типом
    createEntity({
      position: [0, 1, 0],
      size: [1, 1, 1],
      name: `Entity ${Date.now()}`,
      description: '',
      color: '#3b82f6',
      type: type || 'box'
    });
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
          onClick={() => setIsModalOpen(true)}
          title="Создать персонаж (N)"
        >
          ➕ New Personage
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

      <EntityTypeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectType={handleNewPersonage}
      />
    </div>
  );
}

export default Toolbar;

