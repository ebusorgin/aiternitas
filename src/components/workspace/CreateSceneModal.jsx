import { useState, useEffect } from 'react';
import './CreateSceneModal.css';

function CreateSceneModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Сброс состояния при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Имя сцены обязательно');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Создаем сцену:', { name: name.trim(), description: description.trim() || null });
      const result = await onCreate({
        name: name.trim(),
        description: description.trim() || null
      });
      console.log('✅ Сцена успешно создана:', result);
      // Сбрасываем форму после успешного создания
      setName('');
      setDescription('');
      setLoading(false);
      onClose();
    } catch (err) {
      console.error('❌ Ошибка создания сцены:', err);
      setError(err.message || 'Ошибка создания сцены');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setError('');
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content create-scene-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Создать новую сцену</h2>
          <button className="modal-close" onClick={handleCancel}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="scene-name">Название сцены *</label>
            <input
              type="text"
              id="scene-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название сцены"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="scene-description">Описание</label>
            <textarea
              id="scene-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Введите описание сцены (необязательно)"
              rows="4"
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

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
              type="submit"
              className="btn-primary"
              disabled={loading || !name.trim()}
            >
              {loading ? 'Создание...' : 'Создать сцену'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateSceneModal;

