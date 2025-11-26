import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

function Sidebar({ user, loading, onLogout, isOpen, onClose }) {
  const { logout } = useAuth();

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <Link to="/" className="sidebar-logo" onClick={handleLinkClick}>
        Aiternitas
      </Link>

      {loading ? null : user ? (
        <div className="user-section">
          <div className="user-info">
            <img
              src={user.avatar || '/images/default-avatar.png'}
              alt="Аватар"
              className="user-avatar"
            />
            <div className="user-details">
              <div className="user-name">{user.name}</div>
              <Link to="/profile" className="profile-link" onClick={handleLinkClick}>
                Личный кабинет
              </Link>
            </div>
          </div>
        </div>
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

      <div className="projects-title">Проекты</div>
      <a
        href="https://conference.aiternitas.ru"
        className="project-item"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
      >
        <div className="project-name">🎙️ Конференции</div>
        <div className="project-description">Платформа видеоконференций с WebRTC</div>
      </a>
      <a
        href="https://balance.aiternitas.ru"
        className="project-item"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
      >
        <div className="project-name">💰 Balance Tracker</div>
        <div className="project-description">Отслеживание балансов на криптобиржах</div>
      </a>
      <div className="project-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
        <div className="project-name">🚀 Проект 3</div>
        <div className="project-description">Скоро будет доступен</div>
      </div>
    </aside>
  );
}

export default Sidebar;

