const fs = require('fs');

// 1. Fix backend index.mjs
let indexMjs = fs.readFileSync('server/socket/index.mjs', 'utf8');
if (!indexMjs.includes("import { setupSandboxHandlers } from './sandbox.mjs';")) {
  indexMjs = indexMjs.replace(
    "import { setupTaskHandlers } from './tasks.mjs';",
    "import { setupTaskHandlers } from './tasks.mjs';\nimport { setupSandboxHandlers } from './sandbox.mjs';"
  );
}
if (!indexMjs.includes("setupSandboxHandlers(io, socket);")) {
  indexMjs = indexMjs.replace(
    "setupTaskHandlers(io, socket);",
    "setupTaskHandlers(io, socket);\n    setupSandboxHandlers(io, socket);"
  );
}
fs.writeFileSync('server/socket/index.mjs', indexMjs);

// 2. Fix sandbox.mjs
const sandboxHandlerCode = `
import { callLocalLLM } from '../services/llm_provider.mjs';

const SYSTEM_PROMPT = \`
Ты ИИ-ассистент в системе Aiternitas. Ты общаешься с Владельцем.
Твоя задача — помогать Владельцу и при необходимости выводить виджеты на его дашборд.
ОТВЕЧАЙ СТРОГО В ФОРМАТЕ JSON! Никакого лишнего текста, только валидный JSON.

Структура ответа:
{
  "text": "Твой ответ пользователю (строка)",
  "widget": {
    "type": "quotes" | "image" | "text",
    "title": "Заголовок виджета",
    "content": "Текст или данные (для quotes/text)",
    "url": "Ссылка на картинку (для image)"
  }
}
\`;

export function setupSandboxHandlers(io, socket) {
  socket.on('sandbox:chat:message', async (data) => {
    try {
      const prompt = data.text;
      const response = await callLocalLLM(prompt, SYSTEM_PROMPT, 'llama3', true);
      
      let parsed;
      if (typeof response === 'string') {
        try {
          parsed = JSON.parse(response);
        } catch (e) {
          parsed = { text: response };
        }
      } else {
        parsed = response;
      }

      socket.emit('sandbox:chat:response', parsed);

    } catch (error) {
      console.error('Ошибка Sandbox Chat:', error);
      socket.emit('sandbox:chat:response', {
        text: \`Произошла ошибка при обращении к локальной нейросети (\${error.message}). Пожалуйста, убедитесь, что Ollama запущена на порту 11434.\`
      });
    }
  });
}
`;
fs.writeFileSync('server/socket/sandbox.mjs', sandboxHandlerCode);

// 3. Rewrite Sandbox.jsx with loader
const sandboxJsx = `import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import './Sandbox.css';

function Sandbox() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const [chatMessages, setChatMessages] = useState([
    { sender: 'agent', text: 'Привет! Я локальный ИИ-ассистент. Могу вывести данные на дашборд. Запущена ли Ollama?' }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isTyping]);

  useEffect(() => {
    const unsub = socketService.on('sandbox:chat:response', (data) => {
      setIsTyping(false);
      setChatMessages(prev => [...prev, { sender: 'agent', text: data.text }]);
      
      if (data.widget) {
        const newWidget = {
          id: Date.now(),
          ...data.widget
        };
        if (newWidget.type === 'image' && newWidget.url && newWidget.url.includes('picsum.photos') && !newWidget.url.includes('random')) {
           newWidget.url = newWidget.url + '?random=' + Math.random();
        }
        setWidgets(prev => [...prev, newWidget]);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (user) {
      const savedLayout = localStorage.getItem(\`sandbox_layout_\${user.id || user.email}\`);
      if (savedLayout) {
        setWidgets(JSON.parse(savedLayout));
      }
      setTasks([
        { id: 1, text: 'Требуется разрешение: Запустить сборщик данных с MOEX?', options: ['Разрешить', 'Отклонить'] }
      ]);
    }
  }, [user]);

  useEffect(() => {
    if (user && widgets.length > 0) {
      localStorage.setItem(\`sandbox_layout_\${user.id || user.email}\`, JSON.stringify(widgets));
    } else if (user && widgets.length === 0) {
      localStorage.removeItem(\`sandbox_layout_\${user.id || user.email}\`);
    }
  }, [widgets, user]);

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isTyping) return;

    const newMessages = [...chatMessages, { sender: 'user', text: chatInput }];
    setChatMessages(newMessages);

    if (socketService.isConnected) {
      setIsTyping(true);
      socketService.emit('sandbox:chat:message', { text: chatInput });
    } else {
      setChatMessages(prev => [...prev, { sender: 'agent', text: 'Ошибка: нет подключения к серверу.' }]);
    }

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
                      <h3>{w.title || 'Виджет'}</h3>
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

          <div className="sandbox-chat">
            <div className="chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={\`chat-message \${msg.sender}\`}>
                  <div className="chat-bubble">{msg.text}</div>
                </div>
              ))}
              {isTyping && (
                <div className="chat-message agent">
                  <div className="chat-bubble typing-indicator">
                    Агент печатает...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-input-area" onSubmit={handleChatSubmit}>
              <input 
                type="text" 
                placeholder="Общение с локальной нейросетью Ollama..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isTyping}
              />
              <button type="submit" disabled={isTyping}>Отправить</button>
            </form>
          </div>
        </div>

        <div className="sandbox-sidebar">
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
fs.writeFileSync('client/src/pages/Sandbox.jsx', sandboxJsx);

let sandboxCss = fs.readFileSync('client/src/pages/Sandbox.css', 'utf8');
if (!sandboxCss.includes('.typing-indicator')) {
  sandboxCss += `\n.typing-indicator {\n  font-style: italic;\n  opacity: 0.7;\n  display: inline-block;\n  animation: pulse 1.5s infinite;\n}\n@keyframes pulse {\n  0% { opacity: 0.4; }\n  50% { opacity: 1; }\n  100% { opacity: 0.4; }\n}\n`;
  fs.writeFileSync('client/src/pages/Sandbox.css', sandboxCss);
}
