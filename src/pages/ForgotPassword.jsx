import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Auth.css';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setMessage({ text: 'Укажите email', type: 'error' });
      return;
    }
    setLoading(true);
    setMessage({ text: '', type: '' });
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: data.message || 'Если указанный email зарегистрирован, на него отправлена ссылка для сброса пароля.', type: 'success' });
      } else {
        setMessage({ text: data.error || 'Ошибка. Попробуйте позже.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Ошибка подключения к серверу', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Восстановление пароля</h1>
            <p>Введите email, указанный при регистрации. Мы отправим ссылку для восстановления пароля.</p>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
            {message.text && (
              <div className={message.type === 'success' ? 'success-message' : 'error-message'} style={{ display: 'block', marginBottom: '16px' }}>
                {message.text}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Отправка...' : 'Отправить ссылку'}
            </button>
            <div className="auth-footer" style={{ marginTop: '20px' }}>
              <p>
                <Link to="/" style={{ color: '#667eea', textDecoration: 'none' }}>
                  ← На главную
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
