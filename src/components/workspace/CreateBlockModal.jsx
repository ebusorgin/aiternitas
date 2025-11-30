import { useState, useEffect } from 'react';
import './CreateBlockModal.css';

function CreateBlockModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Сброс состояния при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setColor('#3b82f6');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Имя блока обязательно');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Создаем блок:', { 
        name: name.trim(), 
        description: description.trim() || null,
        color
      });
      const result = await onCreate({
        name: name.trim(),
        description: description.trim() || null,
        color
      });
      console.log('✅ Блок успешно создан:', result);
      setName('');
      setDescription('');
      setColor('#3b82f6');
      setLoading(false);
      onClose();
    } catch (err) {
      console.error('❌ Ошибка создания блока:', err);
      setError(err.message || 'Ошибка создания блока');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setColor('#3b82f6');
    setError('');
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content create-block-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Создать новый блок</h2>
          <button className="modal-close" onClick={handleCancel}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="block-name">Название блока *</label>
            <input
              type="text"
              id="block-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название блока"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="block-description">Описание</label>
            <textarea
              id="block-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Введите описание блока (необязательно)"
              rows="4"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="block-color">Цвет</label>
            <div className="color-input-group">
              <input
                type="color"
                id="block-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={loading}
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#3b82f6"
                className="color-text-input"
                disabled={loading}
              />
            </div>
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
              {loading ? 'Создание...' : 'Создать блок'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateBlockModal;

