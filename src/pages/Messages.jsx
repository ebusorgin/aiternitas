import { useAuth } from '../context/AuthContext';
import './PageStyles.css';

function Messages() {
  const { user } = useAuth();

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Сообщения</h1>
        <p className="page-subtitle">Ваши сообщения и переписки</p>
      </div>

      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h2>Нет сообщений</h2>
          <p>У вас пока нет сообщений. Начните общение!</p>
        </div>
      </div>
    </div>
  );
}

export default Messages;

