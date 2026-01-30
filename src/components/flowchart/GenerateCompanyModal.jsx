import { useState, useEffect } from 'react';
import socketService from '../../services/socket';
import { useFlowchartStore } from '../../store/flowchartStore';
import './GenerateCompanyModal.css';

const STEPS = [
  { id: 1, name: 'Анализ', icon: '🔍' },
  { id: 2, name: 'Топ-менеджмент', icon: '👔' },
  { id: 3, name: 'Департаменты', icon: '🏢' },
  { id: 4, name: 'Руководители', icon: '👤' },
  { id: 5, name: 'Сотрудники', icon: '👥' },
  { id: 6, name: 'Связи', icon: '🔗' },
  { id: 7, name: 'Проверка', icon: '✅' }
];

function GenerateCompanyModal({ onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [clarification, setClarification] = useState(null);

  const setElements = useFlowchartStore((state) => state.setElements);
  const setConnections = useFlowchartStore((state) => state.setConnections);
  const navigateToRoot = useFlowchartStore((state) => state.navigateToRoot);

  // Listen for progress updates
  useEffect(() => {
    const handleProgress = (data) => {
      setProgress(data);
      if (data.message) {
        setStatusHistory(prev => {
          if (prev.length > 0 && prev[prev.length - 1].message === data.message) {
            return prev;
          }
          return [...prev, { ...data, time: new Date() }].slice(-8);
        });
      }
    };

    const unsubscribe = socketService.on('flowchart:generate-progress', handleProgress);
    
    return () => {
      unsubscribe?.();
    };
  }, []);

  // Уточнение по ходу генерации (всплывающее окно с вариантами)
  useEffect(() => {
    const handleClarification = (payload) => {
      setClarification(payload);
    };
    const unsubscribe = socketService.on('flowchart:clarification-needed', handleClarification);
    return () => unsubscribe?.();
  }, []);

  const handleClarificationChoice = (optionId) => {
    if (!clarification?.clarificationId) return;
    socketService.sendClarificationResponse(clarification.clarificationId, optionId);
    setClarification(null);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !isGenerating) {
      onClose();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Введите название компании');
      return;
    }

    setIsGenerating(true);
    setIsSuccess(false);
    setError(null);
    setProgress({ step: 0, total: 7, message: 'Инициализация...' });
    setStatusHistory([{ step: 0, message: 'Запуск генерации...', time: new Date() }]);

    try {
      const result = await socketService.generateCompany(name.trim(), description.trim());

      if (result.success) {
        setProgress({ step: 7, total: 7, message: 'Компания создана!' });
        setStatusHistory(prev => [...prev, { step: 7, message: '✨ Готово!', time: new Date() }]);
        
        // Update store with generated elements
        setElements(result.elements || []);
        setConnections(result.connections || []);
        
        // Navigate to root
        navigateToRoot();
        
        // Show success state briefly then close
        setIsSuccess(true);
        setIsGenerating(false);
        
        // Close modal after showing success message
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(result.error || 'Ошибка генерации');
        setProgress(null);
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message || 'Ошибка соединения с сервером');
      setProgress(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const getStepStatus = (stepId) => {
    if (!progress) return 'pending';
    if (progress.step > stepId) return 'completed';
    if (progress.step === stepId) return 'active';
    return 'pending';
  };

  return (
    <div className="generate-modal-overlay" onClick={handleOverlayClick}>
      <div className="generate-modal">
        {/* Header */}
        <div className="generate-modal-header">
          <div className="generate-header-content">
            <span className="generate-icon">✨</span>
            <div className="generate-title-group">
              <h2 className="generate-title">Сгенерировать компанию</h2>
              <span className="generate-subtitle">AI создаст полную организационную структуру</span>
            </div>
          </div>
          {!isGenerating && (
            <button className="generate-close-btn" onClick={onClose}>×</button>
          )}
        </div>

        {/* Content */}
        <form className="generate-modal-content" onSubmit={handleSubmit}>
          {!isGenerating ? (
            <>
              <div className="generate-field">
                <label htmlFor="company-name">Название компании *</label>
                <input
                  id="company-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='Например: ООО "Технологии Будущего"'
                  disabled={isGenerating}
                  autoFocus
                />
                <span className="field-hint">
                  Это название станет главным элементом на схеме
                </span>
              </div>

              <div className="generate-field">
                <label htmlFor="company-description">Описание компании</label>
                <textarea
                  id="company-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Опишите подробно: сферу деятельности, размер компании, количество сотрудников, основные направления работы, особенности структуры..."
                  rows={5}
                  disabled={isGenerating}
                />
                <span className="field-hint">
                  💡 Чем подробнее описание, тем точнее будет структура
                </span>
              </div>

              <div className="generation-info">
                <div className="info-header">
                  <span className="info-icon">🤖</span>
                  <span>Что создаст AI:</span>
                </div>
                <ul className="info-list">
                  <li>📁 Главный элемент компании с вашим названием</li>
                  <li>🏢 Департаменты и подразделения внутри</li>
                  <li>👥 Сотрудники в каждом отделе</li>
                  <li>🔗 Связи и взаимодействия между отделами</li>
                </ul>
              </div>
            </>
          ) : isSuccess ? (
            <div className="generation-success">
              <div className="success-icon">🎉</div>
              <h3 className="success-title">Компания создана!</h3>
              <p className="success-subtitle">Загрузка структуры...</p>
              <div className="success-stats">
                <div className="stat-item">
                  <span className="stat-icon">🏢</span>
                  <span className="stat-label">Элементов</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">🔗</span>
                  <span className="stat-label">Связей</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="generation-progress">
              {/* Step indicators - compact grid */}
              <div className="progress-steps-grid">
                {STEPS.map((step) => (
                  <div key={step.id} className={`step-item ${getStepStatus(step.id)}`}>
                    <span className="step-icon">
                      {getStepStatus(step.id) === 'completed' ? '✓' : 
                       getStepStatus(step.id) === 'active' ? '⏳' : step.icon}
                    </span>
                    <span className="step-name">{step.name}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${((progress?.step || 0) / 7) * 100}%` }}
                />
                <span className="progress-percent">{Math.round(((progress?.step || 0) / 7) * 100)}%</span>
              </div>

              {/* Current status */}
              <div className="current-status">
                <span className="status-spinner">⚙️</span>
                <span className="status-text">{progress?.message || 'Обработка...'}</span>
              </div>

              {/* Status history log */}
              <div className="status-log">
                <div className="log-header">Лог генерации:</div>
                <div className="log-entries">
                  {statusHistory.map((entry, index) => (
                    <div key={index} className={`log-entry ${entry.step === progress?.step ? 'current' : ''}`}>
                      <span className="log-time">
                        {entry.time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="log-message">{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Всплывающее уточнение по ходу генерации */}
              {clarification && (
                <div className="clarification-overlay">
                  <div className="clarification-box">
                    <div className="clarification-title">Уточните вектор</div>
                    <p className="clarification-question">{clarification.question}</p>
                    {clarification.summary && (
                      <p className="clarification-summary">Сейчас: {clarification.summary}</p>
                    )}
                    <div className="clarification-options">
                      {clarification.options?.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className="clarification-option"
                          onClick={() => handleClarificationChoice(opt.id)}
                        >
                          <span className="clarification-option-label">{opt.label}</span>
                          {opt.description && (
                            <span className="clarification-option-desc">{opt.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="generate-error">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="generate-modal-footer">
          {!isGenerating ? (
            <>
              <button 
                type="button"
                className="generate-btn secondary" 
                onClick={onClose}
              >
                Отмена
              </button>
              <button 
                type="submit"
                className="generate-btn primary"
                onClick={handleSubmit}
                disabled={!name.trim()}
              >
                <span className="btn-icon">✨</span>
                Сгенерировать
              </button>
            </>
          ) : (
            <div className="generating-footer">
              <div className="generating-hint">
                <span className="hint-icon">⏳</span>
                Генерация занимает 30-60 секунд
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GenerateCompanyModal;
