import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './PageStyles.css';
import './Mail.css';

function MailSent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/emails/sent?limit=100', { credentials: 'include' });
        if (res.status === 401) {
          navigate('/');
          return;
        }
        const data = await res.json();
        if (!cancelled && data.success) {
          setEmails(data.emails || []);
          setTotal(data.total || 0);
        }
      } catch (e) {
        if (!cancelled) setEmails([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Исходящие</h1>
        <p className="page-subtitle">Письма, отправленные вами или от вашего имени (подтверждение email, сброс пароля и т.д.)</p>
      </div>

      <div className="page-content mail-content">
        {loading ? (
          <p className="mail-loading">Загрузка...</p>
        ) : emails.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📤</div>
            <h2>Нет исходящих</h2>
            <p>Здесь появятся письма, отправленные через приложение (подтверждение email, сброс пароля).</p>
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
                  <div className="mail-list-from">{e.recipient}</div>
                  <div className="mail-list-subject">{e.subject}</div>
                  <div className="mail-list-date">{formatDate(e.created_at)}</div>
                </div>
              ))}
            </div>
            <div className="mail-detail">
              {detail ? (
                <>
                  <div className="mail-detail-header">
                    <strong>Кому:</strong> {detail.recipient} · {formatDate(detail.created_at)}
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

export default MailSent;
