import './ViewToggle.css';

function ViewToggle({ currentView, onToggle }) {
  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-btn ${currentView === '2d' ? 'active' : ''}`}
        onClick={() => onToggle('2d')}
      >
        <span className="view-icon">📊</span>
        <span className="view-label">2D</span>
      </button>
      <button
        className={`view-toggle-btn ${currentView === '3d' ? 'active' : ''}`}
        onClick={() => onToggle('3d')}
      >
        <span className="view-icon">🌐</span>
        <span className="view-label">3D</span>
      </button>
    </div>
  );
}

export default ViewToggle;



