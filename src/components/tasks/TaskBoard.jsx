import { useState, useEffect, useCallback } from 'react';
import { useTaskStore } from '../../store/taskStore';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import './TaskBoard.css';

function TaskBoard({ 
  departmentId, 
  departmentName = 'Департамент',
  availableWorkers = [],
  childDepartments = [],
  parentDepartmentId = null,
  compact = false,
  onTaskSelect
}) {
  const { 
    tasks, 
    columns, 
    isLoading,
    loadColumns, 
    loadTasks,
    createTask,
    moveTask,
    createColumn,
    deleteColumn,
    initSocketListeners
  } = useTaskStore();

  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit' | 'view'
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Initialize
  useEffect(() => {
    initSocketListeners();
    
    if (departmentId) {
      loadColumns(departmentId);
      loadTasks(departmentId);
    }
  }, [departmentId, initSocketListeners, loadColumns, loadTasks]);

  // Get tasks for a specific column
  const getColumnTasks = useCallback((columnId) => {
    return tasks.filter(t => 
      t.column_id === columnId && 
      t.department_id === departmentId &&
      !t.parent_task_id
    );
  }, [tasks, departmentId]);

  // Handle task selection
  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    setModalMode('view');
    setIsModalOpen(true);
    onTaskSelect?.(task);
  };

  // Handle create task
  const handleCreateTask = (columnId = null) => {
    setSelectedTask(columnId ? { column_id: columnId } : null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  // Handle save task from modal
  const handleSaveTask = async (taskData) => {
    if (modalMode === 'create') {
      await createTask({
        ...taskData,
        departmentId,
        columnId: taskData.column_id || columns[0]?.id
      });
    }
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  // Drag and drop handlers
  const handleDragStart = (task) => {
    setDraggedTask(task);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(null);

    const taskId = e.dataTransfer.getData('taskId');
    if (taskId && draggedTask) {
      // Determine new status based on column position
      const columnIndex = columns.findIndex(c => c.id === columnId);
      let newStatus = 'in_progress';
      
      if (columnIndex === 0) newStatus = 'pending';
      else if (columnIndex === columns.length - 1) newStatus = 'completed';
      else if (columnIndex === columns.length - 2) newStatus = 'review';
      
      await moveTask(parseInt(taskId), columnId, newStatus);
    }
    
    setDraggedTask(null);
  };

  // Add new column
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    
    await createColumn(departmentId, newColumnName, '#6b7280', columns.length);
    setNewColumnName('');
    setShowAddColumn(false);
  };

  // Remove column
  const handleRemoveColumn = async (columnId) => {
    const confirmed = window.confirm('Удалить колонку? Задачи будут перемещены в первую колонку.');
    if (confirmed) {
      const firstColumnId = columns.find(c => c.id !== columnId)?.id;
      await deleteColumn(columnId, firstColumnId);
    }
  };

  if (isLoading && columns.length === 0) {
    return (
      <div className="task-board task-board--loading">
        <div className="task-board__loader">
          <div className="loader-spinner"></div>
          <span>Загрузка задач...</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="task-board task-board--compact">
        <div className="task-board__header">
          <h3 className="task-board__title">📋 Задачи</h3>
          <button 
            className="task-board__add-btn"
            onClick={() => handleCreateTask()}
          >
            + Добавить
          </button>
        </div>
        
        <div className="task-board__compact-list">
          {tasks.filter(t => t.department_id === departmentId && !t.parent_task_id).length === 0 ? (
            <div className="task-board__empty">
              Нет задач
            </div>
          ) : (
            tasks
              .filter(t => t.department_id === departmentId && !t.parent_task_id)
              .slice(0, 5)
              .map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  compact 
                  onSelect={handleTaskSelect}
                />
              ))
          )}
        </div>

        {isModalOpen && (
          <TaskModal
            task={selectedTask}
            mode={modalMode}
            departmentId={departmentId}
            departmentName={departmentName}
            columns={columns}
            availableWorkers={availableWorkers}
            childDepartments={childDepartments}
            parentDepartmentId={parentDepartmentId}
            onSave={handleSaveTask}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedTask(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="task-board">
      <div className="task-board__header">
        <h3 className="task-board__title">
          📋 Задачи: {departmentName}
        </h3>
        <div className="task-board__actions">
          <button 
            className="task-board__add-btn"
            onClick={() => handleCreateTask()}
          >
            + Новая задача
          </button>
        </div>
      </div>

      <div className="task-board__columns">
        {columns.map((column) => {
          const columnTasks = getColumnTasks(column.id);
          const isDropTarget = dragOverColumn === column.id;

          return (
            <div 
              key={column.id}
              className={`task-board__column ${isDropTarget ? 'task-board__column--drop-target' : ''}`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="task-board__column-header">
                <div 
                  className="task-board__column-color"
                  style={{ backgroundColor: column.color }}
                />
                <span className="task-board__column-name">{column.name}</span>
                <span className="task-board__column-count">{columnTasks.length}</span>
                {!column.is_default && (
                  <button 
                    className="task-board__column-remove"
                    onClick={() => handleRemoveColumn(column.id)}
                    title="Удалить колонку"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="task-board__column-tasks">
                {columnTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onSelect={handleTaskSelect}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedTask?.id === task.id}
                  />
                ))}
                
                {columnTasks.length === 0 && (
                  <div className="task-board__column-empty">
                    Перетащите задачу сюда
                  </div>
                )}
              </div>

              <button 
                className="task-board__column-add-task"
                onClick={() => handleCreateTask(column.id)}
              >
                + Добавить задачу
              </button>
            </div>
          );
        })}

        {/* Add column button */}
        <div className="task-board__add-column">
          {showAddColumn ? (
            <div className="task-board__add-column-form">
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Название колонки"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                  if (e.key === 'Escape') setShowAddColumn(false);
                }}
              />
              <div className="task-board__add-column-actions">
                <button onClick={handleAddColumn}>✓</button>
                <button onClick={() => setShowAddColumn(false)}>×</button>
              </div>
            </div>
          ) : (
            <button 
              className="task-board__add-column-btn"
              onClick={() => setShowAddColumn(true)}
            >
              + Добавить колонку
            </button>
          )}
        </div>
      </div>

      {isModalOpen && (
        <TaskModal
          task={selectedTask}
          mode={modalMode}
          departmentId={departmentId}
          departmentName={departmentName}
          columns={columns}
          availableWorkers={availableWorkers}
          childDepartments={childDepartments}
          parentDepartmentId={parentDepartmentId}
          onSave={handleSaveTask}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}

export default TaskBoard;



