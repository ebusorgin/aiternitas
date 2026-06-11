import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './SystemDashboard.css';

function SystemDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Подключаемся к основному сокету
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
      withCredentials: true
    });

    socket.on('system:metrics', (data) => {
      setMetrics(data);
    });

    return () => {
      socket.off('system:metrics');
      socket.disconnect();
    };
  }, []);

  if (!metrics) return null;

  return (
    <div className={`system-dashboard ${isOpen ? 'open' : 'closed'}`}>
      <button className="system-dashboard__toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? '🔽 Скрыть монитор' : '📊 Системный монитор'}
      </button>

      {isOpen && (
        <div className="system-dashboard__content">
          <div className="metric-group">
            <h4 className="metric-title">CPU ({metrics.os?.platform})</h4>
            <div className="metric-bar-container">
              <div 
                className="metric-bar" 
                style={{ width: `${metrics.cpu?.usage || 0}%`, backgroundColor: getMetricColor(metrics.cpu?.usage) }} 
              />
            </div>
            <span className="metric-value">{metrics.cpu?.usage}%</span>
            
            <div className="cpu-cores">
              {metrics.cpu?.cores?.map((core, i) => (
                <div key={i} className="cpu-core-bar" style={{ height: `${core}%`, backgroundColor: getMetricColor(core) }} title={`Core ${i}: ${core}%`} />
              ))}
            </div>
          </div>

          <div className="metric-group">
            <h4 className="metric-title">Оперативная память</h4>
            <div className="metric-bar-container">
              <div 
                className="metric-bar" 
                style={{ width: `${metrics.memory?.percent || 0}%`, backgroundColor: getMetricColor(metrics.memory?.percent) }} 
              />
            </div>
            <span className="metric-value">
              {metrics.memory?.used} / {metrics.memory?.total} ГБ ({metrics.memory?.percent}%)
            </span>
          </div>

          {metrics.disk && (
            <div className="metric-group">
              <h4 className="metric-title">Диск (Основной)</h4>
              <div className="metric-bar-container">
                <div 
                  className="metric-bar" 
                  style={{ width: `${metrics.disk.percent || 0}%`, backgroundColor: getMetricColor(metrics.disk.percent) }} 
                />
              </div>
              <span className="metric-value">
                {metrics.disk.used} / {metrics.disk.total} ГБ ({metrics.disk.percent}%)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getMetricColor(percent) {
  if (percent > 85) return '#ef4444'; // Red
  if (percent > 65) return '#f59e0b'; // Yellow
  return '#10b981'; // Green
}

export default SystemDashboard;
