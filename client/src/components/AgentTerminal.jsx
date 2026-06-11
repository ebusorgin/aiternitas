import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './AgentTerminal.css';

function AgentTerminal() {
  const [logs, setLogs] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const terminalRef = useRef(null);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
      withCredentials: true
    });

    socket.on('agent:log', (data) => {
      setLogs((prev) => [...prev, data].slice(-100)); // Храним последние 100 логов
      setIsOpen(true); // Автоматически открываем при активности
    });

    return () => {
      socket.off('agent:log');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (logs.length === 0) return null;

  return (
    <div className={`agent-terminal ${isOpen ? 'open' : 'closed'}`}>
      <div className="agent-terminal__header" onClick={() => setIsOpen(!isOpen)}>
        <span>🤖 Терминал ИИ-Агентов ({logs.length})</span>
        <button className="agent-terminal__toggle">
          {isOpen ? '—' : '▲'}
        </button>
      </div>

      {isOpen && (
        <div className="agent-terminal__content" ref={terminalRef}>
          {logs.map((log, idx) => (
            <div key={idx} className={`agent-log agent-log--${log.type}`}>
              <span className="agent-log__time">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="agent-log__name">[{log.name}]</span>
              <span className="agent-log__message">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentTerminal;
