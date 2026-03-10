import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTaskStore, TASK_STATUSES } from '../../store/taskStore';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import './TaskBoard.css';

function TaskBoard({
  departmentId,
  departmentName = 'Департамент',
  availableWorkers = [],
  childDepartments = [],
  parentDepartmentId = null,
  viewMode = 'kanban',
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
    updateColumn,
    moveTask,
    createColumn,
    deleteColumn,
    initSocketListeners
  } = useTaskStore();

  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [editingColumnColor, setEditingColumnColor] = useState('#6b7280');

  useEffect(() => {
    initSocketListeners();

    if (departmentId) {
      loadColumns(departmentId);
      if (compact || viewMode === 'kanban') {
        loadTasks(departmentId, { includeSubtasks: true, includeIncoming: true });
      }
    }
  }, [compact, departmentId, viewMode, initSocketListeners, loadColumns, loadTasks]);

  const taskById = useMemo(() => (
    new Map(tasks.map(task => [task.id, task]))
  ), [tasks]);
  const taskIds = useMemo(() => new Set(tasks.map(task => task.id)), [tasks]);

  const isVisibleRootTask = useCallback((task) => {
    if (!task.parent_task_id) return true;

    const parentTask = taskById.get(task.parent_task_id);
    if (!parentTask) return true;

    // If the parent is outside this task's department (incoming parent),
    // treat the task as a "root" for the department board so it shows in columns.
    if (parentTask.department_id !== task.department_id) return true;

    return !taskIds.has(task.parent_task_id);
  }, [taskById, taskIds]);

  const rootTasks = useMemo(() => (
    tasks.filter(task => task.department_id === departmentId && isVisibleRootTask(task))
  ), [tasks, departmentId, isVisibleRootTask]);

  const incomingTasks = useMemo(() => (
    tasks.filter(task =>
      task.assigned_to_department_id === departmentId &&
      task.department_id !== departmentId &&
      isVisibleRootTask(task)
    )
  ), [tasks, departmentId, isVisibleRootTask]);

  const taskTree = useMemo(() => {
    const byParentId = tasks.reduce((acc, task) => {
      const parentId = task.parent_task_id || 'root';
      if (!acc.has(parentId)) {
        acc.set(parentId, []);
      }
      acc.get(parentId).push(task);
      return acc;
    }, new Map());

    const sortByCreatedAt = (items) => [...items].sort((a, b) => (
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    ));

    const buildBranch = (parentId = 'root', depth = 0) => (
      sortByCreatedAt(byParentId.get(parentId) || []).map(task => ({
        task,
        depth,
        children: buildBranch(task.id, depth + 1)
      }))
    );

    const visibleRootIds = new Set(tasks.filter(isVisibleRootTask).map(task => task.id));
    return buildBranch('root').filter(node => visibleRootIds.has(node.task.id));
  }, [tasks, isVisibleRootTask]);

  const getColumnTasks = useCallback((columnId) => (
    rootTasks.filter(task => task.column_id === columnId)
  ), [rootTasks]);

  const doneColumn = columns.length > 0 ? columns[columns.length - 1] : null;
  const columnsBeforeDone = doneColumn ? columns.slice(0, -1) : [];

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    setModalMode('view');
    setIsModalOpen(true);
    onTaskSelect?.(task);
  };

  const handleCreateTask = (columnId = null) => {
    setSelectedTask(columnId ? { column_id: columnId } : null);
    setModalMode('create');
    setIsModalOpen(true);
  };

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
      const columnIndex = columns.findIndex(c => c.id === columnId);
      let newStatus = 'in_progress';

      if (columnIndex === 0) newStatus = 'pending';
      else if (columnIndex === columns.length - 1) newStatus = 'completed';
      else if (columnIndex === columns.length - 2) newStatus = 'review';

      await moveTask(parseInt(taskId, 10), columnId, newStatus);
    }

    setDraggedTask(null);
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;

    const insertPosition = Math.max(columns.length - 1, 1);
    await createColumn(departmentId, newColumnName, '#6b7280', insertPosition);
    setNewColumnName('');
    setShowAddColumn(false);
  };

  const handleRemoveColumn = async (columnId) => {
    const confirmed = window.confirm('Удалить колонку? Задачи будут перемещены в первую колонку.');
    if (confirmed) {
      const firstColumnId = columns.find(c => c.id !== columnId)?.id;
      await deleteColumn(columnId, firstColumnId);
    }
  };

  const handleStartEditColumn = (column) => {
    setEditingColumnId(column.id);
    setEditingColumnName(column.name || '');
    setEditingColumnColor(column.color || '#6b7280');
  };

  const handleSaveColumnEdit = async () => {
    if (!editingColumnId || !editingColumnName.trim()) return;
    await updateColumn(editingColumnId, {
      name: editingColumnName.trim(),
      color: editingColumnColor
    });
    setEditingColumnId(null);
  };

  const renderTree = (nodes) => (
    nodes.map(({ task, depth, children }) => {
      const status = TASK_STATUSES[task.status] || TASK_STATUSES.pending;
      return (
        <div key={task.id} className="task-board__tree-node">
          <button
            type="button"
            className="task-board__tree-item"
            style={{ marginLeft: `${depth * 20}px` }}
            onClick={() => handleTaskSelect(task)}
          >
            <span
              className="task-board__tree-status"
              style={{ backgroundColor: status.color }}
            />
            <span className="task-board__tree-id">#{task.id}</span>
            <span className="task-board__tree-title">{task.title}</span>
            <span className="task-board__tree-meta">{status.name}</span>
          </button>
          {children.length > 0 && (
            <div className="task-board__tree-children">
              {renderTree(children)}
            </div>
          )}
        </div>
      );
    })
  );

  if (compact) {
    return (
      <div className="task-board task-board--compact">
        <div className="task-board__header">
          <h3 className="task-board__title">📋 Задачи</h3>
        </div>

        <div className="task-board__compact-list">
          {rootTasks.length === 0 ? (
            <div className="task-board__empty">Нет задач</div>
          ) : (
            rootTasks.slice(0, 5).map(task => (
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
        <h3 className="task-board__title">📋 Задачи: {departmentName}</h3>
      </div>

      {viewMode === 'list' ? (
        <div className="task-board__tree">
          {isLoading && taskTree.length === 0 ? (
            <div className="task-board__empty">Загрузка задач...</div>
          ) : taskTree.length === 0 ? (
            <div className="task-board__empty">Нет задач в области департамента</div>
          ) : (
            renderTree(taskTree)
          )}
        </div>
      ) : (
        <div className="task-board__workspace">
          <div className="task-board__overview">
            <div className="task-board__overview-card">
              <div className="task-board__overview-label">Задачи сверху</div>
              {incomingTasks.length === 0 ? (
                <div className="task-board__overview-empty">Нет входящих задач от родительских департаментов</div>
              ) : (
                <div className="task-board__overview-list">
                  {incomingTasks.map(task => (
                    <button
                      key={task.id}
                      type="button"
                      className="task-board__overview-item"
                      onClick={() => handleTaskSelect(task)}
                    >
                      <span className="task-board__overview-item-id">#{task.id}</span>
                      <span className="task-board__overview-item-title">{task.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="task-board__overview-card">
              <div className="task-board__overview-label">Работа департамента</div>
              <div className="task-board__overview-metrics">
                <div className="task-board__overview-metric">
                  <strong>{rootTasks.length}</strong>
                  <span>собственных задач</span>
                </div>
                <div className="task-board__overview-metric">
                  <strong>{incomingTasks.length}</strong>
                  <span>входящих задач</span>
                </div>
              </div>
            </div>
          </div>

          <div className="task-board__columns">
            {columns.length === 0 && (
              <div className="task-board__empty-state">
                <div className="task-board__empty-state-title">
                  {isLoading ? 'Подготавливаем доску департамента...' : 'У департамента пока нет колонок'}
                </div>
                <div className="task-board__empty-state-text">
                  Это и есть рабочая зона департамента: здесь будут колонки, входящие задачи и ваши внутренние подзадачи.
                </div>
                <div className="task-board__empty-state-actions">
                  <button className="task-board__add-column-btn" onClick={() => setShowAddColumn(true)}>
                    + Создать колонку
                  </button>
                </div>
              </div>
            )}

            {columnsBeforeDone.map((column) => {
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
                  <button
                    className="task-board__column-edit"
                    onClick={() => handleStartEditColumn(column)}
                    title="Редактировать колонку"
                  >
                    ✎
                  </button>
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
                      <div className="task-board__column-empty">Перетащите задачу сюда</div>
                    )}
                  </div>

                  <button
                    className="task-board__column-add-task"
                    onClick={() => handleCreateTask(column.id)}
                  >
                    + Добавить задачу
                </button>

                {editingColumnId === column.id && (
                  <div className="task-board__column-editor">
                    <input
                      type="text"
                      value={editingColumnName}
                      onChange={(e) => setEditingColumnName(e.target.value)}
                      placeholder="Название колонки"
                    />
                    <input
                      type="color"
                      value={editingColumnColor}
                      onChange={(e) => setEditingColumnColor(e.target.value)}
                    />
                    <div className="task-board__column-editor-actions">
                      <button onClick={handleSaveColumnEdit}>Сохранить</button>
                      <button onClick={() => setEditingColumnId(null)}>Отмена</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

            {doneColumn && (
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
            )}

            {doneColumn && (() => {
              const column = doneColumn;
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
                    <button
                      className="task-board__column-edit"
                      onClick={() => handleStartEditColumn(column)}
                      title="Редактировать колонку"
                    >
                      ✎
                    </button>
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
                      <div className="task-board__column-empty">Перетащите задачу сюда</div>
                    )}
                  </div>

                  <button
                    className="task-board__column-add-task"
                    onClick={() => handleCreateTask(column.id)}
                  >
                    + Добавить задачу
                  </button>

                  {editingColumnId === column.id && (
                    <div className="task-board__column-editor">
                      <input
                        type="text"
                        value={editingColumnName}
                        onChange={(e) => setEditingColumnName(e.target.value)}
                        placeholder="Название колонки"
                      />
                      <input
                        type="color"
                        value={editingColumnColor}
                        onChange={(e) => setEditingColumnColor(e.target.value)}
                      />
                      <div className="task-board__column-editor-actions">
                        <button onClick={handleSaveColumnEdit}>Сохранить</button>
                        <button onClick={() => setEditingColumnId(null)}>Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

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
