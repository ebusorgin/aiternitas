import { useState } from 'react';
import './DeleteSceneModal.css';

function DeleteSceneModal({ isOpen, onClose, onConfirm, sceneName }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Ошибка удаления сцены:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content delete-scene-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Удалить сцену</h2>
          <button className="modal-close" onClick={handleCancel} disabled={loading}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="delete-warning-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <p className="delete-warning-text">
            Вы уверены, что хотите удалить сцену <strong>"{sceneName || 'Без названия'}"</strong>?
          </p>
          <p className="delete-warning-subtext">
            Это действие нельзя отменить. Все сущности и связи в этой сцене будут безвозвратно удалены.
          </p>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCancel}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteSceneModal;

