import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMail } from '../context/MailContext';
import './Sidebar.css';

function Sidebar({ user, loading, onLogout, isOpen, onClose }) {
  const { logout } = useAuth();
  const { unreadCount } = useMail();
  const location = useLocation();

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      await logout();
    }
    handleLinkClick();
  };

  const isActive = (path) => location.pathname === path;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <Link to="/" className="sidebar-logo" onClick={handleLinkClick}>
        Aiternitas
      </Link>

      {loading ? null : user ? (
        <>
          <div className="user-section">
            <div className="user-info">
              <img
                src={user.avatar || '/images/default-avatar.png'}
                alt="Аватар"
                className="user-avatar"
              />
              <div className="user-details">
                <div className="user-name">{user.name}</div>
                <div className="user-email">{user.email}</div>
              </div>
            </div>
          </div>
          
          <nav className="sidebar-nav">
            <Link 
              to="/sandbox" 
              className={`sidebar-nav-item ${isActive('/sandbox') ? 'active' : ''}`}
              onClick={handleLinkClick}
              style={{ background: 'rgba(234, 179, 8, 0.1)', borderLeft: '3px solid #eab308' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <span style={{ color: '#fef08a', fontWeight: 'bold' }}>ПЕСОЧНИЦА</span>
            </Link>

            <Link 
              to="/profile" 
              className={`sidebar-nav-item ${isActive('/profile') ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>Личный кабинет</span>
            </Link>

            <Link 
              to="/messages" 
              className={`sidebar-nav-item ${isActive('/messages') ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Сообщения</span>
            </Link>

            <Link 
              to="/calls" 
              className={`sidebar-nav-item ${isActive('/calls') ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <span>Звонки</span>
            </Link>

            <Link 
              to="/companies" 
              className={`sidebar-nav-item ${isActive('/companies') ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>Мои компании</span>
            </Link>

            <Link 
              to="/tasks" 
              className={`sidebar-nav-item ${isActive('/tasks') ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              <span>Задачи</span>
            </Link>

            <Link 
              to="/mail" 
              className={`sidebar-nav-item ${isActive('/mail') || location.pathname.startsWith('/mail') ? 'active' : ''}`}
              onClick={handleLinkClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <span>Почта</span>
              {unreadCount > 0 && (
                <span className="sidebar-nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </Link>

            <button 
              className="sidebar-nav-item logout-item"
              onClick={handleLogout}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Выход</span>
            </button>
          </nav>
        </>
      ) : (
        <div className="auth-buttons">
          <Link to="/login" className="auth-btn login-btn" onClick={handleLinkClick}>
            Войти
          </Link>
          <Link to="/register" className="auth-btn register-btn" onClick={handleLinkClick}>
            Регистрация
          </Link>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
