import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_DIRECTIONS } from '../../store/flowchartStore';
import './ElementInfoModal.css';

function ElementInfoModal({ element, onClose }) {
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const selectElement = useFlowchartStore((state) => state.selectElement);

  if (!element) return null;

  const elementType = ELEMENT_TYPES[element.type];
  const parent = element.parentId ? elements.find(e => e.id === element.parentId) : null;
  const parentType = parent ? ELEMENT_TYPES[parent.type] : null;

  // Получаем связи элемента
  const elementConnections = connections.filter(
    c => c.from === element.id || c.to === element.id
  );

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="element-info-overlay" onClick={handleOverlayClick}>
      <div className="element-info-modal">
        {/* Заголовок */}
        <div className="info-modal-header" style={{ background: `linear-gradient(135deg, ${element.color}40, ${element.color}20)` }}>
          <div className="info-header-content">
            <span className="info-icon">{elementType?.icon}</span>
            <div className="info-title-group">
              <h2 className="info-title">{element.name}</h2>
              <span className="info-type">{elementType?.name}</span>
            </div>
          </div>
          <button className="info-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Содержимое */}
        <div className="info-modal-content">
          {/* Описание */}
          {element.description && (
            <div className="info-section">
              <h4>Описание</h4>
              <p className="info-description">{element.description}</p>
            </div>
          )}

          {/* Родитель */}
          {parent && (
            <div className="info-section">
              <h4>Расположение</h4>
              <div 
                className="info-parent-card"
                onClick={() => {
                  selectElement(parent.id);
                  onClose();
                }}
              >
                <span className="parent-icon">{parentType?.icon}</span>
                <span className="parent-name">{parent.name}</span>
                <span className="parent-hint">← перейти</span>
              </div>
            </div>
          )}

          {/* Свойства типа */}
          {elementType?.properties && Object.keys(elementType.properties).length > 0 && (
            <div className="info-section">
              <h4>Свойства</h4>
              <div className="info-properties">
                {Object.entries(elementType.properties).map(([key, propDef]) => {
                  const value = element.properties?.[key];
                  if (value === undefined || value === '' || value === 0) return null;
                  
                  return (
                    <div key={key} className="info-property">
                      <span className="property-label">{propDef.label}</span>
                      <span className="property-value">
                        {propDef.type === 'boolean' ? (value ? 'Да' : 'Нет') : value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Связи */}
          {elementConnections.length > 0 && (
            <div className="info-section">
              <h4>Связи ({elementConnections.length})</h4>
              <div className="info-connections">
                {elementConnections.map(conn => {
                  const isFrom = conn.from === element.id;
                  const otherId = isFrom ? conn.to : conn.from;
                  const otherElement = elements.find(e => e.id === otherId);
                  const otherType = ELEMENT_TYPES[otherElement?.type];
                  const direction = CONNECTION_DIRECTIONS[conn.direction];

                  return (
                    <div 
                      key={conn.id} 
                      className="info-connection"
                      onClick={() => {
                        selectElement(otherId);
                        onClose();
                      }}
                    >
                      <span className="conn-direction">{direction?.icon || '→'}</span>
                      <span className="conn-icon">{otherType?.icon}</span>
                      <span className="conn-name">{otherElement?.name}</span>
                      {conn.description && (
                        <span className="conn-desc">{conn.description}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Пустое состояние */}
          {!element.description && elementConnections.length === 0 && (
            <div className="info-empty">
              <p>Нет дополнительной информации</p>
              <span>Используйте панель свойств для редактирования</span>
            </div>
          )}
        </div>

        {/* Футер */}
        <div className="info-modal-footer">
          <button className="info-btn primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export default ElementInfoModal;

