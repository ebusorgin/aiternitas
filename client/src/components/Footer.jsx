import './Footer.css';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3 className="footer-title">Проекты</h3>
          <div className="footer-projects">
            <a
              href="https://conference.aiternitas.ru"
              className="footer-project-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="footer-project-icon">🎙️</span>
              <div className="footer-project-info">
                <div className="footer-project-name">Конференции</div>
                <div className="footer-project-description">Платформа видеоконференций с WebRTC</div>
              </div>
            </a>
            <a
              href="https://balance.aiternitas.ru"
              className="footer-project-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="footer-project-icon">💰</span>
              <div className="footer-project-info">
                <div className="footer-project-name">Balance Tracker</div>
                <div className="footer-project-description">Отслеживание балансов на криптобиржах</div>
              </div>
            </a>
            <div className="footer-project-link disabled">
              <span className="footer-project-icon">🚀</span>
              <div className="footer-project-info">
                <div className="footer-project-name">Проект 3</div>
                <div className="footer-project-description">Скоро будет доступен</div>
              </div>
            </div>
          </div>
        </div>
        <div className="footer-section">
          <div className="footer-copyright">
            <p>© 2025 Aiternitas. Все права защищены.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

