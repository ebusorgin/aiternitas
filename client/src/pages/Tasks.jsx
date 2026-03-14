import { useEffect, useMemo, useState } from 'react';
import { useTaskStore, TASK_STATUSES, TASK_PRIORITIES } from '../store/taskStore';
import { useFlowchartStore } from '../store/flowchartStore';
import { useAuth } from '../context/AuthContext';
import TaskBoard from '../components/tasks/TaskBoard';
import TaskCard from '../components/tasks/TaskCard';
import TaskModal from '../components/tasks/TaskModal';
import './Tasks.css';

function Tasks() {
  const { user, socketConnected } = useAuth();
  const {
    tasks,
    columns,
    stats,
    isLoading,
    loadAllTasks,
    loadStats,
    initSocketListeners
  } = useTaskStore();

  const { elements, loadFlowchart, initSocketListeners: initFlowchartSocketListeners } = useFlowchartStore();

  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list'
  const [filter, setFilter] = useState({
    status: '',
    priority: '',
    search: ''
  });
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState({});

  // Get departments from flowchart elements
  const departments = useMemo(() => (
    elements.filter(el => el.type === 'department')
  ), [elements]);
  const departmentsById = useMemo(() => (
    departments.reduce((acc, department) => {
      acc[department.id] = department;
      return acc;
    }, {})
  ), [departments]);
  const departmentsByParent = useMemo(() => (
    departments.reduce((acc, department) => {
      const parentId = department.parentId || 'root';
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(department);
      return acc;
    }, {})
  ), [departments]);

  const rootDepartments = useMemo(() => (
    [...(departmentsByParent.root || [])].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  ), [departmentsByParent]);

  // Initialize
  useEffect(() => {
    initSocketListeners();
    loadAllTasks();
    loadStats();
  }, [initSocketListeners, loadAllTasks, loadStats]);

  useEffect(() => {
    if (socketConnected) {
      initFlowchartSocketListeners();
    }
  }, [socketConnected, initFlowchartSocketListeners]);

  useEffect(() => {
    if (user && socketConnected) {
      loadFlowchart();
    }
  }, [user, socketConnected, loadFlowchart]);

  useEffect(() => {
    if (!selectedDepartment) return;

    const expandedPath = {};
    let currentParentId = selectedDepartment.parentId;

    while (currentParentId) {
      expandedPath[currentParentId] = true;
      currentParentId = departmentsById[currentParentId]?.parentId || null;
    }

    if (Object.keys(expandedPath).length === 0) return;

    setExpandedDepartments(prev => {
      const hasChanges = Object.entries(expandedPath).some(([departmentId, isExpanded]) => (
        prev[departmentId] !== isExpanded
      ));

      if (!hasChanges) {
        return prev;
      }

      return { ...prev, ...expandedPath };
    });
  }, [departmentsById, selectedDepartment]);

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (filter.status && task.status !== filter.status) return false;
    if (filter.priority && task.priority !== filter.priority) return false;
    if (filter.search) {
      const search = filter.search.toLowerCase();
      if (!task.title.toLowerCase().includes(search) && 
          !task.description?.toLowerCase().includes(search)) {
        return false;
      }
    }
    return true;
  });

  // Get workers and child departments for selected department
  const getAvailableWorkers = (deptId) => {
    return elements.filter(el => el.parentId === deptId && el.type === 'worker');
  };

  const getChildDepartments = (deptId) => {
    return elements.filter(el => el.parentId === deptId && el.type === 'department');
  };

  const getParentDepartment = (deptId) => {
    const dept = elements.find(el => el.id === deptId);
    if (dept?.parentId) {
      return elements.find(el => el.id === dept.parentId);
    }
    return null;
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const toggleDepartment = (departmentId) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [departmentId]: !prev[departmentId]
    }));
  };

  const renderDepartmentTree = (parentId = 'root', depth = 0) => {
    const branch = [...(departmentsByParent[parentId] || [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return branch.map((dept) => {
      const childDepartments = departmentsByParent[dept.id] || [];
      const isExpanded = !!expandedDepartments[dept.id];
      const deptTasks = tasks.filter(t => t.department_id === dept.id);

      return (
        <div key={dept.id} className="tasks-page__dept-node">
          <div
            className={`tasks-page__dept-item ${selectedDepartment?.id === dept.id ? 'active' : ''}`}
            style={{ paddingLeft: `${12 + depth * 18}px` }}
          >
            {childDepartments.length > 0 ? (
              <button
                type="button"
                className={`tasks-page__dept-toggle ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleDepartment(dept.id)}
                aria-label={isExpanded ? 'Свернуть департамент' : 'Развернуть департамент'}
              >
                ▸
              </button>
            ) : (
              <span className="tasks-page__dept-spacer" />
            )}

            <button
              type="button"
              className="tasks-page__dept-select"
              onClick={() => setSelectedDepartment(dept)}
            >
              <span
                className="dept-color"
                style={{ backgroundColor: dept.color }}
              />
              <span className="dept-name">{dept.name}</span>
              <span className="dept-count">{deptTasks.length}</span>
            </button>
          </div>

          {childDepartments.length > 0 && isExpanded && renderDepartmentTree(dept.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="tasks-page">
      <div className="tasks-page__header">
        <div className="tasks-page__title-section">
          <h1 className="tasks-page__title">📋 Задачи</h1>
          {stats && (
            <div className="tasks-page__stats">
              <span className="tasks-page__stat">
                <span className="stat-dot" style={{ background: '#6b7280' }}></span>
                Всего: {stats.total}
              </span>
              <span className="tasks-page__stat">
                <span className="stat-dot" style={{ background: '#3b82f6' }}></span>
                В работе: {stats.in_progress}
              </span>
              <span className="tasks-page__stat">
                <span className="stat-dot" style={{ background: '#22c55e' }}></span>
                Готово: {stats.completed}
              </span>
              {parseInt(stats.overdue) > 0 && (
                <span className="tasks-page__stat tasks-page__stat--overdue">
                  <span className="stat-dot" style={{ background: '#ef4444' }}></span>
                  Просрочено: {stats.overdue}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="tasks-page__controls">
          {/* View mode toggle */}
          <div className="tasks-page__view-toggle">
            <button 
              className={viewMode === 'kanban' ? 'active' : ''}
              onClick={() => setViewMode('kanban')}
            >
              📊 Канбан
            </button>
            <button 
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              📝 Список
            </button>
          </div>

          {/* Filters */}
          <div className="tasks-page__filters">
            <select
              value={filter.status}
              onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
            >
              <option value="">Все статусы</option>
              {Object.values(TASK_STATUSES).map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>

            <select
              value={filter.priority}
              onChange={(e) => setFilter(f => ({ ...f, priority: e.target.value }))}
            >
              <option value="">Все приоритеты</option>
              {Object.values(TASK_PRIORITIES).map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="🔍 Поиск..."
              value={filter.search}
              onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="tasks-page__content">
        {/* Department sidebar */}
        <div className="tasks-page__departments">
          <h3>Департаменты</h3>
          
          <button 
            className={`tasks-page__dept-item ${!selectedDepartment ? 'active' : ''}`}
            onClick={() => {
              setSelectedDepartment(null);
              loadAllTasks();
            }}
          >
            <span className="tasks-page__dept-spacer" />
            <span className="tasks-page__dept-select">
              <span className="dept-icon">🏢</span>
              <span className="dept-name">Все задачи</span>
              <span className="dept-count">{tasks.length}</span>
            </span>
          </button>

          {rootDepartments.length === 0 ? (
            <div className="tasks-page__dept-empty">Нет департаментов</div>
          ) : (
            renderDepartmentTree()
          )}
        </div>

        {/* Main content area */}
        <div className="tasks-page__main">
          {!selectedDepartment && isLoading ? (
            <div className="tasks-page__loading">
              <div className="loader-spinner"></div>
              <span>Загрузка задач...</span>
            </div>
          ) : selectedDepartment ? (
            <TaskBoard
              departmentId={selectedDepartment.id}
              departmentName={selectedDepartment.name}
              availableWorkers={getAvailableWorkers(selectedDepartment.id)}
              childDepartments={getChildDepartments(selectedDepartment.id)}
              parentDepartmentId={getParentDepartment(selectedDepartment.id)?.id}
              viewMode={viewMode}
              onTaskSelect={handleTaskSelect}
            />
          ) : viewMode === 'kanban' ? (
            // Show grouped by department
            <div className="tasks-page__departments-grid">
              {departments.length === 0 ? (
                <div className="tasks-page__empty">
                  <div className="empty-icon">🏢</div>
                  <h3>Нет департаментов</h3>
                  <p>Создайте организационную структуру в разделе &quot;Мои компании&quot;</p>
                </div>
              ) : (
                departments.map(dept => {
                  const deptTasks = filteredTasks.filter(t => t.department_id === dept.id);
                  return (
                    <div key={dept.id} className="tasks-page__dept-section">
                      <div 
                        className="tasks-page__dept-header"
                        onClick={() => setSelectedDepartment(dept)}
                      >
                        <span 
                          className="dept-color-bar" 
                          style={{ backgroundColor: dept.color }}
                        />
                        <h4>{dept.name}</h4>
                        <span className="dept-task-count">{deptTasks.length} задач</span>
                        <span className="dept-expand">→</span>
                      </div>
                      
                      <div className="tasks-page__dept-tasks">
                        {deptTasks.slice(0, 3).map(task => (
                          <TaskCard 
                            key={task.id} 
                            task={task} 
                            compact 
                            onSelect={handleTaskSelect}
                          />
                        ))}
                        {deptTasks.length > 3 && (
                          <button 
                            className="tasks-page__see-more"
                            onClick={() => setSelectedDepartment(dept)}
                          >
                            Ещё {deptTasks.length - 3} задач →
                          </button>
                        )}
                        {deptTasks.length === 0 && (
                          <div className="tasks-page__dept-empty">
                            Нет задач
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // List view
            <div className="tasks-page__list">
              {filteredTasks.length === 0 ? (
                <div className="tasks-page__empty">
                  <div className="empty-icon">📋</div>
                  <h3>Нет задач</h3>
                  <p>Выберите департамент слева, чтобы создать задачу</p>
                </div>
              ) : (
                <table className="tasks-page__table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Название</th>
                      <th>Статус</th>
                      <th>Приоритет</th>
                      <th>Департамент</th>
                      <th>Дедлайн</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map(task => {
                      const status = TASK_STATUSES[task.status] || TASK_STATUSES.pending;
                      const priority = TASK_PRIORITIES[task.priority] || TASK_PRIORITIES.medium;
                      const dept = departments.find(d => d.id === task.department_id);
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date() && 
                        !['completed', 'cancelled'].includes(task.status);

                      return (
                        <tr 
                          key={task.id}
                          onClick={() => handleTaskSelect(task)}
                          className={isOverdue ? 'overdue' : ''}
                        >
                          <td className="task-id">#{task.id}</td>
                          <td className="task-title">{task.title}</td>
                          <td>
                            <span 
                              className="task-status-badge"
                              style={{ backgroundColor: status.color }}
                            >
                              {status.icon} {status.name}
                            </span>
                          </td>
                          <td>
                            <span 
                              className="task-priority-badge"
                              style={{ backgroundColor: priority.color }}
                            >
                              {priority.icon}
                            </span>
                          </td>
                          <td>
                            <span className="task-dept">
                              <span 
                                className="dept-dot"
                                style={{ backgroundColor: dept?.color || '#6b7280' }}
                              />
                              {dept?.name || 'Не указан'}
                            </span>
                          </td>
                          <td className={`task-due ${isOverdue ? 'overdue' : ''}`}>
                            {task.due_date 
                              ? new Date(task.due_date).toLocaleDateString('ru-RU')
                              : '—'
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task modal */}
      {isModalOpen && selectedTask && (
        <TaskModal
          task={selectedTask}
          mode="view"
          departmentId={selectedTask.department_id}
          departmentName={departments.find(d => d.id === selectedTask.department_id)?.name}
          columns={columns}
          availableWorkers={getAvailableWorkers(selectedTask.department_id)}
          childDepartments={getChildDepartments(selectedTask.department_id)}
          parentDepartmentId={getParentDepartment(selectedTask.department_id)?.id}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}

export default Tasks;
