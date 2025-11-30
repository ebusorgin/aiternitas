import { useState } from 'react';
import './ElementTypeModal.css';

const ELEMENT_TYPES = {
  scene: {
    label: 'Scene',
    icon: '🎬',
    description: 'Сцена с 3D видом, настройками фона и сетки'
  },
  worker: {
    label: 'Worker',
    icon: '👷',
    description: 'Воркер с типом персонажа, цветом и цветом сферы'
  },
  block: {
    label: 'Block',
    icon: '📦',
    description: 'Простой блок с настройкой цвета'
  }
};

function ElementTypeModal({ isOpen, onClose, onSelectType }) {
  if (!isOpen) return null;

  const handleTypeSelect = (type) => {
    onSelectType(type);
    onClose();
  };

  return (
    <div className="element-type-modal-overlay" onClick={onClose}>
      <div className="element-type-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Выберите тип элемента</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="element-types-grid">
          {Object.entries(ELEMENT_TYPES).map(([type, info]) => (
            <div
              key={type}
              className="element-type-card"
              onClick={() => handleTypeSelect(type)}
            >
              <div className="element-type-icon">{info.icon}</div>
              <div className="element-type-label">{info.label}</div>
              <div className="element-type-description">{info.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ElementTypeModal;

