import { useState } from 'react';
import { ENTITY_TYPES, ENTITY_CATEGORIES } from './EntityShape';
import './EntityTypeModal.css';

function EntityTypeModal({ isOpen, onClose, onSelectType }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (!isOpen) return null;

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
  };

  const handleTypeSelect = (type) => {
    onSelectType(type);
    onClose();
    setSelectedCategory(null);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  const getTypesByCategory = (category) => {
    return Object.entries(ENTITY_TYPES).filter(([_, info]) => info.category === category);
  };

  return (
    <div className="entity-type-modal-overlay" onClick={onClose}>
      <div className="entity-type-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Entity Type</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {!selectedCategory ? (
          <div className="categories-grid">
            <div
              className="category-card"
              onClick={() => handleCategorySelect('professions')}
            >
              <div className="category-icon">👔</div>
              <div className="category-title">Professions</div>
              <div className="category-subtitle">15 types</div>
            </div>
            <div
              className="category-card"
              onClick={() => handleCategorySelect('technique')}
            >
              <div className="category-icon">🚗</div>
              <div className="category-title">Technique</div>
              <div className="category-subtitle">10 types</div>
            </div>
            <div
              className="category-card"
              onClick={() => handleCategorySelect('services')}
            >
              <div className="category-icon">🛠️</div>
              <div className="category-title">Services</div>
              <div className="category-subtitle">10 types</div>
            </div>
          </div>
        ) : (
          <div className="types-grid">
            <button className="back-btn" onClick={handleBack}>
              ← Back
            </button>
            {getTypesByCategory(selectedCategory).map(([type, info]) => (
              <div
                key={type}
                className="type-card"
                onClick={() => handleTypeSelect(type)}
              >
                <div className="type-icon">{info.icon}</div>
                <div className="type-label">{info.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default EntityTypeModal;

