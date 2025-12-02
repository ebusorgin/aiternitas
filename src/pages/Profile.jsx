import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Profile.css';

function Profile() {
  const { user, updateUser, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      checkAuth().then(() => {
        if (!user) {
          navigate('/login');
        }
      });
    } else {
      setNameValue(user.name || '');
    }
  }, [user, navigate, checkAuth]);

  const startEditingName = () => {
    setIsEditingName(true);
    setNameValue(user?.name || '');
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setNameValue(user?.name || '');
  };

  const saveName = async () => {
    const newName = nameValue.trim();

    if (!newName) {
      setMessage({ text: 'Имя не может быть пустым', type: 'error' });
      return;
    }

    if (newName === user?.name) {
      cancelEditingName();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/profile/name', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ name: newName }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        updateUser(data.user);
        setMessage({ text: 'Имя успешно обновлено', type: 'success' });
        setIsEditingName(false);
      } else {
        setMessage({ text: data.error || 'Ошибка обновления имени', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Ошибка подключения к серверу', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'Размер файла не должен превышать 5MB', type: 'error' });
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ text: 'Разрешены только изображения (jpeg, jpg, png, gif, webp)', type: 'error' });
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/upload/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        updateUser(data.user);
        setMessage({ text: 'Аватар успешно загружен', type: 'success' });
      } else {
        setMessage({ text: data.error || 'Ошибка загрузки аватара', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Ошибка подключения к серверу', type: 'error' });
    } finally {
      e.target.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveName();
    } else if (e.key === 'Escape') {
      cancelEditingName();
    }
  };

  if (!user) {
    return <div>Загрузка...</div>;
  }

  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div className="profile-container">
      <div className="profile-header">
        <Link to="/" className="back-link">
          ← На главную
        </Link>
      </div>

      <div className="profile-card">
        <div className="profile-avatar-section">
          <div className="avatar-container">
            <img
              src={user.avatar || '/images/default-avatar.png'}
              alt="Аватар"
              className="avatar"
            />
            <label htmlFor="avatarInput" className="avatar-upload-label">
              <span>📷</span>
              <input
                type="file"
                id="avatarInput"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
              />
            </label>
          </div>
          <p className="avatar-hint">Нажмите на аватар для загрузки</p>
        </div>

        <div className="profile-info">
          <h1>Личный кабинет</h1>

          <div className="profile-data">
            <div className="data-item">
              <label>Имя</label>
              <div className={`data-value ${isEditingName ? 'editing' : ''}`} id="nameContainer">
                {!isEditingName ? (
                  <>
                    <span className="display-value">{user.name || 'Не указано'}</span>
                    <button
                      className="edit-btn"
                      onClick={startEditingName}
                      title="Редактировать имя"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="edit-controls">
                    <input
                      type="text"
                      className="edit-input"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={loading}
                      autoFocus
                    />
                    <button
                      className="save-btn"
                      onClick={saveName}
                      disabled={loading}
                      title="Сохранить"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                      </svg>
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={cancelEditingName}
                      disabled={loading}
                      title="Отмена"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="data-item">
              <label>Email</label>
              <div className="data-value">
                <span className="display-value">
                  {user.email || ''}
                  {user.email_verified ? (
                    <span style={{ color: '#10b981', marginLeft: '10px', fontSize: '0.9em' }}>✓ Подтвержден</span>
                  ) : (
                    <span style={{ color: '#f59e0b', marginLeft: '10px', fontSize: '0.9em' }}>⚠ Не подтвержден</span>
                  )}
                </span>
              </div>
            </div>

            <div className="data-item">
              <label>Дата регистрации</label>
              <div className="data-value">
                <span className="display-value">{createdAt}</span>
              </div>
            </div>
          </div>

          {message.text && (
            <div className={`message ${message.type}`} style={{ display: 'block' }}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;

