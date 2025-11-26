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

      <section className="section">
        <h2>О платформе</h2>
        <p>
          Aiternitas — это современная платформа, объединяющая инновационные проекты
          и технологические решения. Мы создаем инструменты будущего, которые помогают
          людям общаться, работать и творить вместе.
        </p>
        <p>
          Наша миссия — сделать передовые технологии доступными каждому, предоставляя
          надежные и удобные решения для различных задач.
        </p>
      </section>

      <section className="section">
        <h2>Наши проекты</h2>
        <div className="features-grid">
          <a href="https://conference.aiternitas.ru" target="_blank" rel="noopener noreferrer" className="feature-card-link">
            <div className="feature-card">
              <div className="feature-icon">🎙️</div>
              <h3>Видеоконференции</h3>
              <p>
                Современная платформа для проведения видеоконференций с поддержкой
                WebRTC, комнат и множества участников. Высокое качество связи и
                удобный интерфейс.
              </p>
              <div className="feature-link">Перейти →</div>
            </div>
          </a>
          <a href="https://balance.aiternitas.ru" target="_blank" rel="noopener noreferrer" className="feature-card-link">
            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3>Balance Tracker</h3>
              <p>
                Отслеживание балансов на криптовалютных биржах. Поддержка Binance,
                Coinbase Pro, Kraken, Bybit и других. Единый интерфейс для управления
                активами.
              </p>
              <div className="feature-link">Перейти →</div>
            </div>
          </a>
          <div className="feature-card">
            <div className="feature-icon">🚀</div>
            <h3>Скоро</h3>
            <p>
              Новые проекты находятся в разработке. Мы постоянно работаем над
              созданием полезных инструментов и сервисов.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Технологии</h2>
        <p>
          Мы используем современный стек технологий: Node.js, Express, Socket.IO,
          WebRTC, и многие другие. Это позволяет нам создавать быстрые, масштабируемые
          и надежные решения.
        </p>
      </section>

      <section className="section">
        <h2>Контакты</h2>
        <p>
          По вопросам сотрудничества и предложений обращайтесь через официальные каналы связи.
        </p>
        {stats && stats.totalUsers > 0 && (
          <div className="user-stats">
            <p style={{ color: '#667eea', fontWeight: 600, marginTop: '20px', fontSize: '1.1em' }}>
              Присоединяйтесь к нашему сообществу! Уже <span style={{ color: '#fff' }}>{stats.totalUsers}</span> пользователей на платформе.
            </p>
          </div>
        )}
      </section>

    </>
  );
}

export default Home;

