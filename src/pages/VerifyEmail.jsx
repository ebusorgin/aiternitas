import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Auth.css';

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

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
              <div className="auth-footer">
                <p>
                  <a href="/" style={{ color: '#667eea', textDecoration: 'none' }}>
                    ← На главную
                  </a>
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

