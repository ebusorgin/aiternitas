import { useState, useEffect, useRef } from 'react';
import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_TYPES, CONNECTION_DIRECTIONS } from '../../store/flowchartStore';
import './ContextMenu.css';

function ContextMenu({ 
  x, 
  y, 
  type, // 'empty' | 'element' | 'connection'
  target, // element or connection object
  onClose,
  onCreateElement 
}) {
  const menuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  const elements = useFlowchartStore((state) => state.elements);
  const updateElement = useFlowchartStore((state) => state.updateElement);
  const deleteElement = useFlowchartStore((state) => state.deleteElement);
  const unnestElement = useFlowchartStore((state) => state.unnestElement);
  const nestElement = useFlowchartStore((state) => state.nestElement);
  const addChildElement = useFlowchartStore((state) => state.addChildElement);
  const startConnecting = useFlowchartStore((state) => state.startConnecting);
  const updateConnection = useFlowchartStore((state) => state.updateConnection);
  const deleteConnection = useFlowchartStore((state) => state.deleteConnection);

  // Закрытие при клике вне меню
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (editingField) {
          setEditingField(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, editingField]);

  // Позиционирование меню в пределах экрана
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth - 10) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (y + rect.height > viewportHeight - 10) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  // Получить доступные контейнеры для вложения
  const getAvailableContainers = () => {
    if (!target || type !== 'element') return [];
    
    const getDescendants = (elementId) => {
      const children = elements.filter(e => e.parentId === elementId);
      return [elementId, ...children.flatMap(c => getDescendants(c.id))];
    };
    const descendants = getDescendants(target.id);
    
    return elements.filter(el => {
      if (el.id === target.id) return false;
      if (descendants.includes(el.id)) return false;
      if (el.id === target.parentId) return false;
      return true;
    });
  };

  // Начать редактирование поля
  const startEditing = (field, currentValue) => {
    setEditingField(field);
    setEditValue(currentValue || '');
  };

  // Сохранить редактирование
  const saveEditing = () => {
    if (type === 'element' && target) {
      updateElement(target.id, { [editingField]: editValue });
    } else if (type === 'connection' && target) {
      updateConnection(target.id, { [editingField]: editValue });
    }
    setEditingField(null);
    setEditValue('');
  };

  // Обработка Enter при редактировании
  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      saveEditing();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  // === РЕНДЕРИНГ МЕНЮ ДЛЯ ПУСТОГО МЕСТА ===
  if (type === 'empty') {
    return (
      <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
        <div className="context-menu-header">Создать элемент</div>
        <div className="context-menu-items">
          {Object.entries(ELEMENT_TYPES).map(([typeId, typeData]) => (
            <button
              key={typeId}
              className="context-menu-item"
              onClick={() => {
                onCreateElement(typeId);
                onClose();
              }}
            >
              <span className="context-menu-icon">{typeData.icon}</span>
              <span className="context-menu-label">{typeData.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // === РЕНДЕРИНГ МЕНЮ ДЛЯ ЭЛЕМЕНТА ===
  if (type === 'element' && target) {
    const elementType = ELEMENT_TYPES[target.type];
    const hasParent = !!target.parentId;
    const availableContainers = getAvailableContainers();
    const children = elements.filter(e => e.parentId === target.id);

    return (
      <div ref={menuRef} className="context-menu element-menu" style={{ left: x, top: y }}>
        {/* Заголовок с именем элемента */}
        <div className="context-menu-header element-header">
          <span className="header-icon">{elementType?.icon}</span>
          <span className="header-name">{target.name}</span>
        </div>

        <div className="context-menu-items">
          {/* Переименование */}
          {editingField === 'name' ? (
            <div className="context-menu-edit">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onBlur={saveEditing}
                autoFocus
                placeholder="Название"
              />
            </div>
          ) : (
            <button
              className="context-menu-item"
              onClick={() => startEditing('name', target.name)}
            >
              <span className="context-menu-icon">✏️</span>
              <span className="context-menu-label">Переименовать</span>
            </button>
          )}

          {/* Описание */}
          {editingField === 'description' ? (
            <div className="context-menu-edit">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveEditing();
                  }
                }}
                onBlur={saveEditing}
                autoFocus
                placeholder="Описание"
                rows={3}
              />
            </div>
          ) : (
            <button
              className="context-menu-item"
              onClick={() => startEditing('description', target.description)}
            >
              <span className="context-menu-icon">📝</span>
              <span className="context-menu-label">
                {target.description ? 'Изменить описание' : 'Добавить описание'}
              </span>
            </button>
          )}

          <div className="context-menu-divider" />

          {/* Добавить дочерний элемент (только для департаментов) */}
          {elementType?.canContain && (
            <div 
              className="context-menu-item has-submenu"
              onMouseEnter={() => setActiveSubmenu('addChild')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <span className="context-menu-icon">➕</span>
              <span className="context-menu-label">Добавить дочерний</span>
              <span className="submenu-arrow">▶</span>
              
              {activeSubmenu === 'addChild' && (
                <div className="context-submenu">
                  {Object.entries(ELEMENT_TYPES).map(([typeId, typeData]) => (
                    <button
                      key={typeId}
                      className="context-menu-item"
                      onClick={() => {
                        addChildElement(target.id, typeId);
                        onClose();
                      }}
                    >
                      <span className="context-menu-icon">{typeData.icon}</span>
                      <span className="context-menu-label">{typeData.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Вложить в другой элемент */}
          {availableContainers.length > 0 && (
            <div 
              className="context-menu-item has-submenu"
              onMouseEnter={() => setActiveSubmenu('nestInto')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <span className="context-menu-icon">📥</span>
              <span className="context-menu-label">Вложить в...</span>
              <span className="submenu-arrow">▶</span>
              
              {activeSubmenu === 'nestInto' && (
                <div className="context-submenu nest-submenu">
                  {availableContainers.map(container => (
                    <button
                      key={container.id}
                      className="context-menu-item"
                      onClick={() => {
                        nestElement(target.id, container.id);
                        onClose();
                      }}
                    >
                      <span className="context-menu-icon">
                        {ELEMENT_TYPES[container.type]?.icon}
                      </span>
                      <span className="context-menu-label">{container.name}</span>
                      {container.depth > 0 && (
                        <span className="depth-badge">Ур.{container.depth}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Извлечь из родителя */}
          {hasParent && (
            <button
              className="context-menu-item"
              onClick={() => {
                unnestElement(target.id);
                onClose();
              }}
            >
              <span className="context-menu-icon">📤</span>
              <span className="context-menu-label">Извлечь из родителя</span>
            </button>
          )}

          <div className="context-menu-divider" />

          {/* Создать связь */}
          <button
            className="context-menu-item"
            onClick={() => {
              startConnecting(target.id);
              onClose();
            }}
          >
            <span className="context-menu-icon">🔗</span>
            <span className="context-menu-label">Создать связь</span>
          </button>

          <div className="context-menu-divider" />

          {/* Информация */}
          <div className="context-menu-info">
            {children.length > 0 && (
              <span className="info-badge">👶 {children.length} дочерних</span>
            )}
            {target.depth > 0 && (
              <span className="info-badge">📊 Уровень {target.depth}</span>
            )}
          </div>

          {/* Удалить */}
          <button
            className="context-menu-item danger"
            onClick={() => {
              const message = children.length > 0
                ? `Удалить "${target.name}" и все ${children.length} дочерних элемента?`
                : `Удалить элемент "${target.name}"?`;
              if (confirm(message)) {
                deleteElement(target.id);
                onClose();
              }
            }}
          >
            <span className="context-menu-icon">🗑️</span>
            <span className="context-menu-label">Удалить</span>
            {children.length > 0 && (
              <span className="warning-text">(и {children.length} дочерних)</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // === РЕНДЕРИНГ МЕНЮ ДЛЯ СВЯЗИ ===
  if (type === 'connection' && target) {
    const fromElement = elements.find(e => e.id === target.from);
    const toElement = elements.find(e => e.id === target.to);

    return (
      <div ref={menuRef} className="context-menu connection-menu" style={{ left: x, top: y }}>
        <div className="context-menu-header">
          <span className="header-icon">🔗</span>
          <span className="header-name">Связь</span>
        </div>

        <div className="context-menu-items">
          {/* Информация о связи */}
          <div className="connection-info">
            <div className="connection-endpoints">
              <span className="endpoint">
                {ELEMENT_TYPES[fromElement?.type]?.icon} {fromElement?.name}
              </span>
              <span className="direction-indicator">
                {CONNECTION_DIRECTIONS[target.direction]?.icon || '→'}
              </span>
              <span className="endpoint">
                {ELEMENT_TYPES[toElement?.type]?.icon} {toElement?.name}
              </span>
            </div>
          </div>

          <div className="context-menu-divider" />

          {/* Тип связи (определяет цвет) */}
          <div className="context-menu-section-title">Тип связи</div>
          {Object.entries(CONNECTION_TYPES).map(([typeId, typeData]) => (
            <button
              key={typeId}
              className={`context-menu-item ${target.type === typeId ? 'active' : ''}`}
              onClick={() => {
                updateConnection(target.id, { type: typeId });
              }}
              style={{
                borderLeft: `3px solid ${typeData.color}`
              }}
            >
              <span className="context-menu-icon">{typeData.icon}</span>
              <span className="context-menu-label">{typeData.name}</span>
              {target.type === typeId && (
                <span className="check-mark">✓</span>
              )}
            </button>
          ))}

          <div className="context-menu-divider" />

          {/* Направление связи */}
          <div className="context-menu-section-title">Направление</div>
          {Object.entries(CONNECTION_DIRECTIONS).map(([dirId, dirData]) => (
            <button
              key={dirId}
              className={`context-menu-item direction-item ${target.direction === dirId ? 'active' : ''}`}
              onClick={() => {
                updateConnection(target.id, { direction: dirId });
              }}
            >
              <span className="context-menu-icon">{dirData.icon}</span>
              <span className="context-menu-label">{dirData.name}</span>
              {target.direction === dirId && (
                <span className="check-mark">✓</span>
              )}
            </button>
          ))}

          <div className="context-menu-divider" />

          {/* Описание связи */}
          {editingField === 'description' ? (
            <div className="context-menu-edit">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveEditing();
                  }
                }}
                onBlur={saveEditing}
                autoFocus
                placeholder="Описание связи"
                rows={2}
              />
            </div>
          ) : (
            <button
              className="context-menu-item"
              onClick={() => startEditing('description', target.description)}
            >
              <span className="context-menu-icon">📝</span>
              <span className="context-menu-label">
                {target.description ? 'Изменить описание' : 'Добавить описание'}
              </span>
            </button>
          )}

          {/* Метка на линии */}
          {editingField === 'label' ? (
            <div className="context-menu-edit">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onBlur={saveEditing}
                autoFocus
                placeholder="Метка на линии"
              />
            </div>
          ) : (
            <button
              className="context-menu-item"
              onClick={() => startEditing('label', target.label)}
            >
              <span className="context-menu-icon">🏷️</span>
              <span className="context-menu-label">
                {target.label ? `Метка: "${target.label}"` : 'Добавить метку'}
              </span>
            </button>
          )}

          <div className="context-menu-divider" />

          {/* Удалить связь */}
          <button
            className="context-menu-item danger"
            onClick={() => {
              if (confirm('Удалить эту связь?')) {
                deleteConnection(target.id);
                onClose();
              }
            }}
          >
            <span className="context-menu-icon">🗑️</span>
            <span className="context-menu-label">Удалить связь</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default ContextMenu;

