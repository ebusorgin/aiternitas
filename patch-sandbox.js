const fs = require('fs');

// 1. Sidebar.jsx
let sidebar = fs.readFileSync('client/src/components/Sidebar.jsx', 'utf8');
if (!sidebar.includes('to="/sandbox"')) {
  const sandboxLink = `
            <Link 
              to="/sandbox" 
              className={\`sidebar-nav-item \${isActive('/sandbox') ? 'active' : ''}\`}
              onClick={handleLinkClick}
              style={{ background: 'rgba(234, 179, 8, 0.1)', borderLeft: '3px solid #eab308' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <span style={{ color: '#fef08a', fontWeight: 'bold' }}>ПЕСОЧНИЦА</span>
            </Link>
`;
  sidebar = sidebar.replace('<nav className="sidebar-nav">', '<nav className="sidebar-nav">' + sandboxLink);
  fs.writeFileSync('client/src/components/Sidebar.jsx', sidebar);
}

// 2. App.jsx
let app = fs.readFileSync('client/src/App.jsx', 'utf8');
if (!app.includes('import Sandbox')) {
  app = app.replace("import Charter from './pages/Charter';", "import Charter from './pages/Charter';\nimport Sandbox from './pages/Sandbox';");
  app = app.replace('<Route path="charter" element={<Charter />} />', '<Route path="charter" element={<Charter />} />\n          <Route path="sandbox" element={<ProtectedRoute><Sandbox /></ProtectedRoute>} />');
  fs.writeFileSync('client/src/App.jsx', app);
}

// 3. Sandbox.jsx
const sandboxJsx = `import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './Sandbox.css';

function Sandbox() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'agent', text: 'Привет! Я твой ИИ-помощник. Что бы ты хотел вывести на дашборд?' }
  ]);

  // Load from local storage
  useEffect(() => {
    if (user) {
      const savedLayout = localStorage.getItem(\`sandbox_layout_\${user.id || user.email}\`);
      if (savedLayout) {
        setWidgets(JSON.parse(savedLayout));
      }
      
      // Mock tasks
      setTasks([
        { id: 1, text: 'Требуется разрешение: Запустить сборщик данных с MOEX?', options: ['Разрешить', 'Отклонить'] }
      ]);
    }
  }, [user]);

  // Save to local storage
  useEffect(() => {
    if (user && widgets.length > 0) {
      localStorage.setItem(\`sandbox_layout_\${user.id || user.email}\`, JSON.stringify(widgets));
    } else if (user && widgets.length === 0) {
      localStorage.removeItem(\`sandbox_layout_\${user.id || user.email}\`);
    }
  }, [widgets, user]);

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMessages = [...chatMessages, { sender: 'user', text: chatInput }];
    setChatMessages(newMessages);

    // Mock AI logic
    setTimeout(() => {
      let response = 'Я не совсем понял. Попробуйте попросить вывести котировки или картинку.';
      let newWidget = null;

      const lower = chatInput.toLowerCase();
      if (lower.includes('котировк')) {
        response = 'Добавил виджет с котировками на ваш дашборд!';
        newWidget = { id: Date.now(), type: 'quotes', title: 'Котировки (MOEX)', content: 'BTC: $98,000\\nETH: $3,200\\nAAPL: $210' };
      } else if (lower.includes('фото') || lower.includes('картинк')) {
        response = 'Вывожу случайное фото!';
        newWidget = { id: Date.now(), type: 'image', title: 'Фото', url: 'https://picsum.photos/400/300?random=' + Math.random() };
      } else if (lower.includes('очист') || lower.includes('удал')) {
        response = 'Дашборд очищен!';
        setWidgets([]);
      }

      setChatMessages([...newMessages, { sender: 'agent', text: response }]);
      if (newWidget) {
        setWidgets(prev => [...prev, newWidget]);
      }
    }, 1000);

    setChatInput('');
  };

  const removeWidget = (id) => {
    setWidgets(widgets.filter(w => w.id !== id));
  };

  const handleTaskResponse = (taskId, response) => {
    setTasks(tasks.filter(t => t.id !== taskId));
    setChatMessages(prev => [...prev, { sender: 'agent', text: \`Задача \${taskId} обработана: \${response}\` }]);
  };

  return (
    <div className="sandbox-page">
      <div className="sandbox-header">
        <h1>Песочница (Sandbox)</h1>
        <p>Ваше персональное пространство. ИИ-агент подстраивает этот экран под ваши нужды.</p>
      </div>

      <div className="sandbox-layout">
        <div className="sandbox-main">
          {/* Dashboard Area */}
          <div className="sandbox-dashboard">
            {widgets.length === 0 ? (
              <div className="empty-dashboard">
                <p>Дашборд пуст. Попросите ИИ вывести что-нибудь (например: "покажи котировки" или "покажи фото").</p>
              </div>
            ) : (
              <div className="widgets-grid">
                {widgets.map(w => (
                  <div key={w.id} className="widget-card">
                    <div className="widget-header">
                      <h3>{w.title}</h3>
                      <button onClick={() => removeWidget(w.id)}>×</button>
                    </div>
                    <div className="widget-content">
                      {w.type === 'quotes' && <pre>{w.content}</pre>}
                      {w.type === 'image' && <img src={w.url} alt="widget" />}
                      {w.type === 'text' && <p>{w.content}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Chat Area */}
          <div className="sandbox-chat">
            <div className="chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={\`chat-message \${msg.sender}\`}>
                  <div className="chat-bubble">{msg.text}</div>
                </div>
              ))}
            </div>
            <form className="chat-input-area" onSubmit={handleChatSubmit}>
              <input 
                type="text" 
                placeholder="Попросите ИИ вывести данные..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit">Отправить</button>
            </form>
          </div>
        </div>

        <div className="sandbox-sidebar">
          {/* Tasks Area */}
          <div className="owner-tasks">
            <h3>Задачи для Владельца</h3>
            {tasks.length === 0 ? (
              <p className="no-tasks">Очередь задач пуста.</p>
            ) : (
              tasks.map(t => (
                <div key={t.id} className="task-card">
                  <p>{t.text}</p>
                  <div className="task-actions">
                    {t.options.map(opt => (
                      <button key={opt} onClick={() => handleTaskResponse(t.id, opt)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sandbox;
`;

const sandboxCss = `.sandbox-page {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
}

.sandbox-header h1 {
  color: #eab308;
  margin-bottom: 5px;
}

.sandbox-header p {
  color: #94a3b8;
  margin-bottom: 20px;
}

.sandbox-layout {
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.sandbox-main {
  flex: 3;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sandbox-sidebar {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Dashboard */
.sandbox-dashboard {
  flex: 1;
  background: rgba(30, 41, 59, 0.5);
  border: 1px dashed #475569;
  border-radius: 12px;
  padding: 20px;
  overflow-y: auto;
}

.empty-dashboard {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  text-align: center;
}

.widgets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
}

.widget-card {
  background: #1e293b;
  border-radius: 8px;
  border: 1px solid #334155;
  overflow: hidden;
}

.widget-header {
  padding: 10px 15px;
  background: #0f172a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #334155;
}

.widget-header h3 {
  font-size: 14px;
  margin: 0;
  color: #cbd5e1;
}

.widget-header button {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.widget-content {
  padding: 15px;
}

.widget-content pre {
  margin: 0;
  font-family: monospace;
  color: #10b981;
}

.widget-content img {
  width: 100%;
  height: auto;
  border-radius: 4px;
  object-fit: cover;
}

/* Chat */
.sandbox-chat {
  height: 300px;
  background: #111827;
  border-radius: 12px;
  border: 1px solid #1f2937;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-message {
  display: flex;
}

.chat-message.agent {
  justify-content: flex-start;
}

.chat-message.user {
  justify-content: flex-end;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 15px;
  border-radius: 12px;
  font-size: 14px;
}

.chat-message.agent .chat-bubble {
  background: #1e293b;
  color: #f8fafc;
  border-bottom-left-radius: 2px;
}

.chat-message.user .chat-bubble {
  background: #3b82f6;
  color: #fff;
  border-bottom-right-radius: 2px;
}

.chat-input-area {
  display: flex;
  padding: 10px;
  background: #1f2937;
  gap: 10px;
}

.chat-input-area input {
  flex: 1;
  padding: 10px 15px;
  background: #374151;
  border: 1px solid #4b5563;
  color: white;
  border-radius: 6px;
  outline: none;
}

.chat-input-area button {
  padding: 0 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.chat-input-area button:hover {
  background: #2563eb;
}

/* Tasks */
.owner-tasks {
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 12px;
  padding: 20px;
  height: 100%;
}

.owner-tasks h3 {
  color: #ef4444;
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 16px;
  text-transform: uppercase;
}

.no-tasks {
  color: #fca5a5;
  font-size: 14px;
}

.task-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}

.task-card p {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 14px;
}

.task-actions {
  display: flex;
  gap: 10px;
}

.task-actions button {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.task-actions button:first-child {
  background: #10b981;
  color: white;
}

.task-actions button:last-child {
  background: #ef4444;
  color: white;
}
`;

fs.writeFileSync('client/src/pages/Sandbox.jsx', sandboxJsx);
fs.writeFileSync('client/src/pages/Sandbox.css', sandboxCss);
