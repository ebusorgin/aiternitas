import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';
import './Auth.css';

function Home() {
  const { user, loading, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState('login');
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    // Проверяем параметры URL для уведомлений
    const urlParams = new URLSearchParams(window.location.search);
    const emailVerified = urlParams.get('email_verified');
    const errorParam = urlParams.get('error');
    
    if (emailVerified === 'true') {
      setSuccess('Email успешно подтвержден!');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'invalid_token') {
      setError('Неверная ссылка подтверждения');
    } else if (errorParam === 'token_expired') {
      setError('Ссылка подтверждения истекла. Пожалуйста, запросите новую.');
    } else if (errorParam === 'verification_failed') {
      setError('Ошибка подтверждения email. Попробуйте позже.');
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setFormLoading(true);

    if (!email || !password) {
      setError('Email и пароль обязательны');
      setFormLoading(false);
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      // Не перезагружаем страницу — AuthContext уже обновил user, дашборд покажется сам
    } else {
      if (result.emailVerificationRequired) {
        setError(result.error || 'Email не подтвержден');
        if (result.verificationUrl) {
          console.log('Email verification URL:', result.verificationUrl);
          setSuccess('Ссылка для подтверждения доступна в консоли браузера. Или запросите новое письмо.');
        }
      } else {
        setError(result.error);
      }
      setFormLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFormLoading(true);

    if (!name || !email || !password) {
      setError('Все поля обязательны');
      setFormLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      setFormLoading(false);
      return;
    }

    const result = await register(name, email, password);

    if (result.success) {
      if (result.emailVerificationRequired) {
        let msg = result.message || (result.emailSendFailed
          ? 'Регистрация успешна, но письмо не удалось отправить. Используйте «Отправить письмо повторно» в профиле.'
          : 'Регистрация успешна! Пожалуйста, проверьте вашу почту и подтвердите email.');
        if (result.emailSendFailed && result.emailSendError) {
          msg += ` Причина: ${result.emailSendError}`;
        }
        setSuccess(msg);
      } else {
        setSuccess(result.message || 'Регистрация успешна!');
      }
      // Не перезагружаем — user уже установлен в AuthContext
    } else {
      setError(result.error);
      setFormLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        setError(result.error || 'Ошибка входа через Google');
        setGoogleLoading(false);
      }
    } catch (error) {
      setError('Ошибка подключения к серверу');
      setGoogleLoading(false);
    }
  };

  // Если пользователь авторизован, показываем главную страницу
  if (user && !loading) {
    return (
      <div className="home-dashboard">
        {!user.email_verified && (
          <div className="email-verification-banner">
            <p>Email не подтверждён. Проверьте почту или <Link to="/profile" className="banner-link">отправьте письмо повторно</Link> в личном кабинете.</p>
          </div>
        )}
        <div className="dashboard-welcome">
          <h1>Добро пожаловать, {user.name}!</h1>
          <p>Выберите раздел в меню слева для начала работы</p>
        </div>

        <div className="dashboard-cards">
          <div className="dashboard-card" onClick={() => navigate('/messages')}>
            <div className="card-icon">💬</div>
            <div className="card-content">
              <h3>Сообщения</h3>
              <p>Просмотр и отправка сообщений</p>
            </div>
          </div>

          <div className="dashboard-card" onClick={() => navigate('/calls')}>
            <div className="card-icon">📞</div>
            <div className="card-content">
              <h3>Звонки</h3>
              <p>История звонков и видеозвонки</p>
            </div>
          </div>

          <div className="dashboard-card" onClick={() => navigate('/companies')}>
            <div className="card-icon">🏢</div>
            <div className="card-content">
              <h3>Мои компании</h3>
              <p>Управление компаниями</p>
            </div>
          </div>

          <div className="dashboard-card" onClick={() => navigate('/profile')}>
            <div className="card-icon">👤</div>
            <div className="card-content">
              <h3>Личный кабинет</h3>
              <p>Настройки профиля</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Для неавторизованных показываем форму
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Aiternitas</h1>
            <div className="auth-tabs">
              <button
                className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setSuccess('');
                }}
              >
                Вход
              </button>
              <button
                className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                  setSuccess('');
                }}
              >
                Регистрация
              </button>
            </div>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Пароль</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Введите пароль"
                />
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <button type="submit" className="btn-primary" disabled={formLoading}>
                {formLoading ? 'Вход...' : 'Войти'}
              </button>
              <p style={{ marginTop: '12px', fontSize: '0.9em' }}>
                <Link to="/forgot-password" style={{ color: '#667eea', textDecoration: 'none' }}>
                  Забыли пароль?
                </Link>
              </p>
              <div className="auth-divider">
                <span>или</span>
              </div>
              
              <button 
                type="button" 
                className="btn-google" 
                onClick={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? 'Вход...' : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.48h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.185l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706s.102-1.166.282-1.706V4.962H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Войти через Google
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              <div className="form-group">
                <label htmlFor="name">Имя</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Введите ваше имя"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email-reg">Email</label>
                <input
                  type="email"
                  id="email-reg"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password-reg">Пароль</label>
                <input
                  type="password"
                  id="password-reg"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Минимум 8 символов"
                  minLength="8"
                />
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <button type="submit" className="btn-primary" disabled={formLoading}>
                {formLoading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
              
              <div className="auth-divider">
                <span>или</span>
              </div>
              
              <button 
                type="button" 
                className="btn-google" 
                onClick={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? 'Регистрация...' : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.48h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.185l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706s.102-1.166.282-1.706V4.962H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Войти через Google
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
