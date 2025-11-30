import { useAuth } from '../context/AuthContext';
import './PageStyles.css';

function Calls() {
  const { user } = useAuth();

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Звонки</h1>
        <p className="page-subtitle">История ваших звонков</p>
      </div>

      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">📞</div>
          <h2>Нет звонков</h2>
          <p>У вас пока нет истории звонков.</p>
        </div>
      </div>
    </div>
  );
}

export default Calls;

