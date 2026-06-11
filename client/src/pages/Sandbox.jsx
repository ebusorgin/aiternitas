import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import './Sandbox.css';

function Sandbox() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [chatInput, setChatInput] = useState('узнай погоду на ближайшие 7 дней');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('llama3:latest');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isTyping]);

  // Socket listeners — use socketService.on() which registers to the raw socket
  useEffect(() => {
    const handlers = [
      socketService.on('sandbox:conversations:list', (list) => {
        setConversations(list || []);
      }),
      socketService.on('sandbox:conversation:created', (conv) => {
        setConversations(prev => [conv, ...prev]);
        setActiveConvId(conv.id);
        setChatMessages([]);
        setWidgets([]);
        setSelectedModel(conv.model || 'llama3:latest');
      }),
      socketService.on('sandbox:conversation:loaded', (data) => {
        if (!data || !data.conversation) return;
        setActiveConvId(data.conversation.id);
        setSelectedModel(data.conversation.model || 'llama3:latest');
        const msgs = (data.messages || []).map(m => ({
          sender: m.sender,
          text: m.text,
          widget: m.widget
        }));
        setChatMessages(msgs);
        const recoveredWidgets = msgs
          .filter(m => m.widget)
          .map((m, idx) => ({ id: `saved_${idx}`, ...(typeof m.widget === 'string' ? JSON.parse(m.widget) : m.widget) }));
        setWidgets(recoveredWidgets);
      }),
      socketService.on('sandbox:conversation:deleted', (payload) => {
        const convId = payload && payload.conversationId;
        setConversations(prev => prev.filter(c => c.id !== convId));
        if (activeConvId === convId) {
          setActiveConvId(null);
          setChatMessages([]);
          setWidgets([]);
        }
      }),
      socketService.on('sandbox:chat:response', (data) => {
        setIsTyping(false);
        setChatMessages(prev => [...prev, { sender: 'agent', text: data.text }]);
        if (data.widget) {
          const newWidget = { id: Date.now(), ...data.widget };
          setWidgets(prev => [...prev, newWidget]);
        }
        // Refresh list to update title + timestamp
        socketService.send('sandbox:conversations:list');
      }),
      socketService.on('sandbox:models:list', (models) => {
        if (models && models.length > 0) {
          setAvailableModels(models);
          setSelectedModel(prev => models.includes(prev) ? prev : models[0]);
        }
      }),
    ];

    // Initial load — wait a bit for socket to be fully connected
    const timer = setTimeout(() => {
      socketService.send('sandbox:conversations:list');
      socketService.send('sandbox:models:list');
    }, 800);

    return () => {
      handlers.forEach(unsub => typeof unsub === 'function' && unsub());
      clearTimeout(timer);
    };
  }, []);

  // Owner tasks
  useEffect(() => {
    if (user) {
      setTasks([
        { id: 1, text: 'Требуется разрешение: Запустить сборщик данных с MOEX?', options: ['Разрешить', 'Отклонить'] }
      ]);
    }
  }, [user]);

  // Handle activeConvId change — send pending message
  const prevActiveConvId = useRef(null);
  useEffect(() => {
    if (activeConvId && activeConvId !== prevActiveConvId.current) {
      prevActiveConvId.current = activeConvId;
      const pending = sessionStorage.getItem('sandbox_pending_msg');
      if (pending) {
        sessionStorage.removeItem('sandbox_pending_msg');
        setChatMessages(prev => [...prev, { sender: 'user', text: pending }]);
        setIsTyping(true);
        socketService.send('sandbox:chat:message', {
          text: pending,
          conversationId: activeConvId,
          model: selectedModel
        });
      }
    }
  }, [activeConvId, selectedModel]);

  const createNewConversation = () => {
    socketService.send('sandbox:conversation:create', { model: selectedModel });
  };

  const loadConversation = (convId) => {
    if (convId === activeConvId) return;
    setWidgets([]);
    setChatMessages([]);
    socketService.send('sandbox:conversation:load', { conversationId: convId });
  };

  const deleteConversation = (e, convId) => {
    e.stopPropagation();
    if (!window.confirm('Удалить этот диалог?')) return;
    socketService.send('sandbox:conversation:delete', { conversationId: convId });
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isTyping) return;

    const text = chatInput;
    setChatInput('');

    if (!activeConvId) {
      sessionStorage.setItem('sandbox_pending_msg', text);
      socketService.send('sandbox:conversation:create', { model: selectedModel });
      return;
    }

    setChatMessages(prev => [...prev, { sender: 'user', text }]);
    setIsTyping(true);
    socketService.send('sandbox:chat:message', {
      text,
      conversationId: activeConvId,
      model: selectedModel
    });
  };

  const removeWidget = (id) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const handleTaskResponse = (taskId, response) => {
    setTasks(tasks.filter(t => t.id !== taskId));
    setChatMessages(prev => [...prev, { sender: 'agent', text: `Задача ${taskId} обработана: ${response}` }]);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (now - d < 86400000) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="sandbox-page">
      <div className="sandbox-header">
        <h1>🧪 Песочница</h1>
        <p>Персональное пространство Владельца. ИИ формирует этот экран под ваши нужды.</p>
      </div>

      <div className="sandbox-layout">
        {/* Left: Dialogs list */}
        <div className="sandbox-dialogs">
          <div className="dialogs-header">
            <span>Диалоги</span>
            <button className="new-chat-btn" onClick={createNewConversation} title="Новый чат">+</button>
          </div>
          <div className="dialogs-list">
            {conversations.length === 0 ? (
              <p className="no-dialogs">Нет диалогов.<br />Нажмите + чтобы начать</p>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`dialog-item ${conv.id === activeConvId ? 'active' : ''}`}
                  onClick={() => loadConversation(conv.id)}
                >
                  <div className="dialog-title">{conv.title}</div>
                  <div className="dialog-meta">
                    <span className="dialog-model">{conv.model}</span>
                    <span className="dialog-date">{formatDate(conv.updated_at)}</span>
                  </div>
                  <button
                    className="dialog-delete"
                    onClick={(e) => deleteConversation(e, conv.id)}
                    title="Удалить"
                  >×</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center: Dashboard + Chat */}
        <div className="sandbox-main">
          <div className="sandbox-dashboard">
            {widgets.length === 0 ? (
              <div className="empty-dashboard">
                <div className="empty-icon">🤖</div>
                <p>Дашборд пуст. Попросите ИИ вывести что-нибудь — котировки, фото, текст...</p>
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
                      {w.type === 'quotes' && <pre>{typeof w.content === 'object' ? JSON.stringify(w.content, null, 2) : (w.content || '')}</pre>}
                      {w.type === 'image' && <img src={w.url} alt={w.title || 'widget'} />}
                      {(w.type === 'text' || !w.type) && <p>{typeof w.content === 'object' ? JSON.stringify(w.content, null, 2) : (w.content || '')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sandbox-chat">
            {!activeConvId ? (
              <div className="no-conv-placeholder">
                <p>Выберите диалог слева или <button onClick={createNewConversation}>начните новый</button></p>
              </div>
            ) : (
              <>
                <div className="chat-messages">
                  {chatMessages.length === 0 && (
                    <div className="chat-empty">Начните разговор...</div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.sender}`}>
                      <div className="chat-bubble">{typeof msg.text === 'object' ? JSON.stringify(msg.text) : (msg.text || '')}</div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="chat-message agent">
                      <div className="chat-bubble typing-indicator">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form className="chat-input-area" onSubmit={handleChatSubmit}>
                  {availableModels.length > 0 && (
                    <select
                      className="model-select"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={isTyping}
                    >
                      {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="Напишите ИИ-ассистенту..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isTyping}
                  />
                  <button type="submit" disabled={isTyping || !chatInput.trim()}>
                    {isTyping ? '…' : '↑'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Right: Owner tasks */}
        <div className="sandbox-sidebar">
          <div className="owner-tasks">
            <h3>⚡ Задачи для Владельца</h3>
            {tasks.length === 0 ? (
              <p className="no-tasks">Очередь задач пуста</p>
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
