import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMail } from '../context/MailContext';
import socketService from '../services/socket';
import './PageStyles.css';
import './Mail.css';

const FOLDERS = [
  { id: 'inbox', name: 'Входящие', icon: '📥' },
  { id: 'sent', name: 'Отправленные', icon: '📤' },
  { id: 'drafts', name: 'Черновики', icon: '✏️' },
  { id: 'spam', name: 'Спам', icon: '⚠️' },
  { id: 'trash', name: 'Корзина', icon: '🗑️' }
];

function MailSetup({ onSetup }) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    const val = login.trim().toLowerCase();
    if (!val || val.length < 2) {
      setError('Логин должен быть не короче 2 символов (латиница, цифры, точка, дефис)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mail/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mail_login: val })
      });
      const data = await res.json();
      if (data.success) {
        onSetup(data);
      } else {
        setError(data.error || 'Ошибка создания ящика');
      }
    } catch (err) {
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mail-setup">
      <div className="mail-setup-card">
        <h1 className="mail-setup-title">Почта @aiternitas.ru</h1>
        <p className="mail-setup-desc">Придумайте логин для вашего почтового ящика. Ваш адрес будет: <strong>логин@aiternitas.ru</strong></p>
        <form onSubmit={submit} className="mail-setup-form">
          <div className="mail-setup-row">
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="например: ivanov"
              className="mail-setup-input"
              autoComplete="username"
              disabled={loading}
            />
            <span className="mail-setup-suffix">@aiternitas.ru</span>
          </div>
          {error && <p className="mail-setup-error">{error}</p>}
          <button type="submit" className="primary-btn mail-setup-btn" disabled={loading}>
            {loading ? 'Создаём...' : 'Создать ящик'}
          </button>
        </form>
      </div>
    </div>
  );
}

function MailLayout({ mailAddress, folder: initialFolder, onFolderChange, isCompose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { refreshUnread } = useMail();
  const [folders, setFolders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const folderRef = useRef(initialFolder || 'inbox');
  const folder = initialFolder || 'inbox';
  folderRef.current = folder;

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/mail/folders', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setFolders(data.folders || []);
        refreshUnread();
      }
    } catch (e) {
      setFolders([]);
    }
  }, [refreshUnread]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mail/messages?folder=${folder}&limit=100`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
        setTotal(data.total || 0);
      } else {
        setMessages([]);
        setTotal(0);
      }
    } catch (e) {
      setMessages([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const handleNewMail = () => {
      loadFolders();
      if (folderRef.current === 'inbox') loadMessages();
    };
    const unsub = socketService.on('mail:new', handleNewMail);
    return unsub;
  }, [loadFolders, loadMessages]);

  useEffect(() => {
    if (id) {
      setSelected(parseInt(id, 10));
      setDetail(null);
      fetch(`/api/mail/messages/${id}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setDetail(d.message);
            loadFolders();
            loadMessages();
          }
        })
        .catch(() => setDetail(null));
    } else {
      setSelected(null);
      setDetail(null);
    }
  }, [id, loadFolders, loadMessages]);

  const openMessage = (msgId) => {
    navigate(`/mail/folder/${folder}/read/${msgId}`);
  };

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  };

  const goCompose = () => {
    navigate('/mail/compose');
  };

  const deleteMessage = async (msgId, permanent = false) => {
    const id = msgId ?? selected;
    if (!id) return;
    try {
      const url = permanent
        ? `/api/mail/messages/${id}?permanent=1`
        : `/api/mail/messages/${id}`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSelected(null);
        setDetail(null);
        navigate(`/mail/folder/${folder}`);
        loadMessages();
        loadFolders();
      }
    } catch (e) {
      console.error('Ошибка удаления:', e);
    }
  };

  const restoreMessage = async () => {
    if (!selected || !detail) return;
    const targetFolder = detail.direction === 'outgoing' ? 'sent' : 'inbox';
    try {
      const res = await fetch(`/api/mail/messages/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folder: targetFolder })
      });
      const data = await res.json();
      if (data.success) {
        setSelected(null);
        setDetail(null);
        navigate(`/mail/folder/${targetFolder}`);
        loadMessages();
        loadFolders();
      }
    } catch (e) {
      console.error('Ошибка восстановления:', e);
    }
  };

  return (
    <div className="mail-page">
      <div className="mail-sidebar">
        <button type="button" className="mail-compose-btn" onClick={goCompose}>
          Написать
        </button>
        <nav className="mail-folders">
          {FOLDERS.map((f) => {
            const stat = folders.find((s) => s.id === f.id) || {};
            return (
              <button
                key={f.id}
                type="button"
                className={`mail-folder-item ${folder === f.id ? 'active' : ''}`}
                onClick={() => { onFolderChange(f.id); navigate(`/mail/folder/${f.id}`); }}
              >
                <span className="mail-folder-icon">{f.icon}</span>
                <span className="mail-folder-name">{f.name}</span>
                {(stat.unread || 0) > 0 && (
                  <span className="mail-folder-badge">{stat.unread}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mail-address-display">{mailAddress}</div>
      </div>
      <div className="mail-main">
        {isCompose ? (
          <MailCompose
            onSent={() => { navigate('/mail/folder/sent'); loadMessages(); loadFolders(); }}
            onCancel={() => navigate('/mail')}
            initialReply={location.state?.replyTo ? location.state : null}
          />
        ) : (
          <>
            <div className="mail-list">
              {loading ? (
                <p className="mail-loading">Загрузка...</p>
              ) : messages.length === 0 ? (
                <div className="mail-empty">В этой папке нет писем</div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    className={`mail-list-item ${selected === m.id ? 'selected' : ''} ${!m.read_at ? 'unread' : ''}`}
                    onClick={() => openMessage(m.id)}
                    onKeyDown={(e) => e.key === 'Enter' && openMessage(m.id)}
                  >
                    <div className="mail-list-item-content">
                      <div className="mail-list-from">{folder === 'sent' ? m.recipient : m.sender}</div>
                      <div className="mail-list-subject">{m.subject || '(без темы)'}</div>
                      <div className="mail-list-preview">{m.body_preview || ''}</div>
                      <div className="mail-list-date">{formatDate(m.created_at)}</div>
                    </div>
                    <button
                      type="button"
                      className="mail-list-delete-btn"
                      title={folder === 'trash' ? 'Удалить навсегда' : 'В корзину'}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMessage(m.id, folder === 'trash');
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="mail-detail-panel">
              {detail ? (
                <>
                  <div className="mail-detail-actions">
                    {folder === 'trash' ? (
                      <>
                        <button type="button" className="mail-action-btn" onClick={restoreMessage}>
                          Восстановить
                        </button>
                        <button type="button" className="mail-action-btn mail-action-btn-danger" onClick={() => deleteMessage(null, true)}>
                          Удалить навсегда
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="mail-action-btn mail-action-btn-primary" onClick={() => {
                          const replyTo = detail.direction === 'incoming' ? detail.sender : detail.recipient;
                          const subj = (detail.subject || '').trim();
                          const reSubject = subj.startsWith('Re:') ? subj : `Re: ${subj || '(без темы)'}`;
                          const plainBody = (detail.body || '').replace(/<[^>]+>/g, '').trim();
                          const quotedBody = `\n\n---\n${detail.sender} писал(а) ${formatDate(detail.created_at)}:\n\n${plainBody}`;
                          navigate('/mail/compose', { state: { replyTo, subject: reSubject, body: quotedBody } });
                        }}>
                          Ответить
                        </button>
                        <button type="button" className="mail-action-btn mail-action-btn-danger" onClick={() => deleteMessage(null, false)}>
                          В корзину
                        </button>
                      </>
                    )}
                  </div>
                  <div className="mail-detail-header">
                    <strong>От:</strong> {detail.sender} · <strong>Кому:</strong> {detail.recipient}
                  </div>
                  <div className="mail-detail-meta">{formatDate(detail.created_at)}</div>
                  <h2 className="mail-detail-subject">{detail.subject || '(без темы)'}</h2>
                  <div className="mail-detail-body" dangerouslySetInnerHTML={{ __html: detail.body || '' }} />
                </>
              ) : selected ? (
                <p className="mail-loading">Загрузка письма...</p>
              ) : (
                <div className="mail-empty-state">
                  <div className="mail-empty-icon">✉️</div>
                  <h3 className="mail-empty-title">Выберите письмо</h3>
                  <p className="mail-empty-subtitle">Выберите письмо из списка слева, чтобы прочитать его содержимое</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MailCompose({ onSent, onCancel, initialReply }) {
  const fileInputRef = useRef(null);
  const [to, setTo] = useState(initialReply?.replyTo || '');
  const [subject, setSubject] = useState(initialReply?.subject || '');
  const [body, setBody] = useState(initialReply?.body || '');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    if (files.length + selected.length > 5) {
      setError('Максимум 5 файлов');
      return;
    }
    const totalSize = [...files, ...selected].reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalSize > 10 * 1024 * 1024) {
      setError('Общий размер файлов не более 10 МБ');
      return;
    }
    setFiles((prev) => [...prev, ...selected]);
    setError('');
    e.target.value = '';
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!to.trim() || !to.includes('@')) {
      setError('Укажите адрес получателя');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('to', to.trim());
      formData.append('subject', subject);
      formData.append('body', body);
      files.forEach((f) => formData.append('files', f));
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        onSent?.();
      } else {
        setError(data.error || 'Ошибка отправки');
      }
    } catch (err) {
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mail-compose-panel">
      <h2 className="mail-compose-title">Новое письмо</h2>
      <form onSubmit={send} className="mail-compose-form">
        <div className="mail-compose-row">
          <label>Кому</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@example.com"
            required
          />
        </div>
        <div className="mail-compose-row">
          <label>Тема</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Тема письма"
          />
        </div>
        <div className="mail-compose-row">
          <label>Текст</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Текст письма"
            rows={12}
          />
        </div>
        <div className="mail-compose-row">
          <label>Вложения</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={addFiles}
          />
          <button
            type="button"
            className="mail-attach-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Прикрепить файл
          </button>
          {files.length > 0 && (
            <ul className="mail-files-list">
              {files.map((f, idx) => (
                <li key={idx} className="mail-file-item">
                  <span>{f.name}</span>
                  <button type="button" className="mail-file-remove" onClick={() => removeFile(idx)} title="Удалить">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="mail-send-message error">{error}</p>}
        <div className="mail-compose-actions">
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Отправка...' : 'Отправить'}
          </button>
          <button type="button" className="secondary-btn" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Mail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { folder: folderParam, id } = useParams();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const isCompose = location.pathname.includes('/compose');
  const currentFolder = folderParam || 'inbox';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mail/me', { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 401) {
          navigate('/');
          setLoading(false);
          return;
        }
        if (data.success) setMe(data);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [navigate]);

  const handleSetup = (data) => {
    setMe({
      ...me,
      has_mailbox: true,
      mail_login: data.mail_login,
      mail_address: data.mail_address
    });
    navigate('/mail');
  };

  if (loading) {
    return (
      <div className="page-container">
        <p className="mail-loading">Загрузка...</p>
      </div>
    );
  }

  if (!me?.has_mailbox && !me?.mail_login) {
    return (
      <div className="page-container">
        <MailSetup onSetup={handleSetup} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Почта</h1>
        <p className="page-subtitle">{me?.mail_address || 'Почтовый ящик'}</p>
      </div>
      <MailLayout
        mailAddress={me?.mail_address}
        folder={currentFolder}
        onFolderChange={(f) => navigate(`/mail/folder/${f}`)}
        isCompose={isCompose}
      />
    </div>
  );
}
