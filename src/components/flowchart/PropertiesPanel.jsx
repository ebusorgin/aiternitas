import { useState, useEffect } from 'react';
import { useFlowchartStore, ELEMENT_TYPES, CONNECTION_DIRECTIONS, CONNECTION_TYPES } from '../../store/flowchartStore';
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
    const connType = CONNECTION_TYPES[conn.type];
    
    return (
      <div key={conn.id} className="connection-item" onClick={() => selectConnection(conn.id)}>
        <span className="connection-type-badge" style={{ backgroundColor: connType?.color || '#60a5fa' }}>
          {connType?.icon || CONNECTION_DIRECTIONS[conn.direction]?.icon || '→'}
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
        <span className="connection-type-name">
          {connType?.name || ''}
        </span>
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
  const openPluginSettings = useFlowchartStore((state) => state.openPluginSettings);

  const selectedElement = elements.find((e) => e.id === selectedElementId);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

  const apiBase = (import.meta?.env?.DEV && window.location.port === '3000')
    ? `http://${window.location.hostname}:3001`
    : '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [properties, setProperties] = useState({});

  // Реестр доступных плагинов (backend: server/plugins/* -> GET /api/plugins)
  const [availablePlugins, setAvailablePlugins] = useState([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState('');
  const [pluginsFetchAttempted, setPluginsFetchAttempted] = useState(false);
  
  // Connection state
  const [connectionDescription, setConnectionDescription] = useState('');
  const [connectionLabel, setConnectionLabel] = useState('');
  const [connectionDirection, setConnectionDirection] = useState('outgoing');
  const [connectionType, setConnectionType] = useState('collaborates');

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
      setConnectionType(selectedConnection.type || 'collaborates');
    }
  }, [selectedElement, selectedConnection]);

  useEffect(() => {
    if (selectedElement?.type !== 'plugin') return;
    if (availablePlugins.length > 0 || pluginsLoading || pluginsFetchAttempted) return;

    setPluginsLoading(true);
    setPluginsError('');
    setPluginsFetchAttempted(true);
    fetch(`${apiBase}/api/plugins`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
        setAvailablePlugins(plugins);
      })
      .catch((e) => {
        // Fallback: Telegram-only manifest so UI stays usable even if backend route isn't available yet.
        setAvailablePlugins([{
          id: 'telegram',
          name: 'Telegram',
          description: 'Подключает Telegram к проекту. Настройка хранится на сервере и наследуется вниз по иерархии: можно подключить Telegram на корне (для всего проекта) или на конкретном звене (департамент/узел) только для этой ветки.',
          howItWorks: 'Плагин сохраняет серверные параметры доступа к Telegram. Для уведомлений обычно достаточно бота (Bot API). Если нужно работать как аккаунт (через MTProto), используются api_id/api_hash и номер телефона (аутентификация выполняется на сервере).',
          fields: [
            {
              key: 'authMode',
              label: 'Способ подключения',
              type: 'select',
              required: true,
              default: 'account',
              options: [
                { value: 'account', label: 'Telegram аккаунт (серверно, MTProto)' },
                { value: 'bot', label: 'Telegram бот (Bot API)' }
              ],
              help: 'Выберите, что именно вы подключаете. Аккаунт нужен для более широких сценариев, бот чаще всего подходит для уведомлений.'
            },
            {
              key: 'apiId',
              label: 'API ID',
              type: 'text',
              required: true,
              placeholder: '123456',
              showIf: { key: 'authMode', equals: 'account' },
              help: 'Берется на my.telegram.org → API development tools → App configuration → API ID.'
            },
            {
              key: 'apiHash',
              label: 'API Hash',
              type: 'password',
              required: true,
              placeholder: '0123456789abcdef0123456789abcdef',
              showIf: { key: 'authMode', equals: 'account' },
              help: 'Берется на my.telegram.org → API development tools → App configuration → API Hash.'
            },
            {
              key: 'phoneNumber',
              label: 'Номер телефона аккаунта',
              type: 'text',
              required: true,
              placeholder: '+79991234567',
              showIf: { key: 'authMode', equals: 'account' },
              help: 'Номер в международном формате (с +). Это тот номер, на который зарегистрирован Telegram.'
            },
            {
              key: 'twoFactorPassword',
              label: 'Пароль 2FA (если включен)',
              type: 'password',
              required: false,
              placeholder: '••••••••',
              showIf: { key: 'authMode', equals: 'account' },
              help: 'Нужен только если в Telegram включена двухэтапная аутентификация. Рекомендуется в дальнейшем заменить на безопасную серверную сессию.'
            },
            {
              key: 'sessionString',
              label: 'Серверная сессия (Session String)',
              type: 'textarea',
              required: false,
              placeholder: 'AQG... (длинная строка)',
              showIf: { key: 'authMode', equals: 'account' },
              help: 'Если у вас уже есть Session String (например, сгенерированный админом), вставьте сюда. Это безопаснее, чем хранить пароль 2FA.'
            },
            {
              key: 'botToken',
              label: 'Токен бота',
              type: 'password',
              required: true,
              placeholder: '123456789:AA...',
              showIf: { key: 'authMode', equals: 'bot' },
              help: 'Создается через @BotFather в Telegram.'
            },
            {
              key: 'defaultChatId',
              label: 'ID чата/канала (по умолчанию)',
              type: 'text',
              required: false,
              placeholder: '-1001234567890',
              help: 'Опционально. Если заполнить, система сможет отправлять уведомления без выбора чата каждый раз.'
            }
          ],
          instructions: [
            {
              title: 'Главное',
              text: 'Telegram в Aiternitas работает серверно: вы один раз задаете параметры доступа в плагине, и далее Telegram доступен на любом нижнем уровне иерархии (плагин наследуется вниз). Если вам нужен отдельный Telegram для конкретного департамента, создайте второй плагин внутри нужного узла.'
            },
            {
              title: 'Вариант A: Telegram аккаунт (MTProto, серверно)',
              text: 'Этот вариант использует ваш Telegram-аккаунт. Нужны api_id/api_hash (ключи приложения) и номер телефона. Важно: на my.telegram.org номер телефона НЕ показывается, его нужно взять из Telegram (или просто ввести тот, на который зарегистрирован аккаунт). Где взять ключи:',
              showIf: { key: 'authMode', equals: 'account' },
              steps: [
                '1) Откройте сайт my.telegram.org (это официальный сайт Telegram).',
                '2) Войдите: введите номер телефона и код подтверждения, который придет в Telegram.',
                '3) Перейдите в раздел: "API development tools".',
                '4) Создайте приложение (Create new application), если его еще нет: заполните App title и Short name (любой текст).',
                '5) После создания на странице появятся "API ID" и "API Hash" (в блоке App configuration): скопируйте их в поля плагина.',
                '6) Номер телефона возьмите из Telegram: Telegram → Настройки → (ваш аккаунт) → номер телефона. Введите его в поле "Номер телефона аккаунта" в формате +<код_страны><номер> (например +79991234567).',
                '7) Если в Telegram включена 2FA (пароль): заполните "Пароль 2FA". Если 2FA нет, оставьте пустым.',
                '8) Если у вас уже есть Session String: вставьте его в поле "Серверная сессия". Это предпочтительнее, чем хранить пароль 2FA.'
              ]
            },
            {
              title: 'Вариант B: Telegram бот (Bot API)',
              text: 'Это самый простой способ для уведомлений (бот пишет сообщения). Что делать:',
              showIf: { key: 'authMode', equals: 'bot' },
              steps: [
                '1) Откройте Telegram и найдите @BotFather.',
                '2) Отправьте команду /newbot и следуйте инструкциям.',
                '3) Скопируйте выданный токен и вставьте в поле "Токен бота".',
                '4) (Опционально) Добавьте бота в чат/канал, куда он будет писать.',
                '5) (Опционально) Узнайте ID чата/канала и заполните "ID чата/канала (по умолчанию)".'
              ]
            },
            {
              title: 'Как понять, что вводить',
              steps: [
                'API ID / API Hash: выдаются только на my.telegram.org в разделе API development tools.',
                'Номер телефона: это номер Telegram-аккаунта (my.telegram.org его не показывает). Посмотреть можно в Telegram → Настройки.',
                'Токен бота: выдаёт только @BotFather и он выглядит как 123456789:AA....',
                'ID чата/канала: обычно отрицательное число для каналов/супергрупп (пример: -100...).'
              ]
            },
            {
              title: 'Где размещать плагин в структуре',
              text: 'Плагин считается подключенным на уровне того элемента, внутри которого он создан. Такой Telegram доступен для всех элементов ниже по иерархии. Если создать плагин на корне, он будет доступен всему проекту.'
            }
          ]
        }]);
        setPluginsError('Бекенд /api/plugins недоступен (используется встроенный Telegram-шаблон)');
      })
      .finally(() => setPluginsLoading(false));
  }, [apiBase, selectedElement?.type, availablePlugins.length, pluginsLoading, pluginsFetchAttempted]);

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

  const handlePluginConfigChange = (key, value) => {
    setProperties((prev) => ({
      ...prev,
      config: {
        ...(prev?.config || {}),
        [key]: value
      }
    }));
  };

  const getPluginLabel = (pluginId) => {
    const p = availablePlugins.find(x => x.id === pluginId);
    return p?.name || pluginId || 'Плагин';
  };

  const computeEffectivePlugins = (element) => {
    if (!element) return [];

    // Уровень для наследования начинается с контейнера:
    // department -> сам департамент; остальные -> родитель (если есть).
    const containers = [];
    let container = element.type === 'department'
      ? element
      : (element.parentId ? elements.find(e => e.id === element.parentId) : null);

    while (container) {
      containers.push(container);
      container = container.parentId ? elements.find(e => e.id === container.parentId) : null;
    }
    containers.push(null); // root scope

    const seen = new Set();
    const effective = [];

    for (const scopeEl of containers) {
      const scopeId = scopeEl?.id || null;
      const scopePlugins = elements.filter(e =>
        e.type === 'plugin' &&
        (e.parentId || null) === scopeId &&
        e.properties?.enabled !== false
      );

      for (const pEl of scopePlugins) {
        const pid = pEl.properties?.pluginId || 'unknown';
        if (seen.has(pid)) continue;
        seen.add(pid);
        effective.push({ pluginElement: pEl, pluginId: pid, scopeElement: scopeEl });
      }
    }

    return effective;
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

          {/* Тип связи */}
          <div className="properties-divider">
            <span>Тип связи</span>
          </div>
          
          <div className="connection-type-selector">
            {Object.entries(CONNECTION_TYPES).map(([id, typeInfo]) => (
              <button
                key={id}
                className={`type-btn ${connectionType === id ? 'active' : ''}`}
                style={{ 
                  borderColor: connectionType === id ? typeInfo.color : 'transparent',
                  backgroundColor: connectionType === id ? typeInfo.color + '20' : 'transparent'
                }}
                onClick={() => {
                  setConnectionType(id);
                  setConnectionDirection(typeInfo.defaultDirection);
                  updateConnection(selectedConnectionId, { 
                    type: id, 
                    direction: typeInfo.defaultDirection 
                  });
                }}
              >
                <span className="type-icon">{typeInfo.icon}</span>
                <span className="type-name">{typeInfo.name}</span>
              </button>
            ))}
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
  const effectivePlugins = selectedElement.type !== 'plugin'
    ? computeEffectivePlugins(selectedElement)
    : [];

  const selectedPluginId = selectedElement.type === 'plugin'
    ? (properties?.pluginId || 'telegram')
    : null;
  const selectedPlugin = selectedElement.type === 'plugin'
    ? (availablePlugins.find(p => p.id === selectedPluginId) || null)
    : null;
  const pluginScopeLabel = selectedElement.type === 'plugin'
    ? (parent ? `Уровень: ${parent.name}` : 'Уровень: Корень проекта')
    : '';

  return (
    <div className="flowchart-properties-panel">
      <div className="properties-panel-header">
        <div className="properties-title-row">
          <span className="properties-icon">{elementType?.icon}</span>
          <h3>{elementType?.name || 'Элемент'}</h3>
          {selectedElement.type === 'plugin' && (
            <button
              className="properties-settings-btn"
              onClick={() => openPluginSettings(selectedElement.id)}
              title="Открыть настройки плагина"
              type="button"
            >
              ⚙️ Настроить
            </button>
          )}
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

        {/* Плагины, доступные на уровне элемента (наследуются от уровней выше) */}
        {effectivePlugins.length > 0 && (
          <>
            <div className="properties-divider">
              <span>🔌 Доступные плагины</span>
            </div>
            <div className="plugins-effective">
              {effectivePlugins.map(({ pluginElement, pluginId, scopeElement }) => (
                <button
                  key={pluginElement.id}
                  className="plugins-effective-item"
                  onClick={() => selectElement(pluginElement.id)}
                  title="Открыть настройки плагина"
                >
                  <span className="plugins-effective-name">{getPluginLabel(pluginId)}</span>
                  <span className="plugins-effective-scope">
                    {scopeElement ? `из: ${scopeElement.name}` : 'из: Корень'}
                  </span>
                </button>
              ))}
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

            {selectedElement.type === 'plugin' ? (
              <div className="plugin-editor">
                <div className="property-group">
                  <label>Плагин</label>
                  <select
                    value={selectedPluginId || 'telegram'}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const nextPlugin = availablePlugins.find(p => p.id === nextId) || null;

                      setProperties(prev => ({ ...prev, pluginId: nextId, config: {} }));

                      // Если имя по умолчанию, подставим имя плагина.
                      if ((name || '').trim() === (ELEMENT_TYPES.plugin?.name || 'Плагин') && nextPlugin?.name) {
                        setName(nextPlugin.name);
                        updateElement(selectedElementId, {
                          name: nextPlugin.name,
                          properties: { ...(properties || {}), pluginId: nextId, config: {} }
                        });
                        return;
                      }

                      setTimeout(handleSaveElement, 0);
                    }}
                    disabled={pluginsLoading}
                  >
                    {(availablePlugins.length > 0 ? availablePlugins : [{ id: 'telegram', name: 'Telegram' }]).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {pluginsError && <div className="field-hint error">{pluginsError}</div>}
                  <div className="field-hint">
                    {pluginScopeLabel}. Авторизованный Telegram можно использовать ниже по иерархии, а также создать новый Telegram-плагин на любом звене.
                  </div>
                </div>

                <div className="property-group">
                  <label>Включен</label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={properties?.enabled !== false}
                      onChange={(e) => {
                        handlePropertyChange('enabled', e.target.checked);
                        setTimeout(handleSaveElement, 0);
                      }}
                    />
                    <span className="checkbox-text">
                      {properties?.enabled !== false ? 'Да' : 'Нет'}
                    </span>
                  </label>
                  <div className="field-hint">Если выключить, этот плагин не будет считаться доступным для нижних уровней.</div>
                </div>

                {selectedPlugin?.description && (
                  <div className="plugin-card">
                    <div className="plugin-card-title">Как работает в системе</div>
                    <div className="plugin-card-text">{selectedPlugin.description}</div>
                    {selectedPlugin.howItWorks && (
                      <div className="plugin-card-text">{selectedPlugin.howItWorks}</div>
                    )}
                  </div>
                )}

                {selectedPlugin?.instructions && (
                  <details className="plugin-details" open>
                    <summary>Инструкция по подключению</summary>
                    {Array.isArray(selectedPlugin.instructions) ? (
                      <div className="plugin-instructions">
                        {selectedPlugin.instructions
                          .filter((section) => {
                            if (!section?.showIf) return true;
                            const cfg = properties?.config || {};
                            const depKey = section.showIf.key;
                            const depDefault = selectedPlugin.fields?.find(f => f.key === depKey)?.default;
                            const depVal = cfg?.[depKey] ?? depDefault;
                            return depVal === section.showIf.equals;
                          })
                          .map((section, idx) => (
                            <div key={idx} className="plugin-instructions-section">
                              {section.title && <div className="plugin-instructions-title">{section.title}</div>}
                              {section.text && <div className="plugin-instructions-text">{section.text}</div>}
                              {Array.isArray(section.steps) && (
                                <ul className="plugin-instructions-steps">
                                  {section.steps.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="plugin-instructions">{String(selectedPlugin.instructions)}</div>
                    )}
                  </details>
                )}

                {Array.isArray(selectedPlugin?.fields) && selectedPlugin.fields.length > 0 && (
                  <>
                    {selectedPlugin.fields.map((f) => {
                      const cfg = properties?.config || {};
                      const v = cfg[f.key] ?? f.default ?? '';

                      const isVisible = (() => {
                        if (!f?.showIf) return true;
                        const depKey = f.showIf.key;
                        const depVal = cfg?.[depKey] ?? selectedPlugin?.fields?.find(x => x.key === depKey)?.default;
                        return depVal === f.showIf.equals;
                      })();
                      if (!isVisible) return null;

                      const inputType = f.type === 'password'
                        ? 'password'
                        : (f.type === 'number' ? 'number' : 'text');
                      return (
                        <div key={f.key} className="property-group">
                          <label>{f.label}{f.required ? ' *' : ''}</label>
                          {f.type === 'select' ? (
                            <select
                              value={v}
                              onChange={(e) => {
                                handlePluginConfigChange(f.key, e.target.value);
                                setTimeout(handleSaveElement, 0);
                              }}
                            >
                              {(f.options || []).map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : f.type === 'textarea' ? (
                            <textarea
                              value={v}
                              onChange={(e) => handlePluginConfigChange(f.key, e.target.value)}
                              onBlur={handleSaveElement}
                              placeholder={f.placeholder || f.label}
                              rows={4}
                              autoComplete="off"
                            />
                          ) : (
                            <input
                              type={inputType}
                              value={v}
                              onChange={(e) => handlePluginConfigChange(
                                f.key,
                                inputType === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value
                              )}
                              onBlur={handleSaveElement}
                              placeholder={f.placeholder || f.label}
                              autoComplete="off"
                            />
                          )}
                          {f.help && <div className="field-hint">{f.help}</div>}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            ) : (
              Object.entries(elementType.properties).map(([key, propDef]) => (
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
                  ) : propDef.type === 'select' ? (
                    <select
                      value={properties[key] ?? propDef.default ?? ''}
                      onChange={(e) => {
                        handlePropertyChange(key, e.target.value);
                        setTimeout(handleSaveElement, 0);
                      }}
                    >
                      {(propDef.options || []).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
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
              ))
            )}
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
