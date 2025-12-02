import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Settings.css';

// Страны для выхода TOR
const TOR_COUNTRIES = [
  { code: 'US', name: 'США', flag: '🇺🇸' },
  { code: 'DE', name: 'Германия', flag: '🇩🇪' },
  { code: 'NL', name: 'Нидерланды', flag: '🇳🇱' },
  { code: 'FR', name: 'Франция', flag: '🇫🇷' },
  { code: 'GB', name: 'Великобритания', flag: '🇬🇧' },
  { code: 'CH', name: 'Швейцария', flag: '🇨🇭' },
  { code: 'SE', name: 'Швеция', flag: '🇸🇪' },
  { code: 'CA', name: 'Канада', flag: '🇨🇦' },
  { code: 'JP', name: 'Япония', flag: '🇯🇵' },
  { code: 'SG', name: 'Сингапур', flag: '🇸🇬' },
];

function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    torEnabled: false,
    torExitCountry: 'US',
    openaiApiKey: '',
    torHost: '127.0.0.1',
    torPort: 9050,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  // Загрузка настроек
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSettings(prev => ({
          ...prev,
          ...data.settings,
        }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ text: 'Настройки сохранены', type: 'success' });
      } else {
        setMessage({ text: data.error || 'Ошибка сохранения', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Ошибка подключения к серверу', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const response = await fetch('/api/settings/test-tor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          torHost: settings.torHost,
          torPort: settings.torPort,
          exitCountry: settings.torExitCountry,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus({
          success: true,
          ip: data.ip,
          country: data.country,
          message: `Подключено через ${data.country} (IP: ${data.ip})`,
        });
      } else {
        setConnectionStatus({
          success: false,
          message: data.error || 'Не удалось подключиться к TOR',
        });
      }
    } catch (error) {
      setConnectionStatus({
        success: false,
        message: 'Ошибка тестирования подключения',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const testOpenAI = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const response = await fetch('/api/settings/test-openai', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus({
          success: true,
          message: `OpenAI API работает! Модель: ${data.model}`,
        });
      } else {
        setConnectionStatus({
          success: false,
          message: data.error || 'Ошибка подключения к OpenAI',
        });
      }
    } catch (error) {
      setConnectionStatus({
        success: false,
        message: 'Ошибка тестирования OpenAI',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">Загрузка настроек...</div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <Link to="/" className="back-link">
          ← На главную
        </Link>
      </div>

      <div className="settings-card">
        <div className="settings-title-section">
          <span className="settings-icon">⚙️</span>
          <div>
            <h1 className="settings-title">Настройки</h1>
            <p className="settings-subtitle">Конфигурация сервера и API</p>
          </div>
        </div>

        {/* OpenAI Section */}
        <div className="settings-section">
          <div className="section-header">
            <span className="section-icon">🤖</span>
            <h2 className="section-title">OpenAI API</h2>
          </div>

          <div className="settings-field">
            <label htmlFor="openai-key">API Ключ</label>
            <div className="input-with-action">
              <input
                id="openai-key"
                type="password"
                value={settings.openaiApiKey}
                onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>
            <span className="field-hint">
              Получите ключ на <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a>
            </span>
          </div>
        </div>

        {/* TOR Section */}
        <div className="settings-section">
          <div className="section-header">
            <span className="section-icon">🧅</span>
            <h2 className="section-title">TOR Прокси</h2>
            <span className="section-badge">Обход блокировок</span>
          </div>

          <div className="settings-field toggle-field">
            <div className="toggle-info">
              <label htmlFor="tor-enabled">Использовать TOR</label>
              <span className="field-hint">
                Направляет запросы к OpenAI через TOR сеть для обхода региональных блокировок
              </span>
            </div>
            <label className="toggle-switch">
              <input
                id="tor-enabled"
                type="checkbox"
                checked={settings.torEnabled}
                onChange={(e) => setSettings({ ...settings, torEnabled: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {settings.torEnabled && (
            <>
              <div className="settings-field">
                <label htmlFor="tor-country">Страна выхода</label>
                <div className="country-select-wrapper">
                  <select
                    id="tor-country"
                    value={settings.torExitCountry}
                    onChange={(e) => setSettings({ ...settings, torExitCountry: e.target.value })}
                  >
                    {TOR_COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="field-hint">
                  Выберите страну, откуда будут исходить запросы. Рекомендуется: США, Германия, Нидерланды.
                </span>
              </div>

              <div className="settings-row">
                <div className="settings-field">
                  <label htmlFor="tor-host">TOR Host</label>
                  <input
                    id="tor-host"
                    type="text"
                    value={settings.torHost}
                    onChange={(e) => setSettings({ ...settings, torHost: e.target.value })}
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="tor-port">TOR Port</label>
                  <input
                    id="tor-port"
                    type="number"
                    value={settings.torPort}
                    onChange={(e) => setSettings({ ...settings, torPort: parseInt(e.target.value) || 9050 })}
                    placeholder="9050"
                  />
                </div>
              </div>

              <div className="tor-info-box">
                <div className="info-icon">💡</div>
                <div className="info-content">
                  <strong>Как настроить TOR:</strong>
                  <ol>
                    <li>Установите <a href="https://www.torproject.org/download/" target="_blank" rel="noopener noreferrer">Tor Browser</a> или Tor Expert Bundle</li>
                    <li>Запустите TOR (по умолчанию SOCKS5 на порту 9050)</li>
                    <li>Для выбора страны выхода отредактируйте файл <code>torrc</code>:</li>
                  </ol>
                  <pre className="torrc-example">
{`ExitNodes {${settings.torExitCountry}}
StrictNodes 1`}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Test Connection */}
        <div className="settings-section">
          <div className="section-header">
            <span className="section-icon">🔌</span>
            <h2 className="section-title">Тестирование</h2>
          </div>

          <div className="test-buttons">
            {settings.torEnabled && (
              <button
                className="test-btn tor-test"
                onClick={testConnection}
                disabled={testingConnection}
              >
                {testingConnection ? (
                  <>
                    <span className="spinner"></span>
                    Проверка...
                  </>
                ) : (
                  <>
                    <span>🧅</span>
                    Проверить TOR
                  </>
                )}
              </button>
            )}
            <button
              className="test-btn openai-test"
              onClick={testOpenAI}
              disabled={testingConnection}
            >
              {testingConnection ? (
                <>
                  <span className="spinner"></span>
                  Проверка...
                </>
              ) : (
                <>
                  <span>🤖</span>
                  Проверить OpenAI
                </>
              )}
            </button>
          </div>

          {connectionStatus && (
            <div className={`connection-status ${connectionStatus.success ? 'success' : 'error'}`}>
              <span className="status-icon">{connectionStatus.success ? '✅' : '❌'}</span>
              <span className="status-message">{connectionStatus.message}</span>
            </div>
          )}
        </div>

        {/* Message */}
        {message.text && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Save Button */}
        <div className="settings-footer">
          <button
            className="save-settings-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner"></span>
                Сохранение...
              </>
            ) : (
              <>
                <span>💾</span>
                Сохранить настройки
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;

