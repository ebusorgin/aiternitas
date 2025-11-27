import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './Home.css';

function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

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

export default Home;

