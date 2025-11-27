import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';
import './Auth.css';

function Home() {
  const { user, loading, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

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
      navigate('/profile');
    } else {
      setError(result.error);
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

    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      setFormLoading(false);
      return;
    }

    const result = await register(name, email, password);

    if (result.success) {
      setSuccess('Регистрация успешна! Перенаправление...');
      setTimeout(() => {
        navigate('/profile');
      }, 1500);
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
      if (result.success) {
        navigate('/profile');
      } else {
        setError(result.error || 'Ошибка входа через Google');
        setGoogleLoading(false);
      }
    } catch (error) {
      setError('Ошибка подключения к серверу');
      setGoogleLoading(false);
    }
  };

  // Если пользователь авторизован, показываем обычный контент
  if (user && !loading) {
    return (
      <>
        <section className="hero">
          <div className="hero-content">
            <div className="dev-badge">🚧 Сайт находится в разработке</div>
            <h1>Aiternitas</h1>
            <p>Платформа инновационных проектов и технологических решений</p>
            {stats && (
              <div className="stats-section">
                <div className="stat-item">
                  <div className="stat-value">{stats.totalUsers || 0}</div>
                  <div className="stat-label">Пользователей</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">2</div>
                  <div className="stat-label">Проектов</div>
                </div>
              </div>
            )}
          </div>
        </section>
      </>
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

              <button type="submit" className="btn-primary" disabled={formLoading}>
                {formLoading ? 'Вход...' : 'Войти'}
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
                  placeholder="Минимум 6 символов"
                  minLength="6"
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

