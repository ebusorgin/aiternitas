import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './PageStyles.css';
import './Mail.css';

function MailInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMessage, setSendMessage] = useState('');

  const loadInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/emails/inbox?limit=100', { credentials: 'include' });
      if (res.status === 401) {
        navigate('/');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setEmails(data.emails || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const openEmail = async (id) => {
    setSelected(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/emails/${id}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setDetail(data.email);
    } catch (e) {
      setDetail(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  };

  const sendTestToSelf = async () => {
    const to = (user?.email || '').trim().toLowerCase();
    if (!to) {
      setSendMessage('Не указан ваш email');
      return;
    }
    setSendLoading(true);
    setSendMessage('');
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, subject: 'Тест', body: 'Тест' })
      });
      const data = await res.json();
      if (data.success) {
        setSendMessage(data.message || 'Тест отправлен. Проверьте «Исходящие» и «Входящие».');
        setComposeTo(to);
        setComposeSubject('Тест');
        setComposeBody('Тест');
        loadInbox();
      } else {
        setSendMessage(data.error || 'Ошибка отправки');
      }
    } catch (err) {
      setSendMessage('Ошибка подключения к серверу');
    } finally {
      setSendLoading(false);
    }
  };

  const sendEmail = async (e) => {
    e?.preventDefault();
    const to = (composeTo || '').trim().toLowerCase();
    if (!to || !to.includes('@')) {
      setSendMessage('Укажите email получателя');
      return;
    }
    setSendLoading(true);
    setSendMessage('');
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, subject: composeSubject, body: composeBody })
      });
      const data = await res.json();
      if (data.success) {
        setSendMessage(data.message || 'Письмо отправлено.');
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        loadInbox();
      } else {
        setSendMessage(data.error || 'Ошибка отправки');
      }
    } catch (err) {
      setSendMessage('Ошибка подключения к серверу');
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Входящие</h1>
        <p className="page-subtitle">Письма, полученные на ваш email ({user?.email})</p>
      </div>

      <div className="mail-compose-section">
        <h2 className="mail-compose-title">Написать письмо</h2>
        <form onSubmit={sendEmail} className="mail-compose-form">
          <div className="mail-compose-row">
            <label htmlFor="compose-to">Кому</label>
            <input
              id="compose-to"
              type="email"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              placeholder="email@example.com"
              required
            />
          </div>
          <div className="mail-compose-row">
            <label htmlFor="compose-subject">Тема</label>
            <input
              id="compose-subject"
              type="text"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              placeholder="Тема письма"
            />
          </div>
          <div className="mail-compose-row">
            <label htmlFor="compose-body">Текст</label>
            <textarea
              id="compose-body"
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              placeholder="Текст письма"
              rows={4}
            />
          </div>
          <div className="mail-compose-actions">
            <button type="submit" className="primary-btn" disabled={sendLoading}>
              {sendLoading ? 'Отправка...' : 'Отправить'}
            </button>
            <button type="button" className="mail-test-btn" onClick={sendTestToSelf} disabled={sendLoading}>
              {sendLoading ? 'Отправка...' : 'Отправить тест себе'}
            </button>
          </div>
          {sendMessage && (
            <p className={`mail-send-message ${sendMessage.includes('Ошибка') ? 'error' : ''}`}>{sendMessage}</p>
          )}
        </form>
      </div>

      <div className="page-content mail-content">
        {loading ? (
          <p className="mail-loading">Загрузка...</p>
        ) : emails.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📬</div>
            <h2>Нет входящих</h2>
            <p>Входящие письма сохраняются на сервере. Убедитесь, что почтовый сервер принимает письма на порт MAIL_PORT (по умолчанию 2525).</p>
          </div>
        ) : (
          <div className="mail-layout">
            <div className="mail-list">
              <div className="mail-list-header">Всего: {total}</div>
              {emails.map((e) => (
                <div
                  key={e.id}
                  className={`mail-list-item ${selected === e.id ? 'selected' : ''}`}
                  onClick={() => openEmail(e.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => ev.key === 'Enter' && openEmail(e.id)}
                >
                  <div className="mail-list-from">{e.sender}</div>
                  <div className="mail-list-subject">{e.subject}</div>
                  <div className="mail-list-date">{formatDate(e.created_at)}</div>
                </div>
              ))}
            </div>
            <div className="mail-detail">
              {detail ? (
                <>
                  <div className="mail-detail-header">
                    <strong>От:</strong> {detail.sender} · <strong>Кому:</strong> {detail.recipient} · {formatDate(detail.created_at)}
                  </div>
                  <h2 className="mail-detail-subject">{detail.subject}</h2>
                  <div className="mail-detail-body" dangerouslySetInnerHTML={{ __html: detail.body || '' }} />
                </>
              ) : selected ? (
                <p className="mail-loading">Загрузка письма...</p>
              ) : (
                <p className="mail-placeholder">Выберите письмо из списка</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MailInbox;
