// Socket.IO task handlers
// CRUD operations for tasks, columns, and task management logic

import pool from '../db.mjs';
import { userRooms } from './auth.mjs';
import { decomposeTask, suggestAssignee } from '../services/openai.mjs';

// Default columns for new departments
const DEFAULT_COLUMNS = [
  { name: 'Бэклог', color: '#6b7280', position: 0 },
  { name: 'К выполнению', color: '#3b82f6', position: 1 },
  { name: 'В работе', color: '#f59e0b', position: 2 },
  { name: 'На проверке', color: '#8b5cf6', position: 3 },
  { name: 'Готово', color: '#22c55e', position: 4 }
];

export function setupTaskHandlers(io, socket) {
  
  // Helper: broadcast to all user's connected clients except sender
  const broadcastToUser = (event, data) => {
    if (socket.userId) {
      socket.to(`user:${socket.userId}`).emit(event, data);
    }
  };

  // Helper: emit to all user's connected clients including sender
  const emitToUser = (event, data) => {
    if (socket.userId) {
      io.to(`user:${socket.userId}`).emit(event, data);
    }
  };

  // ============================================
  // COLUMN OPERATIONS
  // ============================================

  // Get columns for a department
  socket.on('task:columns:get', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { departmentId } = data;
      
      if (!departmentId) {
        return callback?.({ success: false, error: 'ID департамента обязателен' });
      }

      // Check if columns exist, if not create defaults
      let result = await pool.query(
        `SELECT * FROM task_columns 
         WHERE user_id = $1 AND department_id = $2 
         ORDER BY position ASC`,
        [socket.userId, departmentId]
      );

      if (result.rows.length === 0) {
        // Create default columns
        for (const col of DEFAULT_COLUMNS) {
          await pool.query(
            `INSERT INTO task_columns (user_id, department_id, name, position, color, is_default)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [socket.userId, departmentId, col.name, col.position, col.color]
          );
        }
        
        result = await pool.query(
          `SELECT * FROM task_columns 
           WHERE user_id = $1 AND department_id = $2 
           ORDER BY position ASC`,
          [socket.userId, departmentId]
        );
      }

      callback?.({ success: true, columns: result.rows });

    } catch (error) {
      console.error('Get columns error:', error);
      callback?.({ success: false, error: 'Ошибка получения колонок' });
    }
  });

  // Create column
  socket.on('task:column:create', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { departmentId, name, color, position } = data;
      
      if (!departmentId || !name) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      const result = await pool.query(
        `INSERT INTO task_columns (user_id, department_id, name, position, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [socket.userId, departmentId, name, position || 0, color || '#6b7280']
      );

      const column = result.rows[0];
      
      console.log(`📋 Column created: ${column.name} for dept ${departmentId}`);
      
      broadcastToUser('task:column:created', { column });
      callback?.({ success: true, column });

    } catch (error) {
      console.error('Create column error:', error);
      callback?.({ success: false, error: 'Ошибка создания колонки' });
    }
  });

  // Update column
  socket.on('task:column:update', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, name, color, position } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID колонки обязателен' });
      }

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (color !== undefined) {
        updates.push(`color = $${paramIndex++}`);
        values.push(color);
      }
      if (position !== undefined) {
        updates.push(`position = $${paramIndex++}`);
        values.push(position);
      }

      if (updates.length === 0) {
        return callback?.({ success: true });
      }

      values.push(id, socket.userId);

      const result = await pool.query(
        `UPDATE task_columns 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return callback?.({ success: false, error: 'Колонка не найдена' });
      }

      const column = result.rows[0];
      
      broadcastToUser('task:column:updated', { column });
      callback?.({ success: true, column });

    } catch (error) {
      console.error('Update column error:', error);
      callback?.({ success: false, error: 'Ошибка обновления колонки' });
    }
  });

  // Delete column
  socket.on('task:column:delete', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, moveTasksToColumnId } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID колонки обязателен' });
      }

      // Move tasks to another column if specified
      if (moveTasksToColumnId) {
        await pool.query(
          `UPDATE tasks SET column_id = $1 WHERE column_id = $2 AND user_id = $3`,
          [moveTasksToColumnId, id, socket.userId]
        );
      }

      await pool.query(
        `DELETE FROM task_columns WHERE id = $1 AND user_id = $2`,
        [id, socket.userId]
      );

      console.log(`🗑️ Column deleted: ${id}`);
      
      broadcastToUser('task:column:deleted', { id, moveTasksToColumnId });
      callback?.({ success: true });

    } catch (error) {
      console.error('Delete column error:', error);
      callback?.({ success: false, error: 'Ошибка удаления колонки' });
    }
  });

  // Reorder columns
  socket.on('task:columns:reorder', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { departmentId, columnOrder } = data;
      
      if (!departmentId || !Array.isArray(columnOrder)) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      // Update positions for all columns
      for (let i = 0; i < columnOrder.length; i++) {
        await pool.query(
          `UPDATE task_columns SET position = $1 
           WHERE id = $2 AND user_id = $3 AND department_id = $4`,
          [i, columnOrder[i], socket.userId, departmentId]
        );
      }

      broadcastToUser('task:columns:reordered', { departmentId, columnOrder });
      callback?.({ success: true });

    } catch (error) {
      console.error('Reorder columns error:', error);
      callback?.({ success: false, error: 'Ошибка сортировки колонок' });
    }
  });

  // ============================================
  // TASK OPERATIONS
  // ============================================

  // Get tasks for a department
  socket.on('task:list', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { departmentId, includeSubtasks } = data;
      
      if (!departmentId) {
        return callback?.({ success: false, error: 'ID департамента обязателен' });
      }

      let query = `
        SELECT t.*, 
               tc.name as column_name,
               tc.color as column_color,
               (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) as subtask_count,
               (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') as completed_subtask_count
        FROM tasks t
        LEFT JOIN task_columns tc ON t.column_id = tc.id
        WHERE t.user_id = $1 AND t.department_id = $2
      `;
      
      if (!includeSubtasks) {
        query += ` AND t.parent_task_id IS NULL`;
      }
      
      query += ` ORDER BY t.created_at DESC`;

      const result = await pool.query(query, [socket.userId, departmentId]);

      callback?.({ success: true, tasks: result.rows });

    } catch (error) {
      console.error('List tasks error:', error);
      callback?.({ success: false, error: 'Ошибка получения задач' });
    }
  });

  // Get all tasks for user (across all departments)
  socket.on('task:list:all', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { status, assignedToMe, limit = 100 } = data || {};

      let query = `
        SELECT t.*, 
               tc.name as column_name,
               tc.color as column_color,
               (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) as subtask_count,
               (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') as completed_subtask_count
        FROM tasks t
        LEFT JOIN task_columns tc ON t.column_id = tc.id
        WHERE t.user_id = $1
      `;
      
      const params = [socket.userId];
      let paramIndex = 2;

      if (status) {
        query += ` AND t.status = $${paramIndex++}`;
        params.push(status);
      }

      if (assignedToMe) {
        query += ` AND (t.assigned_to_worker_id IS NOT NULL OR t.assigned_to_department_id IS NOT NULL)`;
      }

      query += ` ORDER BY t.updated_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await pool.query(query, params);

      callback?.({ success: true, tasks: result.rows });

    } catch (error) {
      console.error('List all tasks error:', error);
      callback?.({ success: false, error: 'Ошибка получения задач' });
    }
  });

  // Get single task with subtasks
  socket.on('task:get', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID задачи обязателен' });
      }

      // Get task
      const taskResult = await pool.query(
        `SELECT t.*, 
                tc.name as column_name,
                tc.color as column_color
         FROM tasks t
         LEFT JOIN task_columns tc ON t.column_id = tc.id
         WHERE t.id = $1 AND t.user_id = $2`,
        [id, socket.userId]
      );

      if (taskResult.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = taskResult.rows[0];

      // Get subtasks
      const subtasksResult = await pool.query(
        `SELECT t.*, 
                tc.name as column_name,
                tc.color as column_color
         FROM tasks t
         LEFT JOIN task_columns tc ON t.column_id = tc.id
         WHERE t.parent_task_id = $1 AND t.user_id = $2
         ORDER BY t.created_at ASC`,
        [id, socket.userId]
      );

      // Get comments
      const commentsResult = await pool.query(
        `SELECT * FROM task_comments 
         WHERE task_id = $1 
         ORDER BY created_at ASC`,
        [id]
      );

      callback?.({ 
        success: true, 
        task: {
          ...task,
          subtasks: subtasksResult.rows,
          comments: commentsResult.rows
        }
      });

    } catch (error) {
      console.error('Get task error:', error);
      callback?.({ success: false, error: 'Ошибка получения задачи' });
    }
  });

  // Create task
  socket.on('task:create', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { 
        departmentId, 
        columnId, 
        parentTaskId,
        title, 
        description, 
        priority,
        dueDate,
        estimatedHours,
        createdByDepartmentId
      } = data;
      
      if (!departmentId || !title) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      // Get first column if not specified
      let finalColumnId = columnId;
      if (!finalColumnId) {
        const colResult = await pool.query(
          `SELECT id FROM task_columns 
           WHERE user_id = $1 AND department_id = $2 
           ORDER BY position ASC LIMIT 1`,
          [socket.userId, departmentId]
        );
        if (colResult.rows.length > 0) {
          finalColumnId = colResult.rows[0].id;
        }
      }

      const result = await pool.query(
        `INSERT INTO tasks (
          user_id, department_id, column_id, parent_task_id,
          title, description, priority, due_date, estimated_hours,
          created_by_department_id, status
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
         RETURNING *`,
        [
          socket.userId, departmentId, finalColumnId, parentTaskId || null,
          title, description || '', priority || 'medium', 
          dueDate || null, estimatedHours || null,
          createdByDepartmentId || departmentId
        ]
      );

      const task = result.rows[0];

      console.log(`✨ Task created: "${title}" in dept ${departmentId}`);

      // Add system comment
      await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
         VALUES ($1, $2, 'system', $3, 'status_change')`,
        [task.id, departmentId, 'Задача создана']
      );

      broadcastToUser('task:created', { task });
      callback?.({ success: true, task });

    } catch (error) {
      console.error('Create task error:', error);
      callback?.({ success: false, error: 'Ошибка создания задачи' });
    }
  });

  // Update task
  socket.on('task:update', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, ...updates } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID задачи обязателен' });
      }

      const allowedFields = [
        'title', 'description', 'priority', 'status', 
        'column_id', 'due_date', 'estimated_hours', 'actual_hours',
        'recommendations'
      ];

      const updateParts = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (allowedFields.includes(dbKey)) {
          updateParts.push(`${dbKey} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (updateParts.length === 0) {
        return callback?.({ success: true });
      }

      values.push(id, socket.userId);

      const result = await pool.query(
        `UPDATE tasks 
         SET ${updateParts.join(', ')}
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = result.rows[0];

      console.log(`📝 Task updated: ${id}`);

      broadcastToUser('task:updated', { task });
      callback?.({ success: true, task });

    } catch (error) {
      console.error('Update task error:', error);
      callback?.({ success: false, error: 'Ошибка обновления задачи' });
    }
  });

  // Move task to different column
  socket.on('task:move', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, columnId, status } = data;
      
      if (!taskId || !columnId) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      const updates = ['column_id = $1'];
      const values = [columnId];
      let paramIndex = 2;

      if (status) {
        updates.push(`status = $${paramIndex++}`);
        values.push(status);
      }

      values.push(taskId, socket.userId);

      const result = await pool.query(
        `UPDATE tasks 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = result.rows[0];

      console.log(`📦 Task moved: ${taskId} to column ${columnId}`);

      broadcastToUser('task:moved', { task });
      callback?.({ success: true, task });

    } catch (error) {
      console.error('Move task error:', error);
      callback?.({ success: false, error: 'Ошибка перемещения задачи' });
    }
  });

  // Delete task
  socket.on('task:delete', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID задачи обязателен' });
      }

      // Get task info before deleting
      const taskResult = await pool.query(
        `SELECT department_id FROM tasks WHERE id = $1 AND user_id = $2`,
        [id, socket.userId]
      );

      if (taskResult.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const departmentId = taskResult.rows[0].department_id;

      // Delete task (cascades to subtasks and comments)
      await pool.query(
        `DELETE FROM tasks WHERE id = $1 AND user_id = $2`,
        [id, socket.userId]
      );

      console.log(`🗑️ Task deleted: ${id}`);

      broadcastToUser('task:deleted', { id, departmentId });
      callback?.({ success: true });

    } catch (error) {
      console.error('Delete task error:', error);
      callback?.({ success: false, error: 'Ошибка удаления задачи' });
    }
  });

  // ============================================
  // TASK ASSIGNMENT & WORKFLOW
  // ============================================

  // Assign task to worker or child department
  socket.on('task:assign', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, assignToWorkerId, assignToDepartmentId, autoDecompose } = data;
      
      if (!taskId || (!assignToWorkerId && !assignToDepartmentId)) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      // Update task assignment
      const result = await pool.query(
        `UPDATE tasks 
         SET assigned_to_worker_id = $1,
             assigned_to_department_id = $2,
             status = 'in_progress'
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [assignToWorkerId || null, assignToDepartmentId || null, taskId, socket.userId]
      );

      if (result.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = result.rows[0];

      // Add assignment comment
      const assigneeName = assignToWorkerId || assignToDepartmentId;
      await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
         VALUES ($1, $2, 'system', $3, 'assignment')`,
        [taskId, task.department_id, `Задача назначена: ${assigneeName}`]
      );

      console.log(`👤 Task ${taskId} assigned to ${assigneeName}`);

      // If assigned to department and autoDecompose is true, trigger decomposition
      let subtasks = [];
      if (assignToDepartmentId && autoDecompose) {
        try {
          const decompositionResult = await decomposeTask(task, { departmentId: assignToDepartmentId });
          
          if (decompositionResult?.subtasks?.length > 0) {
            // Create subtasks
            for (const subtask of decompositionResult.subtasks) {
              const subtaskResult = await pool.query(
                `INSERT INTO tasks (
                  user_id, department_id, parent_task_id,
                  title, description, priority, estimated_hours, status
                )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
                 RETURNING *`,
                [
                  socket.userId, assignToDepartmentId, taskId,
                  subtask.title, subtask.description || '',
                  subtask.priority || task.priority,
                  subtask.estimatedHours || null
                ]
              );
              subtasks.push(subtaskResult.rows[0]);
            }

            // Add decomposition comment
            await pool.query(
              `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
               VALUES ($1, $2, 'system', $3, 'status_change')`,
              [taskId, assignToDepartmentId, `Задача декомпозирована на ${subtasks.length} подзадач`]
            );

            console.log(`🔄 Task ${taskId} decomposed into ${subtasks.length} subtasks`);
          }
        } catch (decomposeError) {
          console.error('Decompose error:', decomposeError);
          // Continue without decomposition
        }
      }

      broadcastToUser('task:assigned', { task, subtasks });
      callback?.({ success: true, task, subtasks });

    } catch (error) {
      console.error('Assign task error:', error);
      callback?.({ success: false, error: 'Ошибка назначения задачи' });
    }
  });

  // Decompose task manually
  socket.on('task:decompose', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, departmentContext } = data;
      
      if (!taskId) {
        return callback?.({ success: false, error: 'ID задачи обязателен' });
      }

      // Get task
      const taskResult = await pool.query(
        `SELECT * FROM tasks WHERE id = $1 AND user_id = $2`,
        [taskId, socket.userId]
      );

      if (taskResult.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = taskResult.rows[0];

      // Call GPT decomposition
      const decompositionResult = await decomposeTask(task, departmentContext || {});

      if (!decompositionResult?.subtasks?.length) {
        return callback?.({ success: true, subtasks: [], message: 'Декомпозиция не требуется' });
      }

      // Create subtasks
      const subtasks = [];
      const targetDepartmentId = task.assigned_to_department_id || task.department_id;
      
      for (const subtask of decompositionResult.subtasks) {
        const subtaskResult = await pool.query(
          `INSERT INTO tasks (
            user_id, department_id, parent_task_id,
            title, description, priority, estimated_hours, status
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
           RETURNING *`,
          [
            socket.userId, targetDepartmentId, taskId,
            subtask.title, subtask.description || '',
            subtask.priority || task.priority,
            subtask.estimatedHours || null
          ]
        );
        subtasks.push(subtaskResult.rows[0]);
      }

      // Add decomposition comment
      await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
         VALUES ($1, $2, 'system', $3, 'status_change')`,
        [taskId, task.department_id, `Задача декомпозирована на ${subtasks.length} подзадач`]
      );

      console.log(`🔄 Task ${taskId} manually decomposed into ${subtasks.length} subtasks`);

      broadcastToUser('task:decomposed', { taskId, subtasks });
      callback?.({ success: true, subtasks, analysis: decompositionResult.analysis });

    } catch (error) {
      console.error('Decompose task error:', error);
      callback?.({ success: false, error: error.message || 'Ошибка декомпозиции задачи' });
    }
  });

  // Escalate task to parent department
  socket.on('task:escalate', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, parentDepartmentId, recommendations } = data;
      
      if (!taskId || !parentDepartmentId) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      // Update task
      const result = await pool.query(
        `UPDATE tasks 
         SET status = 'escalated',
             department_id = $1,
             recommendations = $2,
             assigned_to_worker_id = NULL,
             assigned_to_department_id = NULL
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [parentDepartmentId, recommendations || '', taskId, socket.userId]
      );

      if (result.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = result.rows[0];

      // Add escalation comment
      await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
         VALUES ($1, $2, 'system', $3, 'escalation')`,
        [taskId, task.department_id, `Задача эскалирована. Рекомендации: ${recommendations || 'нет'}`]
      );

      console.log(`⬆️ Task ${taskId} escalated to ${parentDepartmentId}`);

      broadcastToUser('task:escalated', { task });
      callback?.({ success: true, task });

    } catch (error) {
      console.error('Escalate task error:', error);
      callback?.({ success: false, error: 'Ошибка эскалации задачи' });
    }
  });

  // Add report/comment to task
  socket.on('task:report', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, authorId, authorType, content, commentType, newStatus } = data;
      
      if (!taskId || !authorId || !content) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      // Add comment
      const commentResult = await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [taskId, authorId, authorType || 'worker', content, commentType || 'report']
      );

      const comment = commentResult.rows[0];

      // Update task status if specified
      let task = null;
      if (newStatus) {
        const taskResult = await pool.query(
          `UPDATE tasks SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
          [newStatus, taskId, socket.userId]
        );
        task = taskResult.rows[0];
      }

      console.log(`📝 Report added to task ${taskId}`);

      broadcastToUser('task:report:added', { taskId, comment, task });
      callback?.({ success: true, comment, task });

    } catch (error) {
      console.error('Add report error:', error);
      callback?.({ success: false, error: 'Ошибка добавления отчета' });
    }
  });

  // Review task (accept/reject/request revision)
  socket.on('task:review', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, action, feedback } = data;
      
      if (!taskId || !action) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      let newStatus;
      let commentContent;

      switch (action) {
        case 'accept':
          newStatus = 'completed';
          commentContent = `Задача принята${feedback ? ': ' + feedback : ''}`;
          break;
        case 'reject':
          newStatus = 'cancelled';
          commentContent = `Задача отклонена${feedback ? ': ' + feedback : ''}`;
          break;
        case 'revision':
          newStatus = 'revision';
          commentContent = `Отправлено на доработку${feedback ? ': ' + feedback : ''}`;
          break;
        case 'reassign':
          newStatus = 'pending';
          commentContent = `Задача переназначена${feedback ? ': ' + feedback : ''}`;
          break;
        default:
          return callback?.({ success: false, error: 'Неизвестное действие' });
      }

      // Update task status
      const result = await pool.query(
        `UPDATE tasks SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
        [newStatus, taskId, socket.userId]
      );

      if (result.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = result.rows[0];

      // Add review comment
      await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
         VALUES ($1, $2, 'department', $3, 'status_change')`,
        [taskId, task.department_id, commentContent]
      );

      console.log(`✅ Task ${taskId} reviewed: ${action}`);

      broadcastToUser('task:reviewed', { task, action, feedback });
      callback?.({ success: true, task });

    } catch (error) {
      console.error('Review task error:', error);
      callback?.({ success: false, error: 'Ошибка проверки задачи' });
    }
  });

  // Get task statistics for department
  socket.on('task:stats', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { departmentId } = data;
      
      let whereClause = 'WHERE user_id = $1';
      const params = [socket.userId];

      if (departmentId) {
        whereClause += ' AND department_id = $2';
        params.push(departmentId);
      }

      const result = await pool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'pending') as pending,
           COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
           COUNT(*) FILTER (WHERE status = 'review') as review,
           COUNT(*) FILTER (WHERE status = 'revision') as revision,
           COUNT(*) FILTER (WHERE status = 'completed') as completed,
           COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
           COUNT(*) FILTER (WHERE status = 'escalated') as escalated,
           COUNT(*) FILTER (WHERE priority = 'critical') as critical,
           COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
           COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled')) as overdue
         FROM tasks ${whereClause}`,
        params
      );

      callback?.({ success: true, stats: result.rows[0] });

    } catch (error) {
      console.error('Get stats error:', error);
      callback?.({ success: false, error: 'Ошибка получения статистики' });
    }
  });

  // Suggest assignee using GPT
  socket.on('task:suggest-assignee', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { taskId, availableWorkers, childDepartments } = data;
      
      if (!taskId) {
        return callback?.({ success: false, error: 'ID задачи обязателен' });
      }

      // Get task
      const taskResult = await pool.query(
        `SELECT * FROM tasks WHERE id = $1 AND user_id = $2`,
        [taskId, socket.userId]
      );

      if (taskResult.rows.length === 0) {
        return callback?.({ success: false, error: 'Задача не найдена' });
      }

      const task = taskResult.rows[0];

      // Call GPT suggestion
      const suggestion = await suggestAssignee(task, availableWorkers || [], childDepartments || []);

      callback?.({ success: true, suggestion });

    } catch (error) {
      console.error('Suggest assignee error:', error);
      callback?.({ success: false, error: error.message || 'Ошибка получения рекомендации' });
    }
  });
}

export default { setupTaskHandlers };



