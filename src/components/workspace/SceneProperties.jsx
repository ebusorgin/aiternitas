import { useState, useEffect } from 'react';
import './PropertiesPanel.css';

function SceneProperties({ selectedScene, socket, onSceneUpdated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Обновляем форму при изменении выбранной сцены
  useEffect(() => {
    if (selectedScene) {
      setName(selectedScene.name || '');
      setDescription(selectedScene.description || '');
    } else {
      setName('');
      setDescription('');
    }
  }, [selectedScene]);

  const handleSave = () => {
    if (!selectedScene || !socket || !socket.connected) {
      return;
    }

    const newName = name.trim();
    const newDescription = description.trim();

    // Если ничего не изменилось, не отправляем запрос
    if (newName === (selectedScene.name || '') && 
        newDescription === (selectedScene.description || '')) {
      return;
    }

    // Отправляем событие на сервер для обновления сцены
    socket.emit('scene:update', {
      sceneId: selectedScene.id,
      name: newName,
      description: newDescription
    });

    // Вызываем callback для обновления локального состояния
    if (onSceneUpdated) {
      onSceneUpdated(selectedScene.id, {
        name: newName,
        description: newDescription
      });
    }
  };

  // Не показываем панель, если ничего не выбрано
  if (!selectedScene) {
    return null;
  }

  return (
    <div className="properties-panel scene-properties-floating">
      <div className="properties-panel-header">
        <h3>Scene Properties</h3>
      </div>
      <div className="properties-panel-content">
        <div className="property-group">
          <label htmlFor="scene-prop-name">Name</label>
          <input
            id="scene-prop-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSave}
            placeholder="Scene name"
          />
        </div>

        <div className="property-group">
          <label htmlFor="scene-prop-description">Description</label>
          <textarea
            id="scene-prop-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleSave}
            placeholder="Scene description"
            rows={4}
          />
        </div>
      </div>
    </div>
  );
}

export default SceneProperties;

