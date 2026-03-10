import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore, TASK_PRIORITIES, TASK_STATUSES } from '../../store/taskStore';
import { useFlowchartStore } from '../../store/flowchartStore';
import './TaskModal.css';

const createInitialForm = (columns) => ({
  title: '',
  description: '',
  execution_plan: '',
  status: 'pending',
  priority: 'medium',
  column_id: columns[0]?.id || null,
  due_date: '',
  schedule_start_at: '',
  schedule_end_at: '',
  estimated_hours: '',
  actual_hours: '',
  timer_started_at: '',
  attachments: [],
  assigned_to_worker_id: '',
  assigned_to_department_id: ''
});

const toDateInput = (value) => {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
};

const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const normalizeTaskToForm = (task, columns) => ({
  title: task?.title || '',
  description: task?.description || '',
  execution_plan: task?.execution_plan || '',
  status: task?.status || 'pending',
  priority: task?.priority || 'medium',
  column_id: task?.column_id || columns[0]?.id || null,
  due_date: toDateInput(task?.due_date),
  schedule_start_at: toDateTimeLocal(task?.schedule_start_at),
  schedule_end_at: toDateTimeLocal(task?.schedule_end_at),
  estimated_hours: task?.estimated_hours ?? '',
  actual_hours: task?.actual_hours ?? '',
  timer_started_at: task?.timer_started_at || '',
  attachments: Array.isArray(task?.attachments) ? task.attachments : [],
  assigned_to_worker_id: task?.assigned_to_worker_id || '',
  assigned_to_department_id: task?.assigned_to_department_id || ''
});

function TaskModal({
  task,
  mode = 'create',
  departmentId,
  departmentName,
  columns = [],
  availableWorkers = [],
  childDepartments = [],
  parentDepartmentId = null,
  onSave,
  onClose
}) {
  const navigate = useNavigate();
  const elements = useFlowchartStore((state) => state.elements);
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
    isDecomposing,
    isSaving
  } = useTaskStore();

  const [formData, setFormData] = useState(createInitialForm(columns));
  const [activeTab, setActiveTab] = useState('details');
  const [reportContent, setReportContent] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [showEscalation, setShowEscalation] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [fullTask, setFullTask] = useState(null);
  const [isEditing, setIsEditing] = useState(mode !== 'view');
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const fileInputRef = useRef(null);

  const refreshTask = useCallback(async () => {
    if (!task?.id) return null;
    const result = await loadTask(task.id);
    if (result.success) {
      setFullTask(result.task);
      setFormData(normalizeTaskToForm(result.task, columns));
      return result.task;
    }
    return null;
  }, [columns, loadTask, task?.id]);

  useEffect(() => {
    setIsEditing(mode !== 'view');
    if (task?.id && mode !== 'create') {
      refreshTask();
    } else {
      setFullTask(task || null);
      setFormData(task ? normalizeTaskToForm(task, columns) : createInitialForm(columns));
    }
  }, [task, task?.id, mode, columns, refreshTask]);

  const currentTask = fullTask || task || {};
  const currentTaskId = currentTask.id || null;
  const status = TASK_STATUSES[currentTask.status] || TASK_STATUSES.pending;
  const attachments = Array.isArray(formData.attachments) ? formData.attachments : [];
  const assigneeWorkerName = useMemo(() => (
    elements.find((element) => element.id === currentTask.assigned_to_worker_id)?.name
      || currentTask.assigned_to_worker_id
      || null
  ), [elements, currentTask.assigned_to_worker_id]);
  const assigneeDepartmentName = useMemo(() => (
    elements.find((element) => element.id === currentTask.assigned_to_department_id)?.name
      || currentTask.assigned_to_department_id
      || null
  ), [elements, currentTask.assigned_to_department_id]);
  const subtasks = useMemo(() => fullTask?.subtasks || [], [fullTask?.subtasks]);
  const comments = useMemo(() => fullTask?.comments || [], [fullTask?.comments]);

  const subtasksByParent = useMemo(() => (
    subtasks.reduce((acc, subtask) => {
      const parentId = subtask.parent_task_id;
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(subtask);
      return acc;
    }, {})
  ), [subtasks]);

  const renderSubtaskTree = (parentId, depth = 0) => (
    (subtasksByParent[parentId] || []).map(st => (
      <div key={st.id} className="task-modal__subtask-node">
        <div className="task-modal__subtask" style={{ marginLeft: `${depth * 18}px` }}>
          <div
            className="task-modal__subtask-status"
            style={{ backgroundColor: (TASK_STATUSES[st.status] || TASK_STATUSES.pending).color }}
          />
          <span className="task-modal__subtask-title">{st.title}</span>
          <span className="task-modal__subtask-priority">
            {(TASK_PRIORITIES[st.priority] || TASK_PRIORITIES.medium).icon}
          </span>
        </div>
        {renderSubtaskTree(st.id, depth + 1)}
      </div>
    ))
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const buildTaskPayload = () => ({
    ...formData,
    due_date: formData.due_date || null,
    schedule_start_at: formData.schedule_start_at || null,
    schedule_end_at: formData.schedule_end_at || null,
    estimated_hours: formData.estimated_hours === '' ? null : formData.estimated_hours,
    actual_hours: formData.actual_hours === '' ? null : formData.actual_hours,
    timer_started_at: formData.timer_started_at || null,
    attachments
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.title.trim()) return;

    if (mode === 'create') {
      await onSave(buildTaskPayload());
      return;
    }

    if (!currentTaskId) return;
    const result = await updateTask(currentTaskId, buildTaskPayload());
    if (result.success) {
      await refreshTask();
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm('Удалить задачу? Это действие нельзя отменить.');
    if (!confirmed) return;
    if (!currentTaskId) return;
    await deleteTask(currentTaskId);
    onClose();
  };

  const handleDecompose = async () => {
    if (!currentTaskId) return;
    const result = await decomposeTask(currentTaskId, {
      departmentName,
      availableWorkers,
      childDepartments
    });

    if (result.success) {
      await refreshTask();
    }
  };

  const handleAssign = async (assignToWorkerId, assignToDepartmentId) => {
    if (!currentTaskId || (!assignToWorkerId && !assignToDepartmentId)) return;

    const result = await assignTask(
      currentTaskId,
      assignToWorkerId || null,
      assignToDepartmentId || null,
      !!assignToDepartmentId
    );

    if (result.success) {
      await refreshTask();
      setShowAssignment(false);
    }
  };

  const handleEscalate = async () => {
    if (!parentDepartmentId) return;
    if (!currentTaskId) return;
    const result = await escalateTask(currentTaskId, parentDepartmentId, escalationReason);
    if (result.success) {
      onClose();
    }
  };

  const handleReview = async (action) => {
    const feedback = action === 'revision'
      ? window.prompt('Укажите что нужно доработать:')
      : null;

    if (!currentTaskId) return;
    await reviewTask(currentTaskId, action, feedback);
    await refreshTask();
  };

  const handleAddReport = async () => {
    if (!reportContent.trim()) return;

    await addReport(
      currentTaskId,
      departmentId,
      'department',
      reportContent,
      'report',
      'review'
    );

    setReportContent('');
    await refreshTask();
  };

  const handleGetSuggestion = async () => {
    if (!currentTaskId) return;
    const result = await suggestAssignee(currentTaskId, availableWorkers, childDepartments);
    if (result.success) {
      setSuggestion(result.suggestion || null);
    }
  };

  const handleCreateWorker = () => {
    onClose?.();
    navigate('/companies');
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploadingFiles(true);
    try {
      const payload = new FormData();
      files.forEach(file => payload.append('files', file));

      const response = await fetch('/api/upload/task-attachments', {
        method: 'POST',
        credentials: 'include',
        body: payload
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Не удалось загрузить файлы');
      }

      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...result.files]
      }));
    } catch (error) {
      window.alert(error.message || 'Ошибка загрузки файлов');
    } finally {
      setIsUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, currentIndex) => currentIndex !== index)
    }));
  };

  const isTaskExisting = mode !== 'create' && !!currentTaskId;
  const canEdit = mode === 'create' || isEditing;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal task-modal--wide" onClick={(event) => event.stopPropagation()}>
        <div className="task-modal__header">
          <div className="task-modal__header-info">
            {currentTask.id && <span className="task-modal__id">#{currentTask.id}</span>}
            <h2 className="task-modal__title">
              {mode === 'create' ? 'Новая задача' : currentTask.title}
            </h2>
            <div className="task-modal__header-meta">
              <span>Департамент: {departmentName}</span>
              {assigneeWorkerName && <span>Исполнитель: {assigneeWorkerName}</span>}
              {assigneeDepartmentName && <span>Назначено в: {assigneeDepartmentName}</span>}
            </div>
          </div>

          {isTaskExisting && (
            <div className="task-modal__status" style={{ backgroundColor: status.color }}>
              {status.icon} {status.name}
            </div>
          )}

          <button className="task-modal__close" onClick={onClose}>×</button>
        </div>

        {isTaskExisting && (
          <div className="task-modal__tabs">
            {[
              ['details', '📋 Детали'],
              ['plan', '🗓 План'],
              ['files', `📎 Файлы (${attachments.length})`],
              ['subtasks', `📝 Подзадачи (${subtasks.length})`],
              ['activity', `💬 Активность (${comments.length})`]
            ].map(([tabId, label]) => (
              <button
                key={tabId}
                className={`task-modal__tab ${activeTab === tabId ? 'active' : ''}`}
                onClick={() => setActiveTab(tabId)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="task-modal__content">
          {(mode === 'create' || activeTab === 'details' || activeTab === 'plan' || activeTab === 'files') && (
            <form onSubmit={handleSubmit} className="task-modal__form">
              {(mode === 'create' || activeTab === 'details') && (
                <>
                  <div className="task-modal__grid task-modal__grid--summary">
                    <div className="task-modal__field">
                      <label>Название</label>
                      <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        placeholder="Например: Подготовить коммерческое предложение"
                        disabled={!canEdit}
                        required
                      />
                    </div>

                    <div className="task-modal__field">
                      <label>Статус</label>
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        disabled={!canEdit || !isTaskExisting}
                      >
                        {Object.values(TASK_STATUSES).map(item => (
                          <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="task-modal__field">
                    <label>Описание</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={5}
                      placeholder="Контекст, требования, ссылки, заметки"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="task-modal__grid">
                    <div className="task-modal__field">
                      <label>Приоритет</label>
                      <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        disabled={!canEdit}
                      >
                        {Object.values(TASK_PRIORITIES).map(priority => (
                          <option key={priority.id} value={priority.id}>
                            {priority.icon} {priority.name}
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
                        disabled={!canEdit}
                      >
                        {columns.map(column => (
                          <option key={column.id} value={column.id}>{column.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {(mode === 'create' || activeTab === 'plan') && (
                <>
                  <div className="task-modal__field">
                    <label>План выполнения</label>
                    <textarea
                      name="execution_plan"
                      value={formData.execution_plan}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Шаги, чеклист, ожидаемый результат"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="task-modal__grid">
                    <div className="task-modal__field">
                      <label>Дедлайн</label>
                      <input
                        type="date"
                        name="due_date"
                        value={formData.due_date}
                        onChange={handleChange}
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="task-modal__field">
                      <label>Оценка, часы</label>
                      <input
                        type="number"
                        name="estimated_hours"
                        value={formData.estimated_hours}
                        onChange={handleChange}
                        min="0"
                        step="0.25"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>

                  <div className="task-modal__grid">
                    <div className="task-modal__field">
                      <label>Начало выполнения</label>
                      <input
                        type="datetime-local"
                        name="schedule_start_at"
                        value={formData.schedule_start_at}
                        onChange={handleChange}
                        disabled={!canEdit}
                      />
                    </div>

                    <div className="task-modal__field">
                      <label>Окончание выполнения</label>
                      <input
                        type="datetime-local"
                        name="schedule_end_at"
                        value={formData.schedule_end_at}
                        onChange={handleChange}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>

                </>
              )}

              {(mode === 'create' || activeTab === 'files') && (
                <>
                  <div className="task-modal__attachments-toolbar">
                    <div>
                      <div className="task-modal__section-title">Файлы и материалы</div>
                      <div className="task-modal__section-note">Добавляйте документы, изображения, ТЗ и любые вложения к задаче.</div>
                    </div>
                    <div className="task-modal__attachments-actions">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="task-modal__file-input"
                        onChange={handleFileUpload}
                      />
                      <button
                        type="button"
                        className="task-modal__attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFiles || !canEdit}
                      >
                        {isUploadingFiles ? 'Загрузка...' : '+ Добавить файлы'}
                      </button>
                    </div>
                  </div>

                  {attachments.length === 0 ? (
                    <div className="task-modal__attachments-empty">Файлы ещё не добавлены</div>
                  ) : (
                    <div className="task-modal__attachments-list">
                      {attachments.map((attachment, index) => (
                        <div key={`${attachment.url}-${index}`} className="task-modal__attachment">
                          <div className="task-modal__attachment-info">
                            <a href={attachment.url} target="_blank" rel="noreferrer">
                              {attachment.name || attachment.originalName || `Файл ${index + 1}`}
                            </a>
                            <span>{attachment.size ? `${Math.round(attachment.size / 1024)} КБ` : 'Файл'}</span>
                          </div>
                          {canEdit && (
                            <button type="button" onClick={() => handleRemoveAttachment(index)}>
                              Удалить
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {(mode === 'create' || isEditing) && (
                <div className="task-modal__actions">
                  <button type="submit" className="task-modal__save" disabled={isSaving}>
                    {isSaving ? 'Сохранение...' : mode === 'create' ? 'Создать задачу' : 'Сохранить изменения'}
                  </button>
                  {mode !== 'create' && (
                    <button type="button" className="task-modal__cancel" onClick={() => {
                      setFormData(normalizeTaskToForm(currentTask, columns));
                      setIsEditing(false);
                    }}>
                      Отменить правки
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          {activeTab === 'subtasks' && isTaskExisting && (
            <div className="task-modal__subtasks">
              <div className="task-modal__subtasks-header">
                <span>Подзадачи ({subtasks.length})</span>
                <button className="task-modal__decompose-btn" onClick={handleDecompose} disabled={isDecomposing}>
                  {isDecomposing ? '🔄 Декомпозиция...' : '🤖 Декомпозировать'}
                </button>
              </div>

              {subtasks.length === 0 ? (
                <div className="task-modal__subtasks-empty">
                  Нет подзадач. Используйте декомпозицию или назначьте задачу дочернему департаменту.
                </div>
              ) : (
                <div className="task-modal__subtasks-list">
                  {currentTaskId ? renderSubtaskTree(currentTaskId) : null}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && isTaskExisting && (
            <div className="task-modal__activity">
              <div className="task-modal__report-input">
                <textarea
                  value={reportContent}
                  onChange={(event) => setReportContent(event.target.value)}
                  placeholder="Добавить отчёт, решение или комментарий"
                  rows={3}
                />
                <button onClick={handleAddReport} disabled={!reportContent.trim()}>
                  Отправить
                </button>
              </div>

              <div className="task-modal__comments">
                {comments.length === 0 ? (
                  <div className="task-modal__comments-empty">По задаче ещё нет активности</div>
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
                      <div className="task-modal__comment-content">{comment.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {isTaskExisting && (
          <div className="task-modal__bottom-actions">
            {!isEditing && (
              <button className="task-modal__action-btn" onClick={() => setIsEditing(true)}>
                ✏️ Редактировать
              </button>
            )}

            <div className="task-modal__action-group">
              <button className="task-modal__action-btn" onClick={() => setShowAssignment(!showAssignment)}>
                👤 Назначить
              </button>

              {showAssignment && (
                <div className="task-modal__assignment-panel">
                  <button className="task-modal__suggest-btn" onClick={handleGetSuggestion}>
                    🤖 Подобрать исполнителя
                  </button>

                  {suggestion?.suggestion && (
                    <div className="task-modal__suggestion">
                      <span>Рекомендация: <strong>{suggestion.suggestion.name}</strong></span>
                      <small>{suggestion.suggestion.reasoning}</small>
                      <button onClick={() => handleAssign(
                        suggestion.suggestion.type === 'worker' ? suggestion.suggestion.id : null,
                        suggestion.suggestion.type === 'department' ? suggestion.suggestion.id : null
                      )}
                      disabled={!['worker', 'department'].includes(suggestion.suggestion.type)}
                      >
                        Назначить
                      </button>
                    </div>
                  )}

                  {availableWorkers.length > 0 && (
                    <div className="task-modal__assignee-list">
                      <h5>Работники</h5>
                      {availableWorkers.map(worker => (
                        <button key={worker.id} onClick={() => handleAssign(worker.id, null)}>
                          👤 {worker.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {availableWorkers.length === 0 && (
                    <div className="task-modal__assignment-empty">
                      <span>В этом департаменте пока нет работников.</span>
                      <small>Сначала добавьте работника в разделе «Мои компании», затем назначьте на него задачу.</small>
                      <button type="button" onClick={handleCreateWorker}>
                        + Создать работника
                      </button>
                    </div>
                  )}

                  {childDepartments.length > 0 && (
                    <div className="task-modal__assignee-list">
                      <h5>Департаменты</h5>
                      {childDepartments.map(department => (
                        <button key={department.id} onClick={() => handleAssign(null, department.id)}>
                          🏢 {department.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {currentTask.status === 'review' && (
              <div className="task-modal__review-actions">
                <button className="task-modal__review-btn task-modal__review-btn--accept" onClick={() => handleReview('accept')}>
                  ✅ Принять
                </button>
                <button className="task-modal__review-btn task-modal__review-btn--revision" onClick={() => handleReview('revision')}>
                  📝 На доработку
                </button>
                <button className="task-modal__review-btn task-modal__review-btn--reject" onClick={() => handleReview('reject')}>
                  ❌ Отклонить
                </button>
              </div>
            )}

            {parentDepartmentId && !['completed', 'cancelled', 'escalated'].includes(currentTask.status) && (
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
                      onChange={(event) => setEscalationReason(event.target.value)}
                      placeholder="Причина эскалации и рекомендации"
                      rows={3}
                    />
                    <button onClick={handleEscalate}>Отправить наверх</button>
                  </div>
                )}
              </div>
            )}

            <button className="task-modal__delete-btn" onClick={handleDelete}>
              🗑️ Удалить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskModal;
