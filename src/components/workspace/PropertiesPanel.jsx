import { useState, useEffect, useMemo, useRef } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { ENTITY_TYPES } from './EntityShape';
import EntityTypeModal from './EntityTypeModal';
import { ElementFactory } from '../../models/Elements';
import './PropertiesPanel.css';

function PropertiesPanel() {
  const selectedElementId = useSceneStore((state) => state.selectedElementId);
  const selectedConnectionId = useSceneStore((state) => state.selectedConnectionId);
  const elements = useSceneStore((state) => state.elements);
  const connections = useSceneStore((state) => state.connections);
  const updateElement = useSceneStore((state) => state.updateElement);
  const updateConnection = useSceneStore((state) => state.updateConnection);

  // Используем useMemo чтобы избежать лишних пересчетов
  const selectedElement = useMemo(() => 
    selectedElementId ? elements.find((e) => e.id === selectedElementId) : null,
    [selectedElementId, elements]
  );
  
  const selectedConnection = useMemo(() => 
    selectedConnectionId ? connections.find((c) => c.id === selectedConnectionId) : null,
    [selectedConnectionId, connections]
  );

  // Определяем тип элемента
  const elementType = useMemo(() => {
    if (!selectedElement) return null;
    return ElementFactory.getElementType(selectedElement);
  }, [selectedElement]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [type, setType] = useState('box');
  const [emissive, setEmissive] = useState('#000000');
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const isInitializingRef = useRef(false); // Флаг для предотвращения сохранения при инициализации

  // Обновляем форму при изменении выбранного объекта
  // Используем useMemo для стабильности ссылок на объекты
  useEffect(() => {
    isInitializingRef.current = true; // Устанавливаем флаг инициализации
    
    if (selectedElement) {
      setName(selectedElement.name || '');
      setDescription(selectedElement.description || '');
      setColor(selectedElement.color || '#3b82f6');
      setType(selectedElement.type || 'box');
      setEmissive(selectedElement.emissive || '#000000');
    } else if (selectedConnection) {
      setName(selectedConnection.label || '');
      setDescription('');
      setColor(selectedConnection.color || '#ffffff');
      setType('box');
      setEmissive('#000000');
    } else {
      setName('');
      setDescription('');
      setColor('#3b82f6');
      setType('box');
      setEmissive('#000000');
    }
    
    // Снимаем флаг инициализации после небольшой задержки
    setTimeout(() => {
      isInitializingRef.current = false;
    }, 100);
  }, [selectedElement, selectedConnection]); // Используем мемоизированные объекты

  const handleSave = () => {
    // Не сохраняем во время инициализации формы
    if (isInitializingRef.current) {
      return;
    }
    
    if (selectedElement && selectedElementId) {
      const newName = name.trim();
      const newDescription = description.trim();
      
      // Подготавливаем данные для обновления в зависимости от типа элемента
      const updateData = {
        name: newName,
        description: newDescription,
        color,
        type
      };

      // Для воркера добавляем emissive
      if (elementType === 'worker') {
        updateData.emissive = emissive;
      }
      
      // Если ничего не изменилось, не отправляем запрос
      const hasChanges = 
        newName !== (selectedElement.name || '') || 
        newDescription !== (selectedElement.description || '') ||
        color !== (selectedElement.color || '#3b82f6') ||
        type !== (selectedElement.type || 'box') ||
        (elementType === 'worker' && emissive !== (selectedElement.emissive || '#000000'));
      
      if (!hasChanges) {
        return;
      }
      
      updateElement(selectedElementId, updateData);
    } else if (selectedConnection && selectedConnectionId) {
      const newLabel = name.trim();
      
      // Если ничего не изменилось, не отправляем запрос
      if (newLabel === (selectedConnection.label || '') &&
          color === (selectedConnection.color || '#ffffff')) {
        return;
      }
      
      updateConnection(selectedConnectionId, {
        label: newLabel,
        color
      });
    }
  };

  // Панель должна всегда быть видна, как в SceneProperties
  return (
    <div className="properties-panel">
      <div className="properties-panel-header">
        <h3>
          {selectedElement 
            ? (elementType === 'worker' ? 'Воркер Properties' : 
               elementType === 'block' ? 'Блок Properties' : 
               'Элемент Properties')
            : selectedConnection 
            ? 'Connection Properties' 
            : 'Properties'}
        </h3>
      </div>
      <div className="properties-panel-content">
        {!selectedElement && !selectedConnection ? (
          <div className="properties-empty">
            Выберите элемент или соединение для просмотра свойств
          </div>
        ) : (
          <>
            <div className="property-group">
              <label htmlFor="prop-name">
                {selectedElement ? 'Name' : 'Label'}
              </label>
              <input
                id="prop-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSave}
                placeholder={selectedElement ? 'Element name' : 'Connection label'}
              />
            </div>

        {selectedElement && (
          <>
            <div className="property-group">
              <label htmlFor="prop-description">Description</label>
              <textarea
                id="prop-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleSave}
                placeholder="Element description"
                rows={4}
              />
            </div>

            {/* Тип персонажа только для воркера */}
            {elementType === 'worker' && (
              <div className="property-group">
                <label htmlFor="prop-type">Тип персонажа</label>
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
                    setType(newType);
                    // Обновляем элемент сразу с новым типом
                    if (selectedElement && selectedElementId) {
                      updateElement(selectedElementId, {
                        name,
                        description,
                        color,
                        type: newType,
                        emissive: elementType === 'worker' ? emissive : undefined
                      });
                    }
                  }}
                />
              </div>
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
              }}
              onBlur={handleSave}
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

        {/* Цвет сферы только для воркера */}
        {elementType === 'worker' && (
          <div className="property-group">
            <label htmlFor="prop-emissive">Цвет сферы</label>
            <div className="color-input-group">
              <input
                id="prop-emissive"
                type="color"
                value={emissive}
                onChange={(e) => {
                  setEmissive(e.target.value);
                }}
                onBlur={handleSave}
              />
              <input
                type="text"
                value={emissive}
                onChange={(e) => setEmissive(e.target.value)}
                onBlur={handleSave}
                placeholder="#000000"
                className="color-text-input"
              />
            </div>
          </div>
        )}
          </>
        )}

        {selectedElement && (
          <div className="property-group">
            <label>Position</label>
            <div className="position-display">
              <span>X: {selectedElement.position[0].toFixed(2)}</span>
              <span>Y: {selectedElement.position[1].toFixed(2)}</span>
              <span>Z: {selectedElement.position[2].toFixed(2)}</span>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

export default PropertiesPanel;

