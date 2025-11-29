import { useState, useEffect } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { ENTITY_TYPES } from './EntityShape';
import EntityTypeModal from './EntityTypeModal';
import './PropertiesPanel.css';

function PropertiesPanel() {
  const selectedEntityId = useSceneStore((state) => state.selectedEntityId);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const entities = useSceneStore((state) => state.entities);
  const connections = useSceneStore((state) => state.connections);
  const updateEntity = useSceneStore((state) => state.updateEntity);
  const updateConnection = useSceneStore((state) => state.updateConnection);

  const selectedEntity = selectedEntityId
    ? entities.find((e) => e.id === selectedEntityId)
    : null;
  
  // Логирование для отладки
  useEffect(() => {
    if (selectedEntity) {
      console.log('🔍 Selected entity updated:', { id: selectedEntity.id, type: selectedEntity.type, name: selectedEntity.name });
    }
  }, [selectedEntity]);
  const selectedConnection = selectedConnectionId
    ? connections.find((c) => c.id === selectedConnectionId)
    : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [type, setType] = useState('box');
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);

  // Обновляем форму при изменении выбранного объекта
  useEffect(() => {
    if (selectedEntity) {
      setName(selectedEntity.name || '');
      setDescription(selectedEntity.description || '');
      setColor(selectedEntity.color || '#3b82f6');
      setType(selectedEntity.type || 'box');
    } else if (selectedConnection) {
      setName(selectedConnection.label || '');
      setDescription('');
      setColor(selectedConnection.color || '#ffffff');
      setType('box');
    } else {
      setName('');
      setDescription('');
      setColor('#3b82f6');
      setType('box');
    }
  }, [selectedEntity, selectedConnection]);

  const handleSave = () => {
    if (selectedEntity && selectedEntityId) {
      console.log('💾 PropertiesPanel handleSave:', { selectedEntityId, name, description, color, type });
      updateEntity(selectedEntityId, {
        name,
        description,
        color,
        type
      });
    } else if (selectedConnection && selectedConnectionId) {
      updateConnection(selectedConnectionId, {
        label: name,
        color
      });
    }
  };

  // Не показываем панель, если ничего не выбрано
  if (!selectedEntity && !selectedConnection) {
    return null;
  }

  return (
    <div className="properties-panel">
      <div className="properties-panel-header">
        <h3>
          {selectedEntity ? 'Entity Properties' : 'Connection Properties'}
        </h3>
      </div>
      <div className="properties-panel-content">
        <div className="property-group">
          <label htmlFor="prop-name">
            {selectedEntity ? 'Name' : 'Label'}
          </label>
          <input
            id="prop-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            placeholder={selectedEntity ? 'Entity name' : 'Connection label'}
          />
        </div>

        {selectedEntity && (
          <>
            <div className="property-group">
              <label htmlFor="prop-type">Type</label>
              <button
                id="prop-type"
                type="button"
                onClick={() => setIsTypeModalOpen(true)}
                className="type-select-button"
                title="Click to change type"
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
                  console.log('🔄 Type changed from modal:', { oldType: type, newType });
                  setType(newType);
                  // Обновляем сущность сразу с новым типом
                  if (selectedEntity && selectedEntityId) {
                    updateEntity(selectedEntityId, {
                      name,
                      description,
                      color,
                      type: newType
                    });
                  }
                }}
              />
            </div>

            <div className="property-group">
              <label htmlFor="prop-description">Description</label>
              <textarea
                id="prop-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleSave}
                placeholder="Entity description"
                rows={4}
              />
            </div>
          </>
        )}

        <div className="property-group">
          <label htmlFor="prop-color">Color</label>
          <div className="color-input-group">
            <input
              id="prop-color"
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                handleSave();
              }}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={handleSave}
              placeholder="#3b82f6"
              className="color-text-input"
            />
          </div>
        </div>

        {selectedEntity && (
          <div className="property-group">
            <label>Position</label>
            <div className="position-display">
              <span>X: {selectedEntity.position[0].toFixed(2)}</span>
              <span>Y: {selectedEntity.position[1].toFixed(2)}</span>
              <span>Z: {selectedEntity.position[2].toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PropertiesPanel;

