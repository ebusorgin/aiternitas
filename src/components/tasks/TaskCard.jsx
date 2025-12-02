import { useState } from 'react';
import { TASK_STATUSES, TASK_PRIORITIES } from '../../store/taskStore';
import './TaskCard.css';

function TaskCard({ 
  task, 
  onSelect, 
  onDragStart, 
  onDragEnd,
  isDragging = false,
  compact = false 
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  const priority = TASK_PRIORITIES[task.priority] || TASK_PRIORITIES.medium;
  const status = TASK_STATUSES[task.status] || TASK_STATUSES.pending;
  
  const hasSubtasks = task.subtask_count > 0;
  const subtaskProgress = hasSubtasks 
    ? Math.round((task.completed_subtask_count / task.subtask_count) * 100) 
    : 0;
  
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && 
    !['completed', 'cancelled'].includes(task.status);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return `${Math.abs(days)}д. назад`;
    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Завтра';
    if (days <= 7) return `${days}д.`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const handleClick = () => {
    onSelect?.(task);
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(task);
  };

  const handleDragEnd = (e) => {
    onDragEnd?.();
  };

  if (compact) {
    return (
      <div 
        className={`task-card task-card--compact ${isDragging ? 'task-card--dragging' : ''}`}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div 
          className="task-card__priority-indicator" 
          style={{ backgroundColor: priority.color }}
          title={priority.name}
        />
        <span className="task-card__title">{task.title}</span>
        {hasSubtasks && (
          <span className="task-card__subtask-badge">
            {task.completed_subtask_count}/{task.subtask_count}
          </span>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`task-card ${isDragging ? 'task-card--dragging' : ''} ${isOverdue ? 'task-card--overdue' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="task-card__header">
        <div 
          className="task-card__priority" 
          style={{ backgroundColor: priority.color }}
          title={priority.name}
        >
          {priority.icon}
        </div>
        <div className="task-card__id">#{task.id}</div>
        {isOverdue && <span className="task-card__overdue-badge">!</span>}
      </div>
      
      <h4 className="task-card__title">{task.title}</h4>
      
      {task.description && (
        <p className="task-card__description">
          {task.description.length > 80 
            ? task.description.substring(0, 80) + '...' 
            : task.description}
        </p>
      )}
      
      {hasSubtasks && (
        <div className="task-card__subtasks">
          <div className="task-card__subtask-progress">
            <div 
              className="task-card__subtask-bar" 
              style={{ width: `${subtaskProgress}%` }}
            />
          </div>
          <span className="task-card__subtask-count">
            {task.completed_subtask_count}/{task.subtask_count} подзадач
          </span>
        </div>
      )}
      
      <div className="task-card__footer">
        <div className="task-card__meta">
          {task.due_date && (
            <span className={`task-card__due ${isOverdue ? 'task-card__due--overdue' : ''}`}>
              📅 {formatDate(task.due_date)}
            </span>
          )}
          {task.estimated_hours && (
            <span className="task-card__estimate">
              ⏱️ {task.estimated_hours}ч
            </span>
          )}
        </div>
        
        <div className="task-card__assignee">
          {task.assigned_to_worker_id && (
            <span className="task-card__worker" title="Назначен работнику">
              👤
            </span>
          )}
          {task.assigned_to_department_id && (
            <span className="task-card__department" title="Назначен департаменту">
              🏢
            </span>
          )}
        </div>
      </div>
      
      {task.status === 'escalated' && (
        <div className="task-card__escalated">
          ⬆️ Эскалировано
        </div>
      )}
    </div>
  );
}

export default TaskCard;



