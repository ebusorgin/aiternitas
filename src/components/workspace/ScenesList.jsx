import { useState, useEffect } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import CreateSceneModal from './CreateSceneModal';
import DeleteSceneModal from './DeleteSceneModal';
import './ScenesList.css';

function ScenesList() {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteModalScene, setDeleteModalScene] = useState(null);
  
  const socket = useSceneStore((state) => state.socket);
  const currentSceneId = useSceneStore((state) => state.currentSceneId);
  const loadScene = useSceneStore((state) => state.loadScene);

  useEffect(() => {
    if (!socket || !socket.connected) return;

    // Загружаем список сцен при подключении
    loadScenesList();

    // Слушаем обновления списка сцен
    const handleSceneCreated = () => {
      loadScenesList();
    };

    const handleSceneDeleted = () => {
      loadScenesList();
    };

    socket.on('scene:created', handleSceneCreated);
    socket.on('scene:deleted', handleSceneDeleted);

    return () => {
      socket.off('scene:created', handleSceneCreated);
      socket.off('scene:deleted', handleSceneDeleted);
    };
  }, [socket]);

  const loadScenesList = () => {
    if (!socket || !socket.connected) return;

    setLoading(true);
    socket.emit('scene:list');

    const handleSceneList = (sceneList) => {
      setScenes(sceneList);
      setLoading(false);
    };

    const handleError = ({ message }) => {
      console.error('Ошибка загрузки списка сцен:', message);
      setLoading(false);
    };

    socket.once('scene:list', handleSceneList);
    socket.once('error', handleError);

    // Очищаем слушатели через 5 секунд на случай если ответ не придет
    setTimeout(() => {
      socket.off('scene:list', handleSceneList);
      socket.off('error', handleError);
      if (loading) setLoading(false);
    }, 5000);
  };

  const handleCreateScene = async (sceneData) => {
    if (!socket || !socket.connected) {
      throw new Error('Socket не подключен');
    }

    return new Promise((resolve, reject) => {
      socket.emit('scene:create', sceneData);

      const handleSceneCreated = (newScene) => {
        socket.off('scene:created', handleSceneCreated);
        socket.off('error', handleError);
        setScenes(prev => [newScene, ...prev]);
        // Автоматически загружаем созданную сцену
        setTimeout(() => {
          loadScene(newScene.id);
        }, 100);
        resolve(newScene);
      };

      const handleError = ({ message }) => {
        socket.off('scene:created', handleSceneCreated);
        socket.off('error', handleError);
        reject(new Error(message));
      };

      socket.once('scene:created', handleSceneCreated);
      socket.once('error', handleError);

      // Таймаут на случай если ответ не придет
      setTimeout(() => {
        socket.off('scene:created', handleSceneCreated);
        socket.off('error', handleError);
        reject(new Error('Таймаут при создании сцены'));
      }, 10000);
    });
  };

  const handleSceneClick = (sceneId) => {
    if (currentSceneId === sceneId) return;
    
    if (!socket || !socket.connected) {
      console.error('Socket не подключен');
      return;
    }

    // Загружаем сцену через store
    loadScene(sceneId);
  };

  const handleDeleteClick = (e, scene) => {
    e.stopPropagation(); // Останавливаем всплытие, чтобы не загрузить сцену
    setDeleteModalScene(scene);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalScene || !socket || !socket.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      socket.emit('scene:delete', deleteModalScene.id);

      const handleSceneDeleted = ({ id }) => {
        socket.off('scene:deleted', handleSceneDeleted);
        socket.off('error', handleError);
        
        // Удаляем сцену из списка
        setScenes(prev => prev.filter(s => s.id !== id));
        
        // Если удаленная сцена была активной, очищаем состояние
        if (currentSceneId === id) {
          // Очищаем текущую сцену в store
          loadScene(null);
        }
        
        resolve();
      };

      const handleError = ({ message }) => {
        socket.off('scene:deleted', handleSceneDeleted);
        socket.off('error', handleError);
        reject(new Error(message));
      };

      socket.once('scene:deleted', handleSceneDeleted);
      socket.once('error', handleError);

      // Таймаут на случай если ответ не придет
      setTimeout(() => {
        socket.off('scene:deleted', handleSceneDeleted);
        socket.off('error', handleError);
        reject(new Error('Таймаут при удалении сцены'));
      }, 10000);
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Сегодня';
    } else if (diffDays === 1) {
      return 'Вчера';
    } else if (diffDays < 7) {
      return `${diffDays} дн. назад`;
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  // Не показываем компонент, если загрузка завершена и сцен нет
  if (!loading && scenes.length === 0) {
    return null;
  }

  return (
    <div className="scenes-list-container">
      <div className="scenes-list-header">
        <h3 className="scenes-title">Сцены</h3>
        <button
          className="btn-add-scene"
          onClick={() => setIsCreateModalOpen(true)}
          title="Создать новую сцену"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      <div className="scenes-list-content">
        {loading ? (
          <div className="scenes-loading">Загрузка сцен...</div>
        ) : (
          <div className="scenes-items">
            {scenes.map((scene) => (
              <div
                key={scene.id}
                className={`scene-item ${currentSceneId === scene.id ? 'active' : ''}`}
                onClick={() => handleSceneClick(scene.id)}
              >
                <div className="scene-item-content">
                  <div className="scene-item-header">
                    <h4 className="scene-name">{scene.name || 'Без названия'}</h4>
                    <span className="scene-date">{formatDate(scene.updated_at || scene.created_at)}</span>
                  </div>
                  {scene.description && (
                    <p className="scene-description">{scene.description}</p>
                  )}
                </div>
                <button
                  className="btn-delete-scene"
                  onClick={(e) => handleDeleteClick(e, scene)}
                  title="Удалить сцену"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateSceneModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateScene}
      />

      <DeleteSceneModal
        isOpen={!!deleteModalScene}
        onClose={() => setDeleteModalScene(null)}
        onConfirm={handleDeleteConfirm}
        sceneName={deleteModalScene?.name}
      />
    </div>
  );
}

export default ScenesList;

