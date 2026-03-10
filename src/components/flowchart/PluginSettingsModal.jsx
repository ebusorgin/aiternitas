import { useEffect, useMemo, useState } from 'react';
import { useFlowchartStore } from '../../store/flowchartStore';
import { useAuth } from '../../context/AuthContext';
import TelegramSetup from './TelegramSetup';
import './PluginSettingsModal.css';

const FALLBACK_TELEGRAM = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Подключите Telegram аккаунт (двойной клик для настройки)',
  fields: [] // Поля показываются в модальном окне, а не в общем списке
};

function fieldVisible(field, config, plugin) {
  if (!field?.showIf) return true;
  const depKey = field.showIf.key;
  const depDefault = plugin?.fields?.find(f => f.key === depKey)?.default;
  const depVal = config?.[depKey] ?? depDefault;
  return depVal === field.showIf.equals;
}


export default function PluginSettingsModal() {
  const { user } = useAuth();
  const pluginSettingsElementId = useFlowchartStore(s => s.pluginSettingsElementId);
  const closePluginSettings = useFlowchartStore(s => s.closePluginSettings);
  const elements = useFlowchartStore(s => s.elements);
  const updateElement = useFlowchartStore(s => s.updateElement);

  const element = useMemo(() => (
    pluginSettingsElementId ? elements.find(e => e.id === pluginSettingsElementId) : null
  ), [pluginSettingsElementId, elements]);

  const [availablePlugins, setAvailablePlugins] = useState([FALLBACK_TELEGRAM]);
  const [pluginsFetchAttempted, setPluginsFetchAttempted] = useState(false);
  const [properties, setProperties] = useState({});
  const [testLoading, setTestLoading] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [showTelegramAuth, setShowTelegramAuth] = useState(false);

  // Определяем base URL для API запросов
  const apiBase = (() => {
    if (typeof window === 'undefined') return '';

    // В dev режиме (порты 3000, 5173) используем backend на 3001
    const port = window.location.port;
    if (port === '3000' || port === '5173') {
      return `http://${window.location.hostname}:3001`;
    }

    // В production используем тот же origin
    return '';
  })();

  useEffect(() => {
    if (!element) return;
    setProperties(element.properties || {});
  }, [element?.id]);

  useEffect(() => {
    if (!element) return;
    if (pluginsFetchAttempted) return;
    setPluginsFetchAttempted(true);

    fetch(`${apiBase}/api/plugins`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
        if (plugins.length > 0) setAvailablePlugins(plugins);
      })
      .catch(() => {
        // Silent: fallback is already loaded.
      });
  }, [apiBase, element, pluginsFetchAttempted]);

  if (!element) return null;

  const pluginId = properties?.pluginId || 'telegram';
  const plugin = availablePlugins.find(p => p.id === pluginId) || FALLBACK_TELEGRAM;
  const config = properties?.config || {};
  const connection = properties?.connection || null;
  const connectionStatus = connection?.status || 'not_tested';
  const effectiveStatus = connectionStatus;
  const effectiveError = connection?.error || '';

  const save = (nextProps) => {
    setProperties(nextProps);
    updateElement(element.id, { properties: nextProps });
  };

  const setProp = (key, value) => {
    save({ ...(properties || {}), [key]: value });
  };

  const setCfg = (key, value) => {
    save({
      ...(properties || {}),
      config: { ...(properties?.config || {}), [key]: value }
    });
  };

  const testConnection = async () => {
    // Check if user is authenticated
    if (!user) {
      setTestMessage('❌ Требуется авторизация. Войдите в систему для тестирования плагина.');
      return;
    }

    setTestLoading(true);
    setTestMessage('');
    try {
      const res = await fetch(`${apiBase}/api/plugins/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, config })
      });

      if (res.status === 401) {
        setTestMessage('❌ Требуется авторизация. Войдите в систему.');
        save({
          ...(properties || {}),
          connection: {
            status: 'connection_failed',
            testedAt: new Date().toISOString(),
            mode: config?.authMode || 'account',
            error: 'Требуется авторизация'
          }
        });
        setTestLoading(false);
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Handle validation errors (400) - show which fields are missing
      if (res.status === 400 || data?.status === 'invalid' || data?.status === 'not_configured') {
        const errMsg = data?.error || 'Ошибка валидации';
        setTestMessage(`❌ ${errMsg}`);
        save({
          ...(properties || {}),
          connection: {
            status: data?.status || 'invalid',
            testedAt: new Date().toISOString(),
            mode: data?.mode || config?.authMode || 'account',
            error: errMsg
          }
        });
        setTestLoading(false);
        return;
      }

      // Handle server errors (500)
      if (!res.ok) {
        const errMsg = data?.error || `Ошибка сервера (HTTP ${res.status})`;
        setTestMessage(`❌ ${errMsg}`);
        save({
          ...(properties || {}),
          connection: {
            status: 'connection_failed',
            testedAt: new Date().toISOString(),
            mode: data?.mode || config?.authMode || 'account',
            error: errMsg
          }
        });
        setTestLoading(false);
        return;
      }

      const status = data?.status || (data?.success ? 'connected' : 'connection_failed');
      const testedAt = data?.testedAt || new Date().toISOString();
      const err = data?.error || '';

      save({
        ...(properties || {}),
        connection: {
          status,
          testedAt,
          mode: data?.mode || config?.authMode || 'account',
          error: err
        }
      });

      setTestMessage(data?.success
        ? '✅ Тест пройден: сообщение отправлено.'
        : `❌ ${err || 'Тест не пройден.'}`);
    } catch (e) {
      const errMsg = e?.message || 'Ошибка тестирования';
      setTestMessage(`❌ ${errMsg}`);
      save({
        ...(properties || {}),
        connection: {
          status: 'connection_failed',
          testedAt: new Date().toISOString(),
          mode: config?.authMode || 'account',
          error: errMsg
        }
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="plugin-settings-overlay" onClick={closePluginSettings}>
      <div className="plugin-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="plugin-settings-header">
          <div className="plugin-settings-title">
            <div className="plugin-settings-title-row">
              <span className="plugin-settings-icon">🔌</span>
              <div className="plugin-settings-title-text">
                <div className="plugin-settings-name">Настройки плагина</div>
                <div className="plugin-settings-subtitle">{element.name}</div>
              </div>
            </div>
          </div>
          <button className="plugin-settings-close" onClick={closePluginSettings}>×</button>
        </div>

        <div className="plugin-settings-content">
          <div className="property-group">
            <label>Плагин</label>
            <select
              value={pluginId}
              onChange={(e) => {
                const nextId = e.target.value;
                const nextPlugin = availablePlugins.find(p => p.id === nextId);
                const next = { ...(properties || {}), pluginId: nextId, config: {} };
                save(next);
                if ((element.name || '').trim() === 'Плагин' && nextPlugin?.name) {
                  updateElement(element.id, { name: nextPlugin.name });
                }
              }}
            >
              {availablePlugins.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="field-hint">
              Плагин доступен ниже по иерархии от уровня, где он создан (на корне или внутри департамента).
            </div>
          </div>

          <div className="property-group">
            <label>Включен</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={properties?.enabled !== false}
                onChange={(e) => setProp('enabled', e.target.checked)}
              />
              <span className="checkbox-text">{properties?.enabled !== false ? 'Да' : 'Нет'}</span>
            </label>
          </div>

          <div className="plugin-test-card">
            <div className="plugin-test-row">
              <div className="plugin-test-title">Статус подключения</div>
              <span className={`plugin-status-badge ${effectiveStatus || 'unknown'}`}>
                {effectiveStatus === 'connected' ? 'Подключено' :
                  effectiveStatus === 'not_configured' ? 'Не заполнено' :
                    effectiveStatus === 'invalid' ? 'Неверные данные' :
                      effectiveStatus === 'connection_failed' ? 'Ошибка подключения' :
                        effectiveStatus === 'not_tested' ? 'Не протестировано' :
                          'Не протестировано'}
              </span>
            </div>
            {connection?.testedAt && (
              <div className="field-hint">Последняя проверка: {new Date(connection.testedAt).toLocaleString()}</div>
            )}
            {effectiveError && (
              <div className="field-hint error">{effectiveError}</div>
            )}
            {testMessage && (
              <div className="field-hint">{testMessage}</div>
            )}
            {!user && (
              <div className="field-hint error">
                ⚠️ Для тестирования плагина необходимо войти в систему
              </div>
            )}
            <button
              className="plugin-test-btn"
              onClick={testConnection}
              disabled={testLoading || !user}
              type="button"
            >
              {testLoading ? 'Проверяем...' : 'Протестировать соединение'}
            </button>
            <div className="field-hint">
              Тест отправляет сообщение в "Избранное" (Saved Messages) и сразу отключается.
            </div>
          </div>

          <div className="plugin-card">
            <div className="plugin-card-title">Описание</div>
            <div className="plugin-card-text">{plugin.description}</div>
            {plugin.howItWorks && <div className="plugin-card-text">{plugin.howItWorks}</div>}
          </div>

          {/* Кнопка настройки Telegram */}
          {pluginId === 'telegram' && (
            <div className="property-group">
              <button
                className="plugin-connect-btn"
                onClick={() => setShowTelegramAuth(true)}
                type="button"
              >
                🔗 Настроить Telegram
              </button>
              <div className="field-hint">
                Откройте окно настройки для подключения Telegram аккаунта
              </div>
            </div>
          )}

          {Array.isArray(plugin.fields) && plugin.fields.length > 0 && (
            <div className="plugin-fields">
              {plugin.fields
                .filter(f => fieldVisible(f, config, plugin))
                .map((f) => {
                  const v = config[f.key] ?? f.default ?? '';
                  const inputType = f.type === 'password' ? 'password' : (f.type === 'number' ? 'number' : 'text');
                  return (
                    <div key={f.key} className="property-group">
                      <label>{f.label}{f.required ? ' *' : ''}</label>
                      {f.type === 'select' ? (
                        <select value={v} onChange={(e) => setCfg(f.key, e.target.value)}>
                          {(f.options || []).map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea
                          value={v}
                          onChange={(e) => setCfg(f.key, e.target.value)}
                          placeholder={f.placeholder || f.label}
                          rows={4}
                        />
                      ) : (
                        <input
                          type={inputType}
                          value={v}
                          onChange={(e) => setCfg(f.key, inputType === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
                          placeholder={f.placeholder || f.label}
                          autoComplete="off"
                        />
                      )}
                      {f.help && <div className="field-hint">{f.help}</div>}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно подключения Telegram */}
      {showTelegramAuth && (
        <TelegramSetup
          onClose={() => setShowTelegramAuth(false)}
          elementName={element.name}
          onSuccess={(config, status) => {
            // Сохраняем конфигурацию и статус
            save({
              ...(properties || {}),
              config: { ...config },
              connection: {
                status: status.status,
                testedAt: new Date().toISOString(),
                mode: 'account',
                error: '',
                user: status.user
              }
            });
            setShowTelegramAuth(false);
            setTestMessage(`✅ Telegram подключен: ${status.user?.firstName || status.user?.username}`);
          }}
        />
      )}
    </div>
  );
}
