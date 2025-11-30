import { useAuth } from '../context/AuthContext';
import './PageStyles.css';

function Companies() {
  const { user } = useAuth();

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Мои компании</h1>
        <p className="page-subtitle">Управление вашими компаниями</p>
      </div>

      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <h2>Нет компаний</h2>
          <p>У вас пока нет зарегистрированных компаний.</p>
          <button className="primary-btn">
            <span>➕</span>
            Добавить компанию
          </button>
        </div>
      </div>
    </div>
  );
}

export default Companies;

