import { useEffect, useMemo, useState, useRef } from 'react';
import { useFlowchartStore } from '../../store/flowchartStore';
import { useAuth } from '../../context/AuthContext';
import './PluginSettingsModal.css';

const FALLBACK_TELEGRAM = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Подключите Telegram аккаунт (двойной клик для настройки)',
  fields: [] // Поля показываются в модальном окне, а не в общем списке
};

const STORAGE_KEY = 'telegram_setup_data';

function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(id);
  });
}

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
  const [chatStats, setChatStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);

  // Telegram Setup State
  const [step, setStep] = useState('form'); // 'form' | 'code' | 'testing' | 'success'
  const [apiId, setApiId] = useState('35115172');
  const [apiHash, setApiHash] = useState('3a86bee7a54b8b364f4532c2dc6f91af');
  const [appTitle, setAppTitle] = useState('aiternitas');
  const [publicKeys, setPublicKeys] = useState(`-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAyMEdY1aR+sCR3ZSJrtztKTKqigvO/vBfqACJLZtS7QMgCGXJ6XIR
yy7mx66W0/sOFa7/1mAZtEoIokDP3ShoqF4fVNb6XeqgQfaUHd8wJpDWHcR2OFwv
plUUI1PLTktZ9uW2WE23b+ixNwJjJGwBDJPQEQFBE+vfmH0JP503wr5INS1poWg/
j25sIWeYPHYeOrFp/eXaqhISP6G+q2IeTaWTXpwZj4LzXq5YOpk4bYEQ6mvRq7D1
aHWfYmlEGepfaYR8Q0YqvvhYtMte3ITnuSJs171+GDqpdKcSwHnd6FudwGO4pcCO
j4WcDuXc2CTHgH8gFTNhp/Y8/SpDOhvn9QIDAQAB
-----END RSA PUBLIC KEY-----`);
  const [phoneNumber, setPhoneNumber] = useState('+381641346987');
  const [code, setCode] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  const initialLoadDone = useRef(false);

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
    
    // Сброс статистики при смене элемента
    setChatStats(null);
    setStep('form');
    setError('');
    
    // Инициализация полей Telegram из свойств элемента
    const config = element.properties?.config || {};
    setApiId(config.apiId || '35115172');
    setApiHash(config.apiHash || '3a86bee7a54b8b364f4532c2dc6f91af');
    setAppTitle(config.appTitle || 'aiternitas');
    setPublicKeys(config.publicKeys || `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAyMEdY1aR+sCR3ZSJrtztKTKqigvO/vBfqACJLZtS7QMgCGXJ6XIR
yy7mx66W0/sOFa7/1mAZtEoIokDP3ShoqF4fVNb6XeqgQfaUHd8wJpDWHcR2OFwv
plUUI1PLTktZ9uW2WE23b+ixNwJjJGwBDJPQEQFBE+vfmH0JP503wr5INS1poWg/
j25sIWeYPHYeOrFp/eXaqhISP6G+q2IeTaWTXpwZj4LzXq5YOpk4bYEQ6mvRq7D1
aHWfYmlEGepfaYR8Q0YqvvhYtMte3ITnuSJs171+GDqpdKcSwHnd6FudwGO4pcCO
j4WcDuXc2CTHgH8gFTNhp/Y8/SpDOhvn9QIDAQAB
-----END RSA PUBLIC KEY-----`);
    setPhoneNumber(config.phoneNumber || '+381641346987');
    
    // Если подключено, сворачиваем по умолчанию
    const isConnected = element.properties?.connection?.status === 'connected';
    setIsConfigExpanded(!isConnected);
    
    initialLoadDone.current = true;
  }, [element?.id]);

  // Загрузка статистики для Telegram
  useEffect(() => {
    const pluginId = properties?.pluginId || element?.properties?.pluginId;
    const connectionStatus = properties?.connection?.status || element?.properties?.connection?.status;

    if (pluginId === 'telegram' && (connectionStatus === 'connected' || properties?.connection?.status === 'connected') && !chatStats && !loadingStats) {
      // Даем небольшую задержку, чтобы бэкенд успел сохранить конфиг в БД
      // (актуально при первом подключении)
      const fetchWithDelay = (retry = 0) => {
        if (!element?.id) return;
        setLoadingStats(true);
        fetch(`${apiBase}/api/telegram/stats?elementId=${element.id}`, { credentials: 'include' })
          .then(res => {
            if (!res.ok) {
              const err = new Error(`HTTP ${res.status}`);
              err.status = res.status;
              throw err;
            }
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              throw new TypeError('Not a JSON response');
            }
            return res.json();
          })
          .then(data => {
            if (data.success) {
              setChatStats(data.stats);
            }
          })
          .catch(err => {
            console.error(`Error fetching telegram stats (attempt ${retry + 1}):`, err);
            // Если 404, возможно БД еще не обновилась, попробуем еще раз через 2, 4, 6 секунд
            if (err.status === 404 && retry < 3) {
               const nextDelay = (retry + 1) * 2000;
               setTimeout(() => fetchWithDelay(retry + 1), nextDelay);
            }
          })
          .finally(() => setLoadingStats(false));
      };

      const timer = setTimeout(fetchWithDelay, 1000);
      return () => clearTimeout(timer);
    }
  }, [element?.id, properties?.pluginId, properties?.connection?.status, apiBase, chatStats, loadingStats]);

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

  const handleDisconnect = async (silent = false) => {
    if (!silent && !window.confirm('Вы уверены, что хотите полностью отключить Telegram? Это удалит сессию и настройки.')) {
      return;
    }

    setDisconnectLoading(true);
    try {
      const response = await fetchWithTimeout(`${apiBase}/api/telegram/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elementId: element.id,
          projectId: 'default'
        }),
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        save({
          ...(properties || {}),
          config: {
            ...config,
            // Сохраняем введенные данные, но сбрасываем статус подключения
          },
          connection: {
            status: 'not_tested',
            testedAt: null,
            error: ''
          }
        });
        setChatStats(null);
        setStep('form');
      } else if (!silent) {
        alert('Ошибка при отключении: ' + (data.error || 'Неизвестная ошибка'));
      }
    } catch (e) {
      console.error('Disconnect error:', e);
      if (!silent) alert('Ошибка при выполнении запроса');
    } finally {
      setDisconnectLoading(false);
    }
  };

  // Авто-отключение при изменении API ID или API Hash
  const handleApiFieldChange = (key, value) => {
    if (!initialLoadDone.current) return;
    
    // Обновляем локальное состояние полей
    if (key === 'apiId') setApiId(value);
    if (key === 'apiHash') setApiHash(value);
    if (key === 'appTitle') setAppTitle(value);
    if (key === 'publicKeys') setPublicKeys(value);

    // Если мы уже были подключены, отключаем
    if (effectiveStatus === 'connected') {
      handleDisconnect(true);
    }

    // Сохраняем в конфиг элемента
    setCfg(key, value);
  };

  // Auth logic
  const handleConnect = async () => {
    if (!user) {
      setError('Требуется авторизация в системе');
      return;
    }

    if (!apiId || !apiHash) {
      setError('Заполните App api_id и App api_hash');
      return;
    }

    if (!phoneNumber.trim()) {
      setError('Введите номер телефона');
      return;
    }

    setLoading(true);
    setError('');

    // Сбрасываем старые данные авторизации, кроме номера
    setCode('');
    setPhoneCodeHash('');

    try {
      // Для запроса отправки кода используем fetch без таймаута,
      // так как Telegram может отвечать дольше минуты.
      const res = await fetch(`${apiBase}/api/telegram/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiId, apiHash, appTitle, publicKeys, phoneNumber,
          elementId: element.id,
          projectId: 'default'
        })
      });
      
      const data = await res.json();
      console.log(data);
      if (data.status === 'code_sent' || data.phoneCodeHash) {
        setPhoneCodeHash(data.phoneCodeHash);
        setStep('code');
      } else if (data.success && data.status === 'connected') {
        save({
          ...(properties || {}),
          config: { apiId, apiHash, appTitle, publicKeys, phoneNumber },
          connection: {
            status: 'connected',
            testedAt: new Date().toISOString(),
            mode: 'account',
            user: data.user
          }
        });
        setChatStats(null);
        setStep('success');
        setIsConfigExpanded(false);
      } else {
        setError(data.error || data.message || 'Ошибка подключения');
      }
    } catch (e) {
      setError(e.message || 'Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!code.trim()) {
      setError('Введите код из Telegram');
      return;
    }

    setLoading(true);
    setError('');
    const prevStep = step;
    setStep('testing');

    try {
      const res = await fetchWithTimeout(`${apiBase}/api/telegram/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiId, apiHash, appTitle, publicKeys,
          phoneNumber,
          code: code.trim(),
          phoneCodeHash,
          elementId: element.id,
          projectId: 'default'
        })
      });

      const data = await res.json();

      if ((data.success && data.status === 'connected') || data.status === 'connected') {
        setResult(data);
        save({
          ...(properties || {}),
          config: { apiId, apiHash, appTitle, publicKeys, phoneNumber },
          connection: {
            status: 'connected',
            testedAt: new Date().toISOString(),
            mode: 'account',
            user: data.user
          }
        });
        setChatStats(null); // Сброс статистики для перезапроса
        setStep('success');
        setIsConfigExpanded(false); // Сворачиваем настройки после успешного подключения
      } else {
        setError(data.error || data.message || 'Ошибка авторизации');
        setStep(prevStep);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        setError('Превышено время ожидания ответа сервера. Попробуйте ещё раз.');
      } else {
        setError(e.message || 'Ошибка подключения');
      }
      setStep(prevStep);
    } finally {
      setLoading(false);
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

          {effectiveStatus === 'connected' && pluginId === 'telegram' && (
            <div className="plugin-stats">
              <div className="stats-header">
                <span className="status-badge connected">✅ Подключено</span>
                <button 
                  className="disconnect-btn-small" 
                  onClick={() => handleDisconnect()}
                  disabled={disconnectLoading}
                >
                  {disconnectLoading ? '...' : 'Удалить'}
                </button>
              </div>
              {loadingStats ? (
                <div className="field-hint">Загрузка статистики...</div>
              ) : chatStats ? (
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Всего чатов:</span>
                    <span className="stat-value">{chatStats.totalChats}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Непрочитанных:</span>
                    <span className={`stat-value ${chatStats.totalUnread > 0 ? 'has-unread' : ''}`}>
                      {chatStats.totalUnread}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="field-hint">Статистика недоступна</div>
              )}
            </div>
          )}

          {pluginId === 'telegram' && (
            <div className="telegram-integration-block">
              {step === 'form' && (
                <>
                  <div 
                    className={`config-toggle-header ${isConfigExpanded ? 'expanded' : ''}`}
                    onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                  >
                    <span className="toggle-icon">{isConfigExpanded ? '▼' : '▶'}</span>
                    <span className="toggle-label">Настройки API</span>
                  </div>

                  {isConfigExpanded && (
                    <div className="config-expandable-content">
                      <div className="property-group">
                        <label>App api_id *</label>
                        <input
                          type="text"
                          value={apiId}
                          onChange={(e) => handleApiFieldChange('apiId', e.target.value)}
                          placeholder="35115172"
                        />
                      </div>
                      <div className="property-group">
                        <label>App api_hash *</label>
                        <input
                          type="password"
                          value={apiHash}
                          onChange={(e) => handleApiFieldChange('apiHash', e.target.value)}
                          placeholder="3a86bee7a54b8b364f4532c2dc6f91af"
                        />
                      </div>
                      <div className="property-group">
                        <label>App title</label>
                        <input
                          type="text"
                          value={appTitle}
                          onChange={(e) => handleApiFieldChange('appTitle', e.target.value)}
                          placeholder="aiternitas"
                        />
                      </div>
                      <div className="property-group">
                        <label>Номер телефона аккаунта *</label>
                        <input
                          type="text"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+79991234567"
                        />
                      </div>
                      <div className="property-group">
                        <label>Public Key (PEM)</label>
                        <textarea
                          value={publicKeys}
                          onChange={(e) => handleApiFieldChange('publicKeys', e.target.value)}
                          placeholder="-----BEGIN RSA PUBLIC KEY----- ..."
                          rows={3}
                        />
                      </div>
                    </div>
                  )}
                  
                  {effectiveStatus !== 'connected' && (
                    <div className="auth-action-row">
                      {error && step === 'form' && <div className="error-message">{error}</div>}
                      <button 
                        className="connect-btn" 
                        onClick={handleConnect}
                        disabled={loading}
                      >
                        {loading ? 'Проверка...' : 'Подключиться к Telegram'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {['code', 'testing', 'success'].includes(step) && (
                <div className="auth-modal-overlay">
                  <div className="auth-modal-container">
                    <button className="auth-modal-close" onClick={() => setStep('form')}>&times;</button>

                    {step === 'code' && (
                      <div className="auth-step-container">
                        <h3>✅ Подтверждение</h3>
                        <p className="step-hint">Код отправлен на {phoneNumber}</p>
                        <div className="property-group">
                          <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="12345"
                            autoFocus
                            maxLength={5}
                          />
                        </div>
                        {error && <div className="error-message">{error}</div>}
                        <div className="btn-group">
                          <button className="primary-btn" onClick={handleConfirmCode} disabled={loading}>
                            {loading ? 'Подтверждение...' : 'Войти'}
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 'testing' && (
                      <div className="auth-step-container testing">
                        <div className="spinner"></div>
                        <p>Авторизация...</p>
                      </div>
                    )}

                    {step === 'success' && (
                      <div className="auth-step-container success">
                        <div className="success-icon">✅</div>
                        <h3>Готово!</h3>
                        <p>Telegram успешно подключен</p>
                        <button className="primary-btn" onClick={() => setStep('form')}>Закрыть</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {pluginId !== 'telegram' && Array.isArray(plugin.fields) && plugin.fields.length > 0 && (
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
    </div>
  );
}
