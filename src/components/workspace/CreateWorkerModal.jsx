import { useState, useEffect } from 'react';
import EntityTypeModal from './EntityTypeModal';
import { ENTITY_TYPES } from './EntityShape';
import './CreateWorkerModal.css';

function CreateWorkerModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('worker');
  const [color, setColor] = useState('#3b82f6');
  const [emissive, setEmissive] = useState('#000000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);

  // Сброс состояния при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setType('worker');
      setColor('#3b82f6');
      setEmissive('#000000');
      setError('');
      setLoading(false);
      setIsTypeModalOpen(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Имя воркера обязательно');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Создаем воркера:', { 
        name: name.trim(), 
        description: description.trim() || null,
        type,
        color,
        emissive
      });
      const result = await onCreate({
        name: name.trim(),
        description: description.trim() || null,
        type,
        color,
        emissive
      });
      console.log('✅ Воркер успешно создан:', result);
      setName('');
      setDescription('');
      setType('worker');
      setColor('#3b82f6');
      setEmissive('#000000');
      setLoading(false);
      onClose();
    } catch (err) {
      console.error('❌ Ошибка создания воркера:', err);
      setError(err.message || 'Ошибка создания воркера');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setType('worker');
    setColor('#3b82f6');
    setEmissive('#000000');
    setError('');
    setLoading(false);
    setIsTypeModalOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content create-worker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Создать нового воркера</h2>
          <button className="modal-close" onClick={handleCancel}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="worker-name">Название воркера *</label>
            <input
              type="text"
              id="worker-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название воркера"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="worker-description">Описание</label>
            <textarea
              id="worker-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Введите описание воркера (необязательно)"
              rows="4"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="worker-type">Тип персонажа</label>
            <button
              type="button"
              id="worker-type"
              className="type-select-button"
              onClick={() => setIsTypeModalOpen(true)}
              disabled={loading}
            >
              <span className="type-select-icon">
                {ENTITY_TYPES[type]?.icon || '👷'}
              </span>
              <span className="type-select-label">
                {ENTITY_TYPES[type]?.label || type}
              </span>
              <span className="type-select-arrow">▼</span>
            </button>
            <EntityTypeModal
              isOpen={isTypeModalOpen}
              onClose={() => setIsTypeModalOpen(false)}
              onSelectType={(newType) => {
                setType(newType);
                setIsTypeModalOpen(false);
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="worker-color">Цвет</label>
            <div className="color-input-group">
              <input
                type="color"
                id="worker-color"
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

          <div className="form-group">
            <label htmlFor="worker-emissive">Цвет сферы</label>
            <div className="color-input-group">
              <input
                type="color"
                id="worker-emissive"
                value={emissive}
                onChange={(e) => setEmissive(e.target.value)}
                disabled={loading}
              />
              <input
                type="text"
                value={emissive}
                onChange={(e) => setEmissive(e.target.value)}
                placeholder="#000000"
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
              {loading ? 'Создание...' : 'Создать воркера'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateWorkerModal;

