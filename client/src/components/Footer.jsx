import { Link } from 'react-router-dom';
import './Footer.css';

function Footer() {
  return (
    <footer className="footer-compact">
      <div className="footer-compact-content">
        <div className="footer-copyright">
          © 2025 Aiternitas
        </div>
        <Link to="/charter" className="footer-charter-link">
          📜 Устав Agent OS
        </Link>
      </div>
    </footer>
  );
}

export default Footer;
