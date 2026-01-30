import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import './Auth.css';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setMessage({ text: 'Ссылка недействительна: отсутствует токен', type: 'error' });
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;
    if (newPassword.length < 8) {
      setMessage({ text: 'Пароль должен быть не менее 8 символов', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Пароли не совпадают', type: 'error' });
      return;
    }
    setLoading(true);
    setMessage({ text: '', type: '' });
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: data.message || 'Пароль успешно изменён. Войдите с новым паролем.', type: 'success' });
        setTimeout(() => navigate('/'), 2500);
      } else {
        setMessage({ text: data.error || 'Ошибка сброса пароля', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Ошибка подключения к серверу', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <h1>Сброс пароля</h1>
            </div>
            <div className="error-message" style={{ display: 'block' }}>{message.text}</div>
            <div className="auth-footer" style={{ marginTop: '20px' }}>
              <p>
                <Link to="/forgot-password" style={{ color: '#667eea', textDecoration: 'none' }}>Запросить новую ссылку</Link>
                {' · '}
                <Link to="/" style={{ color: '#667eea', textDecoration: 'none' }}>На главную</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Новый пароль</h1>
            <p>Введите новый пароль (не менее 8 символов).</p>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="new-password">Новый пароль</label>
              <input
                type="password"
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Минимум 8 символов"
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Повторите пароль</label>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Повторите пароль"
                autoComplete="new-password"
              />
            </div>
            {message.text && (
              <div className={message.type === 'success' ? 'success-message' : 'error-message'} style={{ display: 'block', marginBottom: '16px' }}>
                {message.text}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить пароль'}
            </button>
            <div className="auth-footer" style={{ marginTop: '20px' }}>
              <p>
                <Link to="/" style={{ color: '#667eea', textDecoration: 'none' }}>← На главную</Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
