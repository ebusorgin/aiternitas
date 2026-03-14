import { ELEMENT_TYPES } from '../../store/flowchartStore';
import './ElementTypeModal.css';

function ElementTypeModal({ isOpen, onClose, onSelectType }) {
  if (!isOpen) return null;

  const handleSelect = (typeId) => {
    onSelectType(typeId);
    onClose();
  };

  return (
    <div className="element-modal-overlay" onClick={onClose}>
      <div className="element-modal" onClick={(e) => e.stopPropagation()}>
        <div className="element-modal-header">
          <h2>Выберите тип элемента</h2>
          <button className="element-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="element-types-grid">
          {Object.entries(ELEMENT_TYPES).map(([typeId, type]) => (
            <button
              key={typeId}
              className="element-type-card"
              onClick={() => handleSelect(typeId)}
              style={{ '--element-color': type.color }}
            >
              <div 
                className="element-type-preview"
                style={{ backgroundColor: type.color }}
              >
                <span className="element-type-icon">{type.icon}</span>
              </div>
              <div className="element-type-name">{type.name}</div>
              <div className="element-type-desc">{type.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ElementTypeModal;
