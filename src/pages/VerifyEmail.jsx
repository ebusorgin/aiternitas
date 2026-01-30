import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Токен верификации не найден');
      return;
    }

    // Верификация происходит через редирект на backend
    // Backend обработает токен и перенаправит обратно
    fetch(`/api/auth/verify-email?token=${token}`, {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => {
        if (response.redirected) {
          const url = new URL(response.url);
          if (url.searchParams.get('email_verified') === 'true') {
            setStatus('success');
            setMessage('Email успешно подтвержден!');
            setTimeout(() => {
              navigate('/');
            }, 2000);
          } else if (url.searchParams.get('error')) {
            setStatus('error');
            const error = url.searchParams.get('error');
            if (error === 'invalid_token') {
              setMessage('Неверный токен верификации');
            } else if (error === 'token_expired') {
              setMessage('Срок действия токена истек. Запросите новое письмо.');
            } else {
              setMessage('Ошибка верификации email');
            }
          }
        } else {
          setStatus('error');
          setMessage('Ошибка верификации');
        }
      })
      .catch((error) => {
        console.error('Ошибка верификации:', error);
        setStatus('error');
        setMessage('Ошибка подключения к серверу');
      });
  }, [searchParams, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Подтверждение Email</h1>
          </div>

          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p>Проверка токена...</p>
            </div>
          )}

          {status === 'success' && (
            <div>
              <div className="success-message" style={{ display: 'block' }}>
                {message}
              </div>
              <p style={{ textAlign: 'center', marginTop: '20px', color: '#aaa' }}>
                Перенаправление на главную страницу...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div>
              <div className="error-message" style={{ display: 'block' }}>
                {message}
              </div>
              {resendMessage && (
                <div className={resendMessage.startsWith('Письмо') ? 'success-message' : 'error-message'} style={{ display: 'block', marginTop: '12px' }}>
                  {resendMessage}
                </div>
              )}
              <div className="verify-actions">
                {user && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      setResendLoading(true);
                      setResendMessage('');
                      try {
                        const res = await fetch('/api/auth/resend-verification', {
                          method: 'POST',
                          credentials: 'include'
                        });
                        const data = await res.json();
                        if (data.success) {
                          setResendMessage(data.message || 'Письмо отправлено. Проверьте почту.');
                        } else {
                          setResendMessage(data.error || 'Ошибка отправки');
                        }
                      } catch {
                        setResendMessage('Ошибка подключения к серверу');
                      } finally {
                        setResendLoading(false);
                      }
                    }}
                    disabled={resendLoading}
                  >
                    {resendLoading ? 'Отправка...' : 'Отправить письмо повторно'}
                  </button>
                )}
                {!user && (
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>
                    Войдите в аккаунт и в разделе «Личный кабинет» нажмите «Отправить письмо повторно».
                  </p>
                )}
                <p>
                  <Link to="/" style={{ color: '#667eea', textDecoration: 'none' }}>
                    ← На главную
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;

