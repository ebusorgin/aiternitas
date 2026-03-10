import { useState, useEffect } from 'react';
import './TelegramAuthModal.css';

export default function TelegramAuthModal({ apiBase, apiId, apiHash, phoneNumber, onSuccess, onClose }) {
  const [step, setStep] = useState('loading'); // 'loading' | 'code' | 'password'
  const [sessionId, setSessionId] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Шаг 1: Отправить код
  const handleStartAuth = async () => {
    setLoading(true);
    setError('');

    try {
      const url = `${apiBase}/api/plugins/telegram/auth/start`;
      console.log('🔐 Starting Telegram auth:', { url, apiId, phoneNumber });

      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash, phoneNumber })
      });

      console.log('📡 Response status:', res.status, res.statusText);

      // Проверяем content-type
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('❌ Not JSON response:', text.substring(0, 200));
        throw new Error('Сервер вернул неверный формат ответа. Возможно требуется авторизация.');
      }

      const data = await res.json();
      console.log('📦 Response data:', data);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ошибка отправки кода');
      }

      setSessionId(data.sessionId);
      setStep('code');
    } catch (e) {
      console.error('❌ Telegram auth error:', e);
      setError(e.message);
      setStep('code'); // Показываем форму даже при ошибке
    } finally {
      setLoading(false);
    }
  };

  // Шаг 2: Подтвердить код (и пароль если нужен)
  const handleCompleteAuth = async () => {
    if (!code.trim()) {
      setError('Введите код из Telegram');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/api/plugins/telegram/auth/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          code: code.trim(),
          password: password.trim() || undefined
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Если нужен пароль 2FA
        if (data.error?.includes('2FA') || data.error?.includes('password')) {
          setStep('password');
          setError('Требуется пароль двухфакторной аутентификации');
          return;
        }

        throw new Error(data.error || 'Ошибка подтверждения');
      }

      // Успех!
      onSuccess({
        sessionString: data.sessionString,
        user: data.user
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Отмена
  const handleCancel = async () => {
    if (sessionId) {
      try {
        await fetch(`${apiBase}/api/plugins/telegram/auth/cancel`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
      } catch (e) {
        // ignore
      }
    }
    onClose();
  };

  // Автоматически запускаем авторизацию при открытии
  useEffect(() => {
    handleStartAuth();
  }, []);

  return (
    <div className="telegram-auth-overlay" onClick={handleCancel}>
      <div className="telegram-auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="telegram-auth-header">
          <h3>Подключение Telegram</h3>
          <button className="telegram-auth-close" onClick={handleCancel}>×</button>
        </div>

        <div className="telegram-auth-content">
          {loading && step === 'loading' && (
            <div className="telegram-auth-loading">
              <div className="spinner"></div>
              <p>Отправляем код в Telegram...</p>
            </div>
          )}

          {step === 'code' && (
            <>
              <p className="telegram-auth-info">
                📱 Код подтверждения отправлен в Telegram на номер <strong>{phoneNumber}</strong>
              </p>

              <div className="form-group">
                <label>Код из Telegram</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  autoFocus
                  maxLength={5}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleCompleteAuth();
                  }}
                />
                <div className="field-hint">
                  Откройте Telegram и введите код из сообщения
                </div>
              </div>

              {error && <div className="telegram-auth-error">❌ {error}</div>}

              <div className="telegram-auth-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleCompleteAuth}
                  disabled={loading || !code.trim()}
                >
                  {loading ? 'Проверяем...' : 'Подтвердить'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Отмена
                </button>
              </div>
            </>
          )}

          {step === 'password' && (
            <>
              <p className="telegram-auth-info">
                🔐 Требуется пароль двухфакторной аутентификации
              </p>

              <div className="form-group">
                <label>Код из Telegram</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  maxLength={5}
                />
              </div>

              <div className="form-group">
                <label>Пароль 2FA</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ваш пароль"
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleCompleteAuth();
                  }}
                />
                <div className="field-hint">
                  Введите пароль, который вы установили в настройках Telegram
                </div>
              </div>

              {error && <div className="telegram-auth-error">❌ {error}</div>}

              <div className="telegram-auth-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleCompleteAuth}
                  disabled={loading || !code.trim() || !password.trim()}
                >
                  {loading ? 'Проверяем...' : 'Подтвердить'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
