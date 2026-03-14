import { create } from 'zustand';
import socketService from '../services/socket';

const dedupeColumnsByPosition = (columns) => {
  const byPosition = new Map();
  columns.forEach((column) => {
    const existing = byPosition.get(column.position);
    if (!existing || column.id < existing.id) {
      byPosition.set(column.position, column);
    }
  });
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
};

// Task statuses
export const TASK_STATUSES = {
  pending: { id: 'pending', name: 'Ожидает', color: '#6b7280', icon: '⏳' },
  in_progress: { id: 'in_progress', name: 'В работе', color: '#3b82f6', icon: '🔄' },
  review: { id: 'review', name: 'На проверке', color: '#8b5cf6', icon: '👀' },
  revision: { id: 'revision', name: 'Доработка', color: '#f59e0b', icon: '📝' },
  completed: { id: 'completed', name: 'Готово', color: '#22c55e', icon: '✅' },
  cancelled: { id: 'cancelled', name: 'Отменено', color: '#ef4444', icon: '❌' },
  escalated: { id: 'escalated', name: 'Эскалировано', color: '#ec4899', icon: '⬆️' }
};

// Task priorities
export const TASK_PRIORITIES = {
  low: { id: 'low', name: 'Низкий', color: '#6b7280', icon: '🔽' },
  medium: { id: 'medium', name: 'Средний', color: '#3b82f6', icon: '➡️' },
  high: { id: 'high', name: 'Высокий', color: '#f59e0b', icon: '🔼' },
  critical: { id: 'critical', name: 'Критический', color: '#ef4444', icon: '🔴' }
};

// Default columns for kanban board
const DEFAULT_COLUMNS = [
  { name: 'Бэклог', color: '#6b7280' },
  { name: 'Готово', color: '#22c55e' }
];

export const useTaskStore = create((set, get) => ({
  // State
  tasks: [],
  columns: [],
  selectedTask: null,
  selectedDepartmentId: null,
  
  // Loading states
  isLoading: false,
  isDecomposing: false,
  isSaving: false,
  
  // Stats
  stats: null,
  
  // Socket initialization flag
  socketInitialized: false,

  // ============================================
  // SOCKET INITIALIZATION
  // ============================================

  initSocketListeners: () => {
    if (get().socketInitialized) return;

    // Task events
    socketService.on('task:created', ({ task }) => {
      set((state) => {
        if (state.tasks.find(t => t.id === task.id)) return state;
        return { tasks: [...state.tasks, task] };
      });
    });

    socketService.on('task:updated', ({ task }) => {
      set((state) => ({
        tasks: state.tasks.map(t => t.id === task.id ? task : t),
        selectedTask: state.selectedTask?.id === task.id ? task : state.selectedTask
      }));
    });

    socketService.on('task:moved', ({ task }) => {
      set((state) => ({
        tasks: state.tasks.map(t => t.id === task.id ? task : t)
      }));
    });

    socketService.on('task:deleted', ({ id }) => {
      set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id && t.parent_task_id !== id),
        selectedTask: state.selectedTask?.id === id ? null : state.selectedTask
      }));
    });

    socketService.on('task:assigned', ({ task, subtasks }) => {
      set((state) => ({
        tasks: state.tasks.map(t => t.id === task.id ? task : t).concat(subtasks || [])
      }));
    });

    socketService.on('task:decomposed', ({ taskId, subtasks }) => {
      set((state) => ({
        tasks: [...state.tasks, ...subtasks]
      }));
    });

    socketService.on('task:escalated', ({ task }) => {
      set((state) => ({
        tasks: state.tasks.map(t => t.id === task.id ? task : t)
      }));
    });

    socketService.on('task:reviewed', ({ task }) => {
      set((state) => ({
        tasks: state.tasks.map(t => t.id === task.id ? task : t)
      }));
    });

    socketService.on('task:report:added', ({ taskId, comment, task }) => {
      if (task) {
        set((state) => ({
          tasks: state.tasks.map(t => t.id === task.id ? task : t)
        }));
      }
    });

    // Column events
    socketService.on('task:column:created', ({ column, columns }) => {
      set((state) => ({
        columns: columns
          ? dedupeColumnsByPosition(columns)
          : dedupeColumnsByPosition([...state.columns, column])
      }));
    });

    socketService.on('task:column:updated', ({ column }) => {
      set((state) => ({
        columns: state.columns.map(c => c.id === column.id ? column : c)
      }));
    });

    socketService.on('task:column:deleted', ({ id }) => {
      set((state) => ({
        columns: state.columns.filter(c => c.id !== id)
      }));
    });

    socketService.on('task:columns:reordered', ({ columnOrder }) => {
      set((state) => ({
        columns: state.columns.sort((a, b) => 
          columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id)
        )
      }));
    });

    set({ socketInitialized: true });
    console.log('🔌 Task socket listeners initialized');
  },

  // ============================================
  // COLUMN OPERATIONS
  // ============================================

  loadColumns: async (departmentId) => {
    if (!departmentId) return;
    
    set({ isLoading: true });
    
    try {
      const result = await socketService.emit('task:columns:get', { departmentId });
      
      if (result.success) {
        set({ columns: dedupeColumnsByPosition(result.columns), selectedDepartmentId: departmentId });
      }
      
      return result;
    } catch (error) {
      console.error('Load columns error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  createColumn: async (departmentId, name, color, position) => {
    try {
      const result = await socketService.emit('task:column:create', {
        departmentId, name, color, position
      });
      
      if (result.success) {
        set((state) => ({
          columns: result.columns
            ? dedupeColumnsByPosition(result.columns)
            : dedupeColumnsByPosition([...state.columns, result.column])
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Create column error:', error);
      return { success: false, error: error.message };
    }
  },

  updateColumn: async (id, updates) => {
    try {
      const result = await socketService.emit('task:column:update', { id, ...updates });
      
      if (result.success) {
        set((state) => ({
          columns: state.columns.map(c => c.id === id ? result.column : c)
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Update column error:', error);
      return { success: false, error: error.message };
    }
  },

  deleteColumn: async (id, moveTasksToColumnId) => {
    try {
      const result = await socketService.emit('task:column:delete', { id, moveTasksToColumnId });
      
      if (result.success) {
        set((state) => ({
          columns: state.columns.filter(c => c.id !== id),
          tasks: moveTasksToColumnId 
            ? state.tasks.map(t => t.column_id === id ? { ...t, column_id: moveTasksToColumnId } : t)
            : state.tasks.filter(t => t.column_id !== id)
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Delete column error:', error);
      return { success: false, error: error.message };
    }
  },

  reorderColumns: async (departmentId, columnOrder) => {
    try {
      // Optimistic update
      set((state) => ({
        columns: state.columns
          .map(c => ({ ...c, position: columnOrder.indexOf(c.id) }))
          .sort((a, b) => a.position - b.position)
      }));
      
      const result = await socketService.emit('task:columns:reorder', { departmentId, columnOrder });
      return result;
    } catch (error) {
      console.error('Reorder columns error:', error);
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // TASK OPERATIONS
  // ============================================

  loadTasks: async (departmentId, options = {}) => {
    if (!departmentId) return;
    
    set({ isLoading: true });
    
    try {
      const normalizedOptions = typeof options === 'boolean'
        ? { includeSubtasks: options }
        : options;
      const result = await socketService.emit('task:list', {
        departmentId,
        includeSubtasks: normalizedOptions.includeSubtasks ?? false,
        departmentIds: normalizedOptions.departmentIds,
        includeIncoming: normalizedOptions.includeIncoming ?? false
      });
      
      if (result.success) {
        set({ tasks: result.tasks, selectedDepartmentId: departmentId });
      }
      
      return result;
    } catch (error) {
      console.error('Load tasks error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  loadAllTasks: async (options = {}) => {
    set({ isLoading: true });
    
    try {
      const result = await socketService.emit('task:list:all', options);
      
      if (result.success) {
        set({ tasks: result.tasks });
      }
      
      return result;
    } catch (error) {
      console.error('Load all tasks error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  loadTask: async (taskId) => {
    try {
      const result = await socketService.emit('task:get', { id: taskId });
      
      if (result.success) {
        set({ selectedTask: result.task });
      }
      
      return result;
    } catch (error) {
      console.error('Load task error:', error);
      return { success: false, error: error.message };
    }
  },

  createTask: async (taskData) => {
    set({ isSaving: true });
    
    try {
      const result = await socketService.emit('task:create', taskData);
      
      if (result.success) {
        set((state) => ({
          tasks: [...state.tasks, result.task]
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Create task error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isSaving: false });
    }
  },

  updateTask: async (taskId, updates) => {
    set({ isSaving: true });
    
    try {
      const result = await socketService.emit('task:update', { id: taskId, ...updates });
      
      if (result.success) {
        set((state) => ({
          tasks: state.tasks.map(t => t.id === taskId ? result.task : t),
          selectedTask: state.selectedTask?.id === taskId ? result.task : state.selectedTask
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Update task error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isSaving: false });
    }
  },

  moveTask: async (taskId, columnId, status) => {
    // Optimistic update
    set((state) => ({
      tasks: state.tasks.map(t => 
        t.id === taskId ? { ...t, column_id: columnId, status: status || t.status } : t
      )
    }));
    
    try {
      const result = await socketService.emit('task:move', { taskId, columnId, status });
      
      if (!result.success) {
        // Revert on failure
        get().loadTasks(get().selectedDepartmentId);
      }
      
      return result;
    } catch (error) {
      console.error('Move task error:', error);
      get().loadTasks(get().selectedDepartmentId);
      return { success: false, error: error.message };
    }
  },

  deleteTask: async (taskId) => {
    try {
      const result = await socketService.emit('task:delete', { id: taskId });
      
      if (result.success) {
        set((state) => ({
          tasks: state.tasks.filter(t => t.id !== taskId && t.parent_task_id !== taskId),
          selectedTask: state.selectedTask?.id === taskId ? null : state.selectedTask
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Delete task error:', error);
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // TASK ASSIGNMENT & WORKFLOW
  // ============================================

  assignTask: async (taskId, assignToWorkerId, assignToDepartmentId, autoDecompose = true) => {
    set({ isSaving: true });
    
    try {
      const result = await socketService.emit('task:assign', {
        taskId, assignToWorkerId, assignToDepartmentId, autoDecompose
      }, 60000); // Longer timeout for decomposition
      
      if (result.success) {
        set((state) => ({
          tasks: state.tasks
            .map(t => t.id === taskId ? result.task : t)
            .concat(result.subtasks || [])
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Assign task error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isSaving: false });
    }
  },

  decomposeTask: async (taskId, departmentContext = {}) => {
    set({ isDecomposing: true });
    
    try {
      const result = await socketService.emit('task:decompose', {
        taskId, departmentContext
      }, 60000); // Longer timeout for GPT
      
      if (result.success && result.subtasks?.length > 0) {
        set((state) => ({
          tasks: [...state.tasks, ...result.subtasks]
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Decompose task error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isDecomposing: false });
    }
  },

  escalateTask: async (taskId, parentDepartmentId, recommendations) => {
    set({ isSaving: true });
    
    try {
      const result = await socketService.emit('task:escalate', {
        taskId, parentDepartmentId, recommendations
      });
      
      if (result.success) {
        set((state) => ({
          tasks: state.tasks.map(t => t.id === taskId ? result.task : t)
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Escalate task error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isSaving: false });
    }
  },

  addReport: async (taskId, authorId, authorType, content, commentType, newStatus) => {
    try {
      const result = await socketService.emit('task:report', {
        taskId, authorId, authorType, content, commentType, newStatus
      });
      
      if (result.success && result.task) {
        set((state) => ({
          tasks: state.tasks.map(t => t.id === taskId ? result.task : t)
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Add report error:', error);
      return { success: false, error: error.message };
    }
  },

  reviewTask: async (taskId, action, feedback) => {
    set({ isSaving: true });
    
    try {
      const result = await socketService.emit('task:review', {
        taskId, action, feedback
      });
      
      if (result.success) {
        set((state) => ({
          tasks: state.tasks.map(t => t.id === taskId ? result.task : t)
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Review task error:', error);
      return { success: false, error: error.message };
    } finally {
      set({ isSaving: false });
    }
  },

  suggestAssignee: async (taskId, availableWorkers, childDepartments) => {
    try {
      const result = await socketService.emit('task:suggest-assignee', {
        taskId, availableWorkers, childDepartments
      }, 30000);
      
      return result;
    } catch (error) {
      console.error('Suggest assignee error:', error);
      return { success: false, error: error.message };
    }
  },

  // ============================================
  // STATS & SELECTION
  // ============================================

  loadStats: async (departmentId) => {
    try {
      const result = await socketService.emit('task:stats', { departmentId });
      
      if (result.success) {
        set({ stats: result.stats });
      }
      
      return result;
    } catch (error) {
      console.error('Load stats error:', error);
      return { success: false, error: error.message };
    }
  },

  selectTask: (task) => {
    set({ selectedTask: task });
  },

  clearSelection: () => {
    set({ selectedTask: null });
  },

  // ============================================
  // HELPER GETTERS
  // ============================================

  getTasksByColumn: (columnId) => {
    return get().tasks.filter(t => t.column_id === columnId && !t.parent_task_id);
  },

  getSubtasks: (parentTaskId) => {
    return get().tasks.filter(t => t.parent_task_id === parentTaskId);
  },

  getTasksByStatus: (status) => {
    return get().tasks.filter(t => t.status === status);
  },

  getTasksByDepartment: (departmentId) => {
    return get().tasks.filter(t => t.department_id === departmentId);
  },

  getOverdueTasks: () => {
    const now = new Date();
    return get().tasks.filter(t => 
      t.due_date && 
      new Date(t.due_date) < now && 
      !['completed', 'cancelled'].includes(t.status)
    );
  },

  getCriticalTasks: () => {
    return get().tasks.filter(t => 
      t.priority === 'critical' && 
      !['completed', 'cancelled'].includes(t.status)
    );
  },

  // Clear all state
  clearAll: () => {
    set({
      tasks: [],
      columns: [],
      selectedTask: null,
      selectedDepartmentId: null,
      stats: null,
      isLoading: false,
      isDecomposing: false,
      isSaving: false
    });
  }
}));
