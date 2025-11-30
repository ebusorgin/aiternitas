import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_DIRECTIONS, CONNECTION_TYPES } from '../../store/flowchartStore';
import './ElementInfoModal.css';

function ElementInfoModal({ element, onClose }) {
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const selectElement = useFlowchartStore((state) => state.selectElement);

  if (!element) return null;

  const elementType = ELEMENT_TYPES[element.type];
  const parent = element.parentId ? elements.find(e => e.id === element.parentId) : null;
  const parentType = parent ? ELEMENT_TYPES[parent.type] : null;
  const props = element.properties || {};

  // Получаем связи элемента
  const elementConnections = connections.filter(
    c => c.from === element.id || c.to === element.id
  );

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Render list of items
  const renderList = (items, icon = '•') => {
    if (!items || items.length === 0) return null;
    return (
      <ul className="info-list">
        {items.map((item, i) => (
          <li key={i}><span className="list-icon">{icon}</span>{item}</li>
        ))}
      </ul>
    );
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
              <div className="info-subtitle-row">
                <span className="info-type">{elementType?.name}</span>
                {props.position && <span className="info-position">{props.position}</span>}
                {props.level && <span className="info-level">{props.level}</span>}
              </div>
            </div>
          </div>
          <button className="info-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Содержимое */}
        <div className="info-modal-content">
          {/* Миссия (для департаментов) */}
          {props.mission && (
            <div className="info-section info-mission">
              <h4>🎯 Миссия</h4>
              <p className="mission-text">{props.mission}</p>
            </div>
          )}

          {/* Функциональные обязанности */}
          {(props.responsibilities?.length > 0 || props.functions?.length > 0) && (
            <div className="info-section">
              <h4>📋 {element.type === 'department' ? 'Функции' : 'Обязанности'}</h4>
              {renderList(props.responsibilities || props.functions, '•')}
            </div>
          )}

          {/* Компетенции (для работников) */}
          {props.competencies?.length > 0 && (
            <div className="info-section">
              <h4>💡 Компетенции</h4>
              <div className="info-tags">
                {props.competencies.map((c, i) => (
                  <span key={i} className="info-tag competency">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* KPI */}
          {props.kpis?.length > 0 && (
            <div className="info-section">
              <h4>📊 Ключевые показатели (KPI)</h4>
              <div className="info-tags">
                {props.kpis.map((kpi, i) => (
                  <span key={i} className="info-tag kpi">{kpi}</span>
                ))}
              </div>
            </div>
          )}

          {/* Полномочия */}
          {props.authorities?.length > 0 && (
            <div className="info-section">
              <h4>🔑 Полномочия</h4>
              {renderList(props.authorities, '✓')}
            </div>
          )}

          {/* Взаимодействие (для департаментов) */}
          {props.interactsWith?.length > 0 && (
            <div className="info-section">
              <h4>🤝 Взаимодействует с</h4>
              <div className="info-tags">
                {props.interactsWith.map((dept, i) => (
                  <span key={i} className="info-tag interact">{dept}</span>
                ))}
              </div>
            </div>
          )}

          {/* Управляемые департаменты (для руководителей) */}
          {props.managedDepartments?.length > 0 && (
            <div className="info-section">
              <h4>🏢 Управляет</h4>
              <div className="info-tags">
                {props.managedDepartments.map((dept, i) => (
                  <span key={i} className="info-tag dept">{dept}</span>
                ))}
              </div>
            </div>
          )}

          {/* Родитель */}
          {parent && (
            <div className="info-section">
              <h4>📍 Расположение</h4>
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

          {/* Связи */}
          {elementConnections.length > 0 && (
            <div className="info-section">
              <h4>🔗 Связи ({elementConnections.length})</h4>
              <div className="info-connections">
                {elementConnections.map(conn => {
                  const isFrom = conn.from === element.id;
                  const otherId = isFrom ? conn.to : conn.from;
                  const otherElement = elements.find(e => e.id === otherId);
                  const otherType = ELEMENT_TYPES[otherElement?.type];
                  const connType = CONNECTION_TYPES[conn.type];
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
                      <span className="conn-type-badge" style={{ backgroundColor: connType?.color || '#60a5fa' }}>
                        {connType?.icon || direction?.icon || '→'}
                      </span>
                      <span className="conn-icon">{otherType?.icon}</span>
                      <span className="conn-name">{otherElement?.name}</span>
                      <span className="conn-type-name">{connType?.name || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Дополнительное описание */}
          {element.description && !props.responsibilities?.length && !props.functions?.length && (
            <div className="info-section">
              <h4>📝 Описание</h4>
              <p className="info-description">{element.description}</p>
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

