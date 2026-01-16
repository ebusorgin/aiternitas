import { useState, useEffect } from 'react';
import { useTaskStore, TASK_STATUSES, TASK_PRIORITIES } from '../../store/taskStore';
import './TaskModal.css';

function TaskModal({
  task,
  mode = 'create', // 'create' | 'edit' | 'view'
  departmentId,
  departmentName,
  columns = [],
  availableWorkers = [],
  childDepartments = [],
  parentDepartmentId = null,
  onSave,
  onClose
}) {
  const {
    updateTask,
    deleteTask,
    assignTask,
    decomposeTask,
    escalateTask,
    reviewTask,
    addReport,
    suggestAssignee,
    loadTask,
    getSubtasks,
    isDecomposing,
    isSaving
  } = useTaskStore();

  const [currentMode, setCurrentMode] = useState(mode);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    column_id: columns[0]?.id || null,
    due_date: '',
    estimated_hours: '',
    assigned_to_worker_id: '',
    assigned_to_department_id: ''
  });

  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'subtasks' | 'activity'
  const [reportContent, setReportContent] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [showEscalation, setShowEscalation] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [fullTask, setFullTask] = useState(null);

  // Update mode when prop changes
  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  // Load full task data if viewing
  useEffect(() => {
    if (task?.id && mode !== 'create') {
      loadTask(task.id).then(result => {
        if (result.success) {
          setFullTask(result.task);
        }
      });
    }
  }, [task?.id, mode, loadTask]);

  // Initialize form data
  useEffect(() => {
    if (task && mode !== 'create') {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'medium',
        column_id: task.column_id || columns[0]?.id,
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        estimated_hours: task.estimated_hours || '',
        assigned_to_worker_id: task.assigned_to_worker_id || '',
        assigned_to_department_id: task.assigned_to_department_id || ''
      });
    } else if (task?.column_id) {
      setFormData(prev => ({ ...prev, column_id: task.column_id }));
    }
  }, [task, mode, columns]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) return;

    if (currentMode === 'create') {
      await onSave(formData);
    } else {
      await updateTask(task.id, formData);
      onClose();
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm('Удалить задачу? Это действие нельзя отменить.');
    if (confirmed) {
      await deleteTask(task.id);
      onClose();
    }
  };

  const handleDecompose = async () => {
    const result = await decomposeTask(task.id, {
      departmentName,
      availableWorkers,
      childDepartments
    });

    if (result.success && result.subtasks?.length > 0) {
      // Refresh task data
      loadTask(task.id);
    }
  };

  const handleAssign = async (assignToWorkerId, assignToDepartmentId) => {
    const result = await assignTask(
      task.id,
      assignToWorkerId || null,
      assignToDepartmentId || null,
      !!assignToDepartmentId // auto decompose if assigning to department
    );

    if (result.success) {
      loadTask(task.id);
      setShowAssignment(false);
    }
  };

  const handleEscalate = async () => {
    if (!parentDepartmentId) return;

    const result = await escalateTask(task.id, parentDepartmentId, escalationReason);

    if (result.success) {
      onClose();
    }
  };

  const handleReview = async (action) => {
    const feedback = action === 'revision'
      ? window.prompt('Укажите что нужно доработать:')
      : null;

    await reviewTask(task.id, action, feedback);
    loadTask(task.id);
  };

  const handleAddReport = async () => {
    if (!reportContent.trim()) return;

    await addReport(
      task.id,
      departmentId,
      'department',
      reportContent,
      'report',
      'review' // Move to review after report
    );

    setReportContent('');
    loadTask(task.id);
  };

  const handleGetSuggestion = async () => {
    const result = await suggestAssignee(task.id, availableWorkers, childDepartments);
    if (result.success) {
      setSuggestion(result);
    }
  };

  const subtasks = fullTask?.subtasks || [];
  const comments = fullTask?.comments || [];

  const status = TASK_STATUSES[task?.status] || TASK_STATUSES.pending;
  const isEditable = currentMode === 'create' || currentMode === 'edit';

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal" onClick={e => e.stopPropagation()}>
        <div className="task-modal__header">
          <div className="task-modal__header-info">
            {task?.id && (
              <span className="task-modal__id">#{task.id}</span>
            )}
            <h2 className="task-modal__title">
              {mode === 'create' ? 'Новая задача' : task?.title}
            </h2>
          </div>

          {task?.id && (
            <div
              className="task-modal__status"
              style={{ backgroundColor: status.color }}
            >
              {status.icon} {status.name}
            </div>
          )}

          {currentMode === 'view' && (
            <button
              className="task-modal__edit-btn"
              onClick={() => setCurrentMode('edit')}
              title="Редактировать"
            >
              ✏️
            </button>
          )}

          <button className="task-modal__close" onClick={onClose}>×</button>
        </div>

        {mode !== 'create' && (
          <div className="task-modal__tabs">
            <button
              className={`task-modal__tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              📋 Детали
            </button>
            <button
              className={`task-modal__tab ${activeTab === 'subtasks' ? 'active' : ''}`}
              onClick={() => setActiveTab('subtasks')}
            >
              📝 Подзадачи ({subtasks.length})
            </button>
            <button
              className={`task-modal__tab ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              💬 Активность ({comments.length})
            </button>
          </div>
        )}

        <div className="task-modal__content">
          {(activeTab === 'details' || mode === 'create') && (
            <form onSubmit={handleSubmit}>
              <div className="task-modal__field">
                <label>Название *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Введите название задачи"
                  disabled={!isEditable}
                  required
                />
              </div>

              <div className="task-modal__field">
                <label>Описание</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Опишите задачу подробнее..."
                  rows={4}
                  disabled={!isEditable}
                />
              </div>

              <div className="task-modal__row">
                <div className="task-modal__field">
                  <label>Приоритет</label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    disabled={!isEditable}
                  >
                    {Object.values(TASK_PRIORITIES).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.icon} {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="task-modal__field">
                  <label>Колонка</label>
                  <select
                    name="column_id"
                    value={formData.column_id || ''}
                    onChange={handleChange}
                    disabled={!isEditable}
                  >
                    {columns.map(col => (
                      <option key={col.id} value={col.id}>{col.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="task-modal__row">
                <div className="task-modal__field">
                  <label>Дедлайн</label>
                  <input
                    type="date"
                    name="due_date"
                    value={formData.due_date}
                    onChange={handleChange}
                    disabled={!isEditable}
                  />
                </div>

                <div className="task-modal__field">
                  <label>Оценка (часы)</label>
                  <input
                    type="number"
                    name="estimated_hours"
                    value={formData.estimated_hours}
                    onChange={handleChange}
                    placeholder="0"
                    min="0"
                    step="0.5"
                    disabled={!isEditable}
                  />
                </div>
              </div>

              {isEditable && (
                <div className="task-modal__actions">
                  <button type="submit" className="task-modal__save" disabled={isSaving}>
                    {isSaving ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
                  </button>
                  <button type="button" className="task-modal__cancel" onClick={onClose}>
                    Отмена
                  </button>
                </div>
              )}
            </form>
          )}

          {activeTab === 'subtasks' && mode !== 'create' && (
            <div className="task-modal__subtasks">
              <div className="task-modal__subtasks-header">
                <span>Подзадачи ({subtasks.length})</span>
                <button
                  className="task-modal__decompose-btn"
                  onClick={handleDecompose}
                  disabled={isDecomposing}
                >
                  {isDecomposing ? '🔄 Декомпозиция...' : '🤖 Декомпозировать'}
                </button>
              </div>

              {subtasks.length === 0 ? (
                <div className="task-modal__subtasks-empty">
                  Нет подзадач. Используйте GPT-декомпозицию для автоматического разбиения.
                </div>
              ) : (
                <div className="task-modal__subtasks-list">
                  {subtasks.map(st => (
                    <div key={st.id} className="task-modal__subtask">
                      <div
                        className="task-modal__subtask-status"
                        style={{ backgroundColor: (TASK_STATUSES[st.status] || TASK_STATUSES.pending).color }}
                      />
                      <span className="task-modal__subtask-title">{st.title}</span>
                      <span className="task-modal__subtask-priority">
                        {(TASK_PRIORITIES[st.priority] || TASK_PRIORITIES.medium).icon}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && mode !== 'create' && (
            <div className="task-modal__activity">
              {/* Report input */}
              <div className="task-modal__report-input">
                <textarea
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                  placeholder="Добавить отчет или комментарий..."
                  rows={3}
                />
                <button
                  onClick={handleAddReport}
                  disabled={!reportContent.trim()}
                >
                  Отправить
                </button>
              </div>

              {/* Comments list */}
              <div className="task-modal__comments">
                {comments.length === 0 ? (
                  <div className="task-modal__comments-empty">
                    Нет активности по задаче
                  </div>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className={`task-modal__comment task-modal__comment--${comment.comment_type}`}>
                      <div className="task-modal__comment-header">
                        <span className="task-modal__comment-type">
                          {comment.comment_type === 'report' && '📝 Отчет'}
                          {comment.comment_type === 'status_change' && '🔄 Статус'}
                          {comment.comment_type === 'assignment' && '👤 Назначение'}
                          {comment.comment_type === 'escalation' && '⬆️ Эскалация'}
                          {comment.comment_type === 'comment' && '💬 Комментарий'}
                        </span>
                        <span className="task-modal__comment-time">
                          {new Date(comment.created_at).toLocaleString('ru-RU')}
                        </span>
                      </div>
                      <div className="task-modal__comment-content">
                        {comment.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom actions for view mode */}
        {mode !== 'create' && (
          <div className="task-modal__bottom-actions">
            {/* Assignment section */}
            <div className="task-modal__action-group">
              <button
                className="task-modal__action-btn"
                onClick={() => setShowAssignment(!showAssignment)}
              >
                👤 Назначить
              </button>

              {showAssignment && (
                <div className="task-modal__assignment-panel">
                  <button
                    className="task-modal__suggest-btn"
                    onClick={handleGetSuggestion}
                  >
                    🤖 Подобрать исполнителя
                  </button>

                  {suggestion?.suggestion && (
                    <div className="task-modal__suggestion">
                      <span>Рекомендация: <strong>{suggestion.suggestion.name}</strong></span>
                      <small>{suggestion.suggestion.reasoning}</small>
                      <button onClick={() => handleAssign(
                        suggestion.suggestion.type === 'worker' ? suggestion.suggestion.id : null,
                        suggestion.suggestion.type === 'department' ? suggestion.suggestion.id : null
                      )}>
                        Назначить
                      </button>
                    </div>
                  )}

                  {availableWorkers.length > 0 && (
                    <div className="task-modal__assignee-list">
                      <h5>Работники:</h5>
                      {availableWorkers.map(w => (
                        <button
                          key={w.id}
                          onClick={() => handleAssign(w.id, null)}
                        >
                          👤 {w.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {childDepartments.length > 0 && (
                    <div className="task-modal__assignee-list">
                      <h5>Департаменты:</h5>
                      {childDepartments.map(d => (
                        <button
                          key={d.id}
                          onClick={() => handleAssign(null, d.id)}
                        >
                          🏢 {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Review actions */}
            {task?.status === 'review' && (
              <div className="task-modal__review-actions">
                <button
                  className="task-modal__review-btn task-modal__review-btn--accept"
                  onClick={() => handleReview('accept')}
                >
                  ✅ Принять
                </button>
                <button
                  className="task-modal__review-btn task-modal__review-btn--revision"
                  onClick={() => handleReview('revision')}
                >
                  📝 На доработку
                </button>
                <button
                  className="task-modal__review-btn task-modal__review-btn--reject"
                  onClick={() => handleReview('reject')}
                >
                  ❌ Отклонить
                </button>
              </div>
            )}

            {/* Escalation */}
            {parentDepartmentId && !['completed', 'cancelled', 'escalated'].includes(task?.status) && (
              <div className="task-modal__action-group">
                <button
                  className="task-modal__action-btn task-modal__action-btn--escalate"
                  onClick={() => setShowEscalation(!showEscalation)}
                >
                  ⬆️ Эскалировать
                </button>

                {showEscalation && (
                  <div className="task-modal__escalation-panel">
                    <textarea
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      placeholder="Причина эскалации и рекомендации..."
                      rows={3}
                    />
                    <button onClick={handleEscalate}>
                      Отправить наверх
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Delete */}
            <button
              className="task-modal__delete-btn"
              onClick={handleDelete}
            >
              🗑️ Удалить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskModal;














