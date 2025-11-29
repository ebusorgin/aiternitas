import { useState, useEffect } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { ENTITY_TYPES } from './EntityShape';
import EntityTypeModal from './EntityTypeModal';
import './EditEntityModal.css';

function EditEntityModal({ isOpen, onClose, entityId }) {
  const entities = useSceneStore((state) => state.entities);
  const updateEntity = useSceneStore((state) => state.updateEntity);
  
  const entity = entityId ? entities.find((e) => e.id === entityId) : null;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [type, setType] = useState('box');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);

  // Заполняем форму данными сущности при открытии
  useEffect(() => {
    if (isOpen && entity) {
      setName(entity.name || '');
      setDescription(entity.description || '');
      setColor(entity.color || '#3b82f6');
      setType(entity.type || 'box');
      setError('');
      setLoading(false);
    }
  }, [isOpen, entity]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Имя сущности обязательно');
      return;
    }

    if (!entity) {
      setError('Сущность не найдена');
      return;
    }

    setLoading(true);
    try {
      console.log('💾 Редактируем сущность:', { entityId, name: name.trim(), description: description.trim(), color, type });
      updateEntity(entityId, {
        name: name.trim(),
        description: description.trim() || '',
        color,
        type
      });
      
      setLoading(false);
      onClose();
    } catch (err) {
      console.error('❌ Ошибка редактирования сущности:', err);
      setError(err.message || 'Ошибка редактирования сущности');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (entity) {
      setName(entity.name || '');
      setDescription(entity.description || '');
      setColor(entity.color || '#3b82f6');
      setType(entity.type || 'box');
    }
    setError('');
    setLoading(false);
    setIsTypeModalOpen(false);
    onClose();
  };

  if (!isOpen || !entity) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content edit-entity-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Редактировать сущность</h2>
          <button className="modal-close" onClick={handleCancel}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="entity-name">Название сущности *</label>
            <input
              type="text"
              id="entity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название сущности"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="entity-type">Тип сущности</label>
            <button
              id="entity-type"
              type="button"
              onClick={() => setIsTypeModalOpen(true)}
              className="type-select-button"
              disabled={loading}
              title="Выберите тип сущности"
            >
              <span className="type-select-icon">
                {ENTITY_TYPES[type]?.icon || '📦'}
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
            <label htmlFor="entity-description">Описание</label>
            <textarea
              id="entity-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Введите описание сущности (необязательно)"
              rows="4"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="entity-color">Цвет</label>
            <div className="color-input-group">
              <input
                id="entity-color"
                type="color"
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
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditEntityModal;

