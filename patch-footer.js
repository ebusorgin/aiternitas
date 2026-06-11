const fs = require('fs');

const code = `import { Link } from 'react-router-dom';
import './Footer.css';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '20px' }}>
        <div className="footer-copyright">
          <p>© 2025 Aiternitas. Все права защищены.</p>
        </div>
        <Link to="/charter" style={{ textDecoration: 'none', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📜</span> Устав Agent OS
        </Link>
      </div>
    </footer>
  );
}

export default Footer;
`;

fs.writeFileSync('client/src/components/Footer.jsx', code);
