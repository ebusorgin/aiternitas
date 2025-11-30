import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSceneStore } from '../store/sceneStore';
import { useScenesNavigation } from '../context/ScenesNavigationContext';
import Canvas2D from '../components/workspace/Canvas2D';
import Canvas3D from '../components/workspace/Canvas3D';
import Toolbar from '../components/workspace/Toolbar';
import PropertiesPanel from '../components/workspace/PropertiesPanel';
import ScenesView from '../components/workspace/ScenesView';
import ElementTypeModal from '../components/workspace/ElementTypeModal';
import CreateSceneModal from '../components/workspace/CreateSceneModal';
import CreateWorkerModal from '../components/workspace/CreateWorkerModal';
import CreateBlockModal from '../components/workspace/CreateBlockModal';
import './Home.css';
import './Auth.css';

function Home() {
  const { user, loading, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const { showScenesList, hideScenes } = useScenesNavigation();
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isElementTypeModalOpen, setIsElementTypeModalOpen] = useState(false);
  const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

  const initSocket = useSceneStore((state) => state.initSocket);
  const disconnectSocket = useSceneStore((state) => state.disconnectSocket);
  const createElement = useSceneStore((state) => state.createElement);
  const createScene = useSceneStore((state) => state.createScene);
  const getCanvasCenter = useSceneStore((state) => state.getCanvasCenter);
  const loadScene = useSceneStore((state) => state.loadScene);

  useEffect(() => {
    if (user) {
      loadStats();
      // Инициализируем Socket.IO для авторизованных пользователей
      initSocket();
    }
    
    // Проверяем параметры URL для уведомлений
    const urlParams = new URLSearchParams(window.location.search);
    const emailVerified = urlParams.get('email_verified');
    const error = urlParams.get('error');
    
    if (emailVerified === 'true') {
      setSuccess('Email успешно подтвержден!');
      // Очищаем URL параметр
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'invalid_token') {
      setError('Неверная ссылка подтверждения');
    } else if (error === 'token_expired') {
      setError('Ссылка подтверждения истекла. Пожалуйста, запросите новую.');
    } else if (error === 'verification_failed') {
      setError('Ошибка подтверждения email. Попробуйте позже.');
    }

    // Очистка при размонтировании
    return () => {
      if (user) {
        disconnectSocket();
      }
    };
  }, [user, initSocket, disconnectSocket]);

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
      // Остаемся на главной странице после входа
      window.location.reload();
    } else {
      // Проверяем, требуется ли верификация email
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

    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      setFormLoading(false);
      return;
    }

    const result = await register(name, email, password);

    if (result.success) {
      if (result.emailVerificationRequired) {
        setSuccess('Регистрация успешна! Пожалуйста, проверьте вашу почту и подтвердите email. Ссылка также доступна в консоли браузера.');
        if (result.verificationUrl) {
          console.log('Email verification URL:', result.verificationUrl);
        }
        // Перезагружаем страницу чтобы показать предупреждение о верификации
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setSuccess('Регистрация успешна!');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
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
        // Редирект произойдет через Google OAuth callback
        // Не нужно делать navigate здесь
      } else {
        setError(result.error || 'Ошибка входа через Google');
        setGoogleLoading(false);
      }
    } catch (error) {
      setError('Ошибка подключения к серверу');
      setGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setError('');
    setFormLoading(true);
    
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess('Письмо для подтверждения email отправлено. Проверьте вашу почту.');
        if (data.verificationUrl) {
          console.log('Verification URL:', data.verificationUrl);
        }
      } else {
        setError(data.error || 'Ошибка отправки письма');
      }
    } catch (error) {
      setError('Ошибка подключения к серверу');
    } finally {
      setFormLoading(false);
    }
  };

  const viewMode = useSceneStore((state) => state.viewMode);
  const currentSceneId = useSceneStore((state) => state.currentSceneId);

  // Если пользователь авторизован
  if (user && !loading) {
    // Если явно запрошен список сцен (через меню), показываем ScenesView
    if (showScenesList) {
      return (
        <ScenesView 
          onSceneSelect={(sceneId) => {
            hideScenes();
          }}
        />
      );
    }

    // По умолчанию показываем workspace (2D или 3D) только если есть активная сцена
    if (currentSceneId) {
      return (
        <div className="workspace-container">
          <Toolbar />
          <PropertiesPanel />
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {viewMode === '2d' ? <Canvas2D /> : <Canvas3D />}
          </div>
          
          {/* Предупреждение о неподтвержденном email */}
          {!user.email_verified && !user.google_id && (
            <div className="email-verification-banner">
              <p>⚠️ Ваш email не подтвержден. Пожалуйста, проверьте почту и подтвердите email.</p>
              <button 
                onClick={handleResendVerification}
                className="btn-resend-verification"
                disabled={formLoading}
              >
                Отправить письмо повторно
              </button>
            </div>
          )}
        </div>
      );
    }
    
    // Если нет активной сцены, показываем главную страницу с кнопками создания
    return (
      <div className="home-main-page">
        <div className="home-welcome">
          <h1>Добро пожаловать в Aiternitas</h1>
          <p>Создайте свой первый элемент (сцену, воркера или блок), чтобы начать работу</p>
        </div>
        
        <div className="home-actions">
          <button
            className="home-action-btn create-element-btn"
            onClick={() => setIsElementTypeModalOpen(true)}
          >
            <div className="btn-icon">➕</div>
            <div className="btn-content">
              <div className="btn-title">Создать элемент</div>
              <div className="btn-description">Создайте новый элемент: сцену, воркера или блок</div>
            </div>
          </button>
        </div>

        <CreateSceneModal
          isOpen={isSceneModalOpen}
          onClose={() => setIsSceneModalOpen(false)}
          onCreate={async (sceneData) => {
            try {
              // Для главной страницы создаем сцену в центре (0, 0)
              // Позиция будет установлена при первом отображении в ScenesView
              const sceneDataWithPosition = {
                ...sceneData,
                parent_id: null,
                position_2d: [0, 0] // Центр по умолчанию
              };
              
              const newScene = await createScene(sceneDataWithPosition);
              setIsSceneModalOpen(false);
              
              // После создания сцены загружаем её
              if (newScene && newScene.id) {
                loadScene(newScene.id);
              }
              
              return newScene;
            } catch (error) {
              console.error('Ошибка создания сцены:', error);
              throw error;
            }
          }}
        />

        <ElementTypeModal
          isOpen={isElementTypeModalOpen}
          onClose={() => setIsElementTypeModalOpen(false)}
          onSelectType={(elementType) => {
            setIsElementTypeModalOpen(false);
            switch (elementType) {
              case 'scene':
                setIsSceneModalOpen(true);
                break;
              case 'worker':
                setIsWorkerModalOpen(true);
                break;
              case 'block':
                setIsBlockModalOpen(true);
                break;
              default:
                console.error('Unknown element type:', elementType);
            }
          }}
        />

        <CreateWorkerModal
          isOpen={isWorkerModalOpen}
          onClose={() => setIsWorkerModalOpen(false)}
          onCreate={async (workerData) => {
            try {
              createElement({
                position: null,
                size: [1, 1, 1],
                name: workerData.name,
                description: workerData.description || '',
                color: workerData.color || '#3b82f6',
                emissive: workerData.emissive || '#000000',
                type: workerData.type || 'worker',
                elementType: 'worker'
              });
              setIsWorkerModalOpen(false);
            } catch (error) {
              console.error('Ошибка создания воркера:', error);
              throw error;
            }
          }}
        />

        <CreateBlockModal
          isOpen={isBlockModalOpen}
          onClose={() => setIsBlockModalOpen(false)}
          onCreate={async (blockData) => {
            try {
              createElement({
                position: null,
                size: [1, 1, 1],
                name: blockData.name,
                description: blockData.description || '',
                color: blockData.color || '#3b82f6',
                type: 'block',
                elementType: 'block'
              });
              setIsBlockModalOpen(false);
            } catch (error) {
              console.error('Ошибка создания блока:', error);
              throw error;
            }
          }}
        />
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

