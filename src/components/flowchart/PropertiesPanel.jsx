import { useState, useEffect } from 'react';
import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_DIRECTIONS } from '../../store/flowchartStore';
import './PropertiesPanel.css';

// Компонент рекурсивного дерева детей
function ChildrenTree({ elementId, depth = 0, onSelectElement }) {
  const elements = useFlowchartStore((state) => state.elements);
  const selectedElementId = useFlowchartStore((state) => state.selectedElementId);
  
  const children = elements.filter(e => e.parentId === elementId);
  const [expanded, setExpanded] = useState(true);
  
  if (children.length === 0) return null;
  
  return (
    <div className="children-tree" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      {depth === 0 && (
        <div className="tree-header" onClick={() => setExpanded(!expanded)}>
          <span className="tree-toggle">{expanded ? '▼' : '▶'}</span>
          <span className="tree-title">Дочерние элементы ({children.length})</span>
        </div>
      )}
      
      {expanded && children.map(child => {
        const childType = ELEMENT_TYPES[child.type];
        const grandchildren = elements.filter(e => e.parentId === child.id);
        const isSelected = child.id === selectedElementId;
        
        return (
          <div key={child.id} className="tree-item-wrapper">
            <div 
              className={`tree-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectElement(child.id)}
            >
              <span className="tree-item-icon">{childType?.icon}</span>
              <span className="tree-item-name">{child.name}</span>
              {grandchildren.length > 0 && (
                <span className="tree-item-count">{grandchildren.length}</span>
              )}
            </div>
            
            {grandchildren.length > 0 && (
              <ChildrenTree 
                elementId={child.id} 
                depth={depth + 1}
                onSelectElement={onSelectElement}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Компонент отображения связей
function ConnectionsList({ elementId }) {
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const selectElement = useFlowchartStore((state) => state.selectElement);
  const selectConnection = useFlowchartStore((state) => state.selectConnection);
  
  // Получаем все связи элемента
  const elementConnections = connections.filter(
    c => c.from === elementId || c.to === elementId
  );
  
  if (elementConnections.length === 0) {
    return (
      <div className="connections-empty">
        <span className="empty-text">Нет связей</span>
      </div>
    );
  }
  
  // Группируем по направлению
  const outgoing = elementConnections.filter(c => 
    (c.from === elementId && c.direction !== 'incoming') ||
    (c.to === elementId && c.direction === 'incoming')
  );
  
  const incoming = elementConnections.filter(c =>
    (c.to === elementId && c.direction !== 'incoming') ||
    (c.from === elementId && c.direction === 'incoming')
  );
  
  const bidirectional = elementConnections.filter(c => c.direction === 'bidirectional');
  
  const renderConnection = (conn, type) => {
    const isFrom = conn.from === elementId;
    const otherId = isFrom ? conn.to : conn.from;
    const otherElement = elements.find(e => e.id === otherId);
    
    if (!otherElement) return null;
    
    const otherType = ELEMENT_TYPES[otherElement.type];
    
    return (
      <div key={conn.id} className="connection-item" onClick={() => selectConnection(conn.id)}>
        <span className="connection-direction">
          {CONNECTION_DIRECTIONS[conn.direction]?.icon || '→'}
        </span>
        <span 
          className="connection-target"
          onClick={(e) => {
            e.stopPropagation();
            selectElement(otherId);
          }}
        >
          <span className="target-icon">{otherType?.icon}</span>
          <span className="target-name">{otherElement.name}</span>
        </span>
        {conn.description && (
          <span className="connection-desc" title={conn.description}>
            {conn.description.slice(0, 20)}{conn.description.length > 20 ? '...' : ''}
          </span>
        )}
      </div>
    );
  };
  
  return (
    <div className="connections-list">
      {outgoing.length > 0 && (
        <div className="connections-group">
          <div className="group-title">
            <span className="group-icon">→</span>
            Исходящие ({outgoing.length})
          </div>
          {outgoing.filter(c => c.direction !== 'bidirectional').map(c => renderConnection(c, 'outgoing'))}
        </div>
      )}
      
      {incoming.length > 0 && (
        <div className="connections-group">
          <div className="group-title">
            <span className="group-icon">←</span>
            Входящие ({incoming.length})
          </div>
          {incoming.filter(c => c.direction !== 'bidirectional').map(c => renderConnection(c, 'incoming'))}
        </div>
      )}
      
      {bidirectional.length > 0 && (
        <div className="connections-group">
          <div className="group-title">
            <span className="group-icon">↔</span>
            Двунаправленные ({bidirectional.length})
          </div>
          {bidirectional.map(c => renderConnection(c, 'bidirectional'))}
        </div>
      )}
    </div>
  );
}

function PropertiesPanel() {
  const selectedElementId = useFlowchartStore((state) => state.selectedElementId);
  const selectedConnectionId = useFlowchartStore((state) => state.selectedConnectionId);
  const elements = useFlowchartStore((state) => state.elements);
  const connections = useFlowchartStore((state) => state.connections);
  const updateElement = useFlowchartStore((state) => state.updateElement);
  const updateConnection = useFlowchartStore((state) => state.updateConnection);
  const deleteElement = useFlowchartStore((state) => state.deleteElement);
  const deleteConnection = useFlowchartStore((state) => state.deleteConnection);
  const selectElement = useFlowchartStore((state) => state.selectElement);
  const startConnecting = useFlowchartStore((state) => state.startConnecting);
  const unnestElement = useFlowchartStore((state) => state.unnestElement);
  const navigateInto = useFlowchartStore((state) => state.navigateInto);

  const selectedElement = elements.find((e) => e.id === selectedElementId);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [properties, setProperties] = useState({});
  
  // Connection state
  const [connectionDescription, setConnectionDescription] = useState('');
  const [connectionLabel, setConnectionLabel] = useState('');
  const [connectionDirection, setConnectionDirection] = useState('outgoing');

  useEffect(() => {
    if (selectedElement) {
      setName(selectedElement.name || '');
      setDescription(selectedElement.description || '');
      setColor(selectedElement.color || '#3b82f6');
      setProperties(selectedElement.properties || {});
    } else if (selectedConnection) {
      setConnectionDescription(selectedConnection.description || '');
      setConnectionLabel(selectedConnection.label || '');
      setConnectionDirection(selectedConnection.direction || 'outgoing');
    }
  }, [selectedElement, selectedConnection]);

  const handleSaveElement = () => {
    if (selectedElement && selectedElementId) {
      updateElement(selectedElementId, {
        name,
        description,
        color,
        properties
      });
    }
  };

  const handleSaveConnection = () => {
    if (selectedConnection && selectedConnectionId) {
      updateConnection(selectedConnectionId, {
        description: connectionDescription,
        label: connectionLabel,
        direction: connectionDirection
      });
    }
  };

  const handlePropertyChange = (key, value) => {
    setProperties((prev) => ({ ...prev, [key]: value }));
  };

  // === ПУСТОЕ СОСТОЯНИЕ ===
  if (!selectedElement && !selectedConnection) {
    return (
      <div className="flowchart-properties-panel">
        <div className="properties-panel-header">
          <h3>Свойства</h3>
        </div>
        <div className="properties-empty">
          <div className="empty-icon">📋</div>
          <p>Выберите элемент или связь</p>
          <span className="empty-hint">ПКМ для создания нового элемента</span>
        </div>
      </div>
    );
  }

  // === СВОЙСТВА СВЯЗИ ===
  if (selectedConnection) {
    const fromElement = elements.find(e => e.id === selectedConnection.from);
    const toElement = elements.find(e => e.id === selectedConnection.to);
    const fromType = ELEMENT_TYPES[fromElement?.type];
    const toType = ELEMENT_TYPES[toElement?.type];
    
    return (
      <div className="flowchart-properties-panel">
        <div className="properties-panel-header">
          <div className="properties-title-row">
            <span className="properties-icon">🔗</span>
            <h3>Связь</h3>
          </div>
        </div>
        
        <div className="properties-content">
          {/* Соединяемые элементы */}
          <div className="connection-endpoints-panel">
            <div 
              className="endpoint-card"
              onClick={() => fromElement && selectElement(fromElement.id)}
            >
              <span className="endpoint-label">От</span>
              <span className="endpoint-icon">{fromType?.icon}</span>
              <span className="endpoint-name">{fromElement?.name}</span>
            </div>
            
            <div className="endpoint-arrow">
              {CONNECTION_DIRECTIONS[connectionDirection]?.icon || '→'}
            </div>
            
            <div 
              className="endpoint-card"
              onClick={() => toElement && selectElement(toElement.id)}
            >
              <span className="endpoint-label">К</span>
              <span className="endpoint-icon">{toType?.icon}</span>
              <span className="endpoint-name">{toElement?.name}</span>
            </div>
          </div>

          {/* Направление связи */}
          <div className="properties-divider">
            <span>Направление</span>
          </div>
          
          <div className="direction-selector">
            {Object.entries(CONNECTION_DIRECTIONS).map(([id, dir]) => (
              <button
                key={id}
                className={`direction-btn ${connectionDirection === id ? 'active' : ''}`}
                onClick={() => {
                  setConnectionDirection(id);
                  updateConnection(selectedConnectionId, { direction: id });
                }}
              >
                <span className="direction-icon">{dir.icon}</span>
                <span className="direction-name">{dir.name}</span>
              </button>
            ))}
          </div>

          {/* Описание */}
          <div className="properties-divider">
            <span>Описание</span>
          </div>
          
          <div className="property-group">
            <textarea
              value={connectionDescription}
              onChange={(e) => setConnectionDescription(e.target.value)}
              onBlur={handleSaveConnection}
              placeholder="Описание связи..."
              rows={3}
            />
          </div>

          {/* Метка на линии */}
          <div className="property-group">
            <label>Метка на линии</label>
            <input
              type="text"
              value={connectionLabel}
              onChange={(e) => setConnectionLabel(e.target.value)}
              onBlur={handleSaveConnection}
              placeholder="Текст на линии связи"
            />
          </div>

          {/* Удаление */}
          <div className="property-group">
            <button 
              className="delete-btn"
              onClick={() => {
                if (confirm('Удалить эту связь?')) {
                  deleteConnection(selectedConnectionId);
                }
              }}
            >
              🗑️ Удалить связь
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === СВОЙСТВА ЭЛЕМЕНТА ===
  const elementType = ELEMENT_TYPES[selectedElement.type];
  const parent = selectedElement.parentId 
    ? elements.find(e => e.id === selectedElement.parentId) 
    : null;
  const parentType = parent ? ELEMENT_TYPES[parent.type] : null;
  const childElements = elements.filter(e => e.parentId === selectedElement.id);

  return (
    <div className="flowchart-properties-panel">
      <div className="properties-panel-header">
        <div className="properties-title-row">
          <span className="properties-icon">{elementType?.icon}</span>
          <h3>{elementType?.name || 'Элемент'}</h3>
        </div>
      </div>
      
      <div className="properties-content">
        {/* Название */}
        <div className="property-group">
          <label>Название</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveElement}
            placeholder="Название элемента"
          />
        </div>

        {/* Описание */}
        <div className="property-group">
          <label>Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleSaveElement}
            placeholder="Описание элемента..."
            rows={3}
          />
        </div>

        {/* Цвет */}
        <div className="property-group">
          <label>Цвет</label>
          <div className="color-input-row">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={handleSaveElement}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={handleSaveElement}
              className="color-text"
            />
          </div>
        </div>

        {/* Родитель */}
        {parent && (
          <>
            <div className="properties-divider">
              <span>📍 Расположение</span>
            </div>
            
            <div className="parent-info-box">
              <div className="parent-label">Вложен в:</div>
              <div 
                className="parent-card"
                onClick={() => selectElement(parent.id)}
              >
                <span className="parent-icon">{parentType?.icon}</span>
                <span className="parent-name">{parent.name}</span>
              </div>
              <button 
                className="unnest-btn"
                onClick={() => unnestElement(selectedElementId)}
              >
                📤 Извлечь
              </button>
            </div>
          </>
        )}

        {/* Дочерние элементы */}
        <div className="properties-divider">
          <span>👶 Дочерние ({childElements.length})</span>
        </div>
        
        {childElements.length > 0 ? (
          <>
            <ChildrenTree 
              elementId={selectedElementId}
              onSelectElement={selectElement}
            />
            <button 
              className="navigate-btn"
              onClick={() => navigateInto(selectedElementId)}
            >
              📂 Открыть внутри
            </button>
          </>
        ) : (
          <div className="no-children">
            <span>Нет дочерних элементов</span>
            <span className="hint">ПКМ → Добавить дочерний</span>
          </div>
        )}

        {/* Связи */}
        <div className="properties-divider">
          <span>🔗 Связи</span>
        </div>
        
        <ConnectionsList elementId={selectedElementId} />
        
        <button 
          className="connect-btn"
          onClick={() => startConnecting(selectedElementId)}
        >
          ➕ Создать связь
        </button>

        {/* Дополнительные свойства */}
        {elementType?.properties && Object.keys(elementType.properties).length > 0 && (
          <>
            <div className="properties-divider">
              <span>⚙️ Свойства типа</span>
            </div>

            {Object.entries(elementType.properties).map(([key, propDef]) => (
              <div key={key} className="property-group">
                <label>{propDef.label}</label>
                {propDef.type === 'boolean' ? (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={properties[key] || false}
                      onChange={(e) => {
                        handlePropertyChange(key, e.target.checked);
                        setTimeout(handleSaveElement, 0);
                      }}
                    />
                    <span className="checkbox-text">
                      {properties[key] ? 'Да' : 'Нет'}
                    </span>
                  </label>
                ) : propDef.type === 'number' ? (
                  <input
                    type="number"
                    value={properties[key] || 0}
                    onChange={(e) => handlePropertyChange(key, parseFloat(e.target.value) || 0)}
                    onBlur={handleSaveElement}
                  />
                ) : (
                  <input
                    type="text"
                    value={properties[key] || ''}
                    onChange={(e) => handlePropertyChange(key, e.target.value)}
                    onBlur={handleSaveElement}
                    placeholder={propDef.label}
                  />
                )}
              </div>
            ))}
          </>
        )}

        {/* Удаление */}
        <div className="properties-divider">
          <span>⚠️ Опасная зона</span>
        </div>
        
        <button 
          className="delete-btn"
          onClick={() => {
            const message = childElements.length > 0
              ? `Удалить "${name}" и все ${childElements.length} дочерних элемента?`
              : `Удалить элемент "${name}"?`;
            if (confirm(message)) {
              deleteElement(selectedElementId);
            }
          }}
        >
          🗑️ Удалить элемент
          {childElements.length > 0 && ` (+${childElements.length})`}
        </button>
      </div>
    </div>
  );
}

export default PropertiesPanel;
