import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './TelegramSetup.css';

const STORAGE_KEY = 'telegram_setup_data';

export default function TelegramSetup({ onClose, elementName, onSuccess }) {
  const { user } = useAuth();
  const [step, setStep] = useState('form'); // 'form' | 'phone' | 'code' | 'testing' | 'success'

  // Загружаем сохранённые данные из localStorage
  const loadSavedData = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };

  const savedData = loadSavedData();

  // Поля формы с загрузкой из localStorage
  const [apiId, setApiId] = useState(savedData.apiId || '');
  const [apiHash, setApiHash] = useState(savedData.apiHash || '');
  const [appTitle, setAppTitle] = useState(savedData.appTitle || 'aiternitas');
  const [publicKeys, setPublicKeys] = useState(savedData.publicKeys || '');

  // Сохранение данных в localStorage при изменении
  useEffect(() => {
    const dataToSave = { apiId, apiHash, appTitle, publicKeys };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [apiId, apiHash, appTitle, publicKeys]);

  // Авторизация
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

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

  // Тест подключения
  const handleTest = async () => {
    if (!user) {
      setError('Требуется авторизация в системе');
      return;
    }

    if (!apiId || !apiHash) {
      setError('Заполните App api_id и App api_hash');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/api/telegram/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash, appTitle, publicKeys })
      });

      const data = await res.json();

      if (data.status === 'auth_required' || data.needsAuth) {
        // Требуется авторизация - переходим к вводу номера
        setStep('phone');
      } else if (data.success && data.status === 'connected') {
        // Уже авторизован!
        setResult(data);
        setStep('success');
      } else {
        setError(data.error || data.message || 'Ошибка тестирования');
      }
    } catch (e) {
      setError(e.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  // Отправить код
  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      setError('Введите номер телефона');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/api/telegram/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash, appTitle, publicKeys, phoneNumber })
      });

      const data = await res.json();

      if (data.success && data.phoneCodeHash) {
        setPhoneCodeHash(data.phoneCodeHash);
        setStep('code');
      } else {
        setError(data.error || 'Ошибка отправки кода');
      }
    } catch (e) {
      setError(e.message || 'Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  // Подтвердить код
  const handleConfirmCode = async () => {
    if (!code.trim()) {
      setError('Введите код из Telegram');
      return;
    }

    setLoading(true);
    setError('');
    setStep('testing');

    try {
      const res = await fetch(`${apiBase}/api/telegram/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiId,
          apiHash,
          appTitle,
          publicKeys,
          phoneNumber,
          code: code.trim(),
          phoneCodeHash
        })
      });

      const data = await res.json();

      if (data.success && data.status === 'connected') {
        setResult(data);
        setStep('success');

        // Вызываем callback для сохранения конфигурации
        if (onSuccess) {
          onSuccess(
            { apiId, apiHash, appTitle, publicKeys },
            data
          );
        }
      } else {
        setError(data.error || data.message || 'Ошибка авторизации');
        setStep('code');
      }
    } catch (e) {
      setError(e.message || 'Ошибка подключения');
      setStep('code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="telegram-setup-overlay" onClick={onClose}>
      <div className="telegram-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="telegram-setup-header">
          <h2>🔗 Подключение Telegram</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="telegram-setup-content">
          {/* Шаг 1: Форма с данными */}
          {step === 'form' && (
            <>
              <p className="hint">
                Данные берутся с <strong>my.telegram.org → API development tools</strong>
              </p>

              <div className="form-group">
                <label>App api_id *</label>
                <input
                  type="text"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  placeholder="35115172"
                />
                <span className="field-hint">Число из блока "App configuration"</span>
              </div>

              <div className="form-group">
                <label>App api_hash *</label>
                <input
                  type="password"
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                  placeholder="3a86bee7a54b8b364f4532c2dc6f91af"
                />
                <span className="field-hint">Строка из блока "App configuration"</span>
              </div>

              <div className="form-group">
                <label>App title</label>
                <input
                  type="text"
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  placeholder="aiternitas"
                />
                <span className="field-hint">Название вашего приложения</span>
              </div>

              <div className="form-group">
                <label>Public keys (Production)</label>
                <textarea
                  value={publicKeys}
                  onChange={(e) => setPublicKeys(e.target.value)}
                  placeholder="-----BEGIN RSA PUBLIC KEY-----&#10;...&#10;-----END RSA PUBLIC KEY-----"
                  rows={4}
                />
                <span className="field-hint">Из блока "Production configuration"</span>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                className="test-btn"
                onClick={handleTest}
                disabled={loading || !user}
              >
                {loading ? 'Проверяем...' : '✓ Тест'}
              </button>

              {!user && (
                <div className="warning-message">
                  ⚠️ Войдите в систему для тестирования
                </div>
              )}
            </>
          )}

          {/* Шаг 2: Ввод номера телефона */}
          {step === 'phone' && (
            <>
              <p className="hint">
                📱 Введите номер телефона для получения кода подтверждения
              </p>

              <div className="form-group">
                <label>Номер телефона *</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+79991234567"
                  autoFocus
                />
                <span className="field-hint">В международном формате с +</span>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="btn-group">
                <button onClick={() => setStep('form')} disabled={loading}>
                  ← Назад
                </button>
                <button
                  className="test-btn"
                  onClick={handleSendCode}
                  disabled={loading}
                >
                  {loading ? 'Отправляем...' : 'Отправить код'}
                </button>
              </div>
            </>
          )}

          {/* Шаг 3: Ввод кода */}
          {step === 'code' && (
            <>
              <p className="hint success">
                ✅ Код отправлен в Telegram на номер <strong>{phoneNumber}</strong>
              </p>

              <div className="form-group">
                <label>Код из Telegram *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  autoFocus
                  maxLength={5}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleConfirmCode();
                  }}
                />
                <span className="field-hint">Откройте Telegram и введите код</span>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="btn-group">
                <button onClick={() => setStep('phone')} disabled={loading}>
                  ← Назад
                </button>
                <button
                  className="test-btn"
                  onClick={handleConfirmCode}
                  disabled={loading}
                >
                  {loading ? 'Проверяем...' : 'Подтвердить'}
                </button>
              </div>
            </>
          )}

          {/* Шаг 4: Тестирование */}
          {step === 'testing' && (
            <div className="testing-state">
              <div className="spinner"></div>
              <p>Тестируем подключение...</p>
              <p className="hint">Отправляем сообщение в "Избранное"</p>
            </div>
          )}

          {/* Шаг 5: Успех */}
          {step === 'success' && result && (
            <div className="success-state">
              <div className="success-icon">✅</div>
              <h3>Telegram подключен!</h3>
              <p>
                Пользователь: <strong>{result.user?.firstName || result.user?.username}</strong>
              </p>
              <p className="hint">{result.message}</p>
              <button className="test-btn" onClick={onClose}>
                Готово
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
