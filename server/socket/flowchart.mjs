// Socket.IO flowchart handlers
// Real-time CRUD operations with instant DB persistence

import pool from '../db.mjs';
import { userRooms } from './auth.mjs';
import { generateCompanyStructure, convertToFlowchartElements } from '../services/openai.mjs';
import { v4 as uuidv4 } from 'uuid';

export function setupFlowchartHandlers(io, socket) {
  
  // Helper: broadcast to all user's connected clients except sender
  const broadcastToUser = (event, data) => {
    if (socket.userId) {
      socket.to(`user:${socket.userId}`).emit(event, data);
    }
  };

  // Helper: broadcast to all user's connected clients including sender
  const emitToUser = (event, data) => {
    if (socket.userId) {
      io.to(`user:${socket.userId}`).emit(event, data);
    }
  };


  // === ELEMENT OPERATIONS ===

  // Create element
  socket.on('flowchart:element:create', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { element } = data;
      
      if (!element || !element.id || !element.element_type) {
        return callback?.({ success: false, error: 'Некорректные данные элемента: отсутствуют id или element_type' });
      }

      const newElement = {
        id: element.id,
        user_id: socket.userId,
        name: element.name || 'Новый элемент',
        description: element.description || null,
        element_type: element.element_type,
        position_2d: element.position_2d || { x: 0, y: 0 },
        position: element.position || { x: 0, y: 0, z: 0 },
        size_2d: element.size_2d || { width: 100, height: 100 },
        size: element.size || { width: 100, height: 100, depth: 10 },
        color: element.color || '#6b7280',
        emissive: element.emissive || null,
        background: element.background || null,
        show_grid: element.show_grid || false,
        created_by: socket.userId,
      };

      await pool.query(
        `INSERT INTO elements (id, user_id, name, description, element_type, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          newElement.id,
          newElement.user_id,
          newElement.name,
          newElement.description,
          newElement.element_type,
          JSON.stringify(newElement.position_2d),
          JSON.stringify(newElement.position),
          JSON.stringify(newElement.size_2d),
          JSON.stringify(newElement.size),
          newElement.color,
          newElement.emissive,
          newElement.background,
          newElement.show_grid,
          newElement.created_by,
        ]
      );

      // If a parent_id is provided, create a parent-child connection
      if (element.parent_id) {
        await pool.query(
          `INSERT INTO element_parent_child_connections (parent_element_id, child_element_id, user_id)
           VALUES ($1, $2, $3)`,
          [element.parent_id, newElement.id, socket.userId]
        );
        console.log(`🔗 Parent-child connection created: ${element.parent_id} -> ${newElement.id}`);
      }
      
      console.log(`✨ Element created: ${newElement.id} (Type: ${newElement.element_type}) by user ${socket.userId}`);

      broadcastToUser('flowchart:element:created', { element: newElement });

      callback?.({ success: true, element: newElement });

    } catch (error) {
      console.error('Element create error:', error);
      callback?.({ success: false, error: 'Ошибка создания элемента' });
    }
  });

  // Update element
  socket.on('flowchart:element:update', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, updates } = data;
      
      if (!id || !updates) {
        return callback?.({ success: false, error: 'ID элемента и обновления обязательны' });
      }

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      for (const key in updates) {
        if (updates.hasOwnProperty(key)) {
          // Map frontend keys to DB column names if necessary
          let dbKey = key;
          let value = updates[key];

          if (key === 'position_2d' || key === 'position' || key === 'size_2d' || key === 'size') {
            value = JSON.stringify(value);
          }
          
          updateFields.push(`${dbKey} = $${paramIndex}`);
          updateValues.push(value);
          paramIndex++;
        }
      }

      // Handle parent_id separately if it's in the updates, by managing element_parent_child_connections table
      if (updates.hasOwnProperty('parent_id')) {
        const oldParentRes = await pool.query(
          `SELECT parent_element_id FROM element_parent_child_connections WHERE child_element_id = $1`,
          [id]
        );
        const oldParentId = oldParentRes.rows[0]?.parent_element_id;
        const newParentId = updates.parent_id;

        if (oldParentId !== newParentId) {
          if (oldParentId) {
            // Remove old parent-child connection
            await pool.query(
              `DELETE FROM element_parent_child_connections WHERE parent_element_id = $1 AND child_element_id = $2`,
              [oldParentId, id]
            );
            console.log(`🔗 Removed old parent-child connection: ${oldParentId} -> ${id}`);
          }
          if (newParentId) {
            // Create new parent-child connection
            await pool.query(
              `INSERT INTO element_parent_child_connections (parent_element_id, child_element_id, user_id) VALUES ($1, $2, $3)`,
              [newParentId, id, socket.userId]
            );
            console.log(`🔗 Created new parent-child connection: ${newParentId} -> ${id}`);
          }
        }
      }

      
      if (updateFields.length === 0) {
        return callback?.({ success: true, message: 'Нет полей для обновления' });
      }

      // Add updated_at
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      await pool.query(
        `UPDATE elements SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
        [...updateValues, id, socket.userId]
      );
      
      console.log(`📝 Element updated: ${id} by user ${socket.userId}, fields: ${Object.keys(updates).join(', ')}`);

      broadcastToUser('flowchart:element:updated', { id, updates });

      callback?.({ success: true });

    } catch (error) {
      console.error('Element update error:', error);
      callback?.({ success: false, error: 'Ошибка обновления элемента' });
    }
  });

  // Move element (position update)
  socket.on('flowchart:element:move', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, position_2d, position } = data;
      
      if (!id || (!position_2d && !position)) {
        return callback?.({ success: false, error: 'Некорректные данные: ID элемента и хотя бы одна позиция обязательны' });
      }

      const updates = {};
      if (position_2d) updates.position_2d = position_2d;
      if (position) updates.position = position;

      // Directly call the update logic or emit an internal update event
      // For now, we'll replicate the update logic for position
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (position_2d) {
        updateFields.push(`position_2d = $${paramIndex}`);
        updateValues.push(JSON.stringify(position_2d));
        paramIndex++;
      }
      if (position) {
        updateFields.push(`position = $${paramIndex}`);
        updateValues.push(JSON.stringify(position));
        paramIndex++;
      }
      
      // Add updated_at
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      await pool.query(
        `UPDATE elements SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
        [...updateValues, id, socket.userId]
      );

      console.log(`📝 Element moved: ${id} by user ${socket.userId}`);

      broadcastToUser('flowchart:element:moved', { id, position_2d, position });

      callback?.({ success: true });

    } catch (error) {
      console.error('Element move error:', error);
      callback?.({ success: false, error: 'Ошибка перемещения элемента' });
    }
  });

  // Delete element
  socket.on('flowchart:element:delete', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID элемента обязателен' });
      }

      await pool.query(
        `DELETE FROM elements WHERE id = $1 AND user_id = $2`,
        [id, socket.userId]
      );

      console.log(`🗑️ Element deleted: ${id} by user ${socket.userId}`);

      broadcastToUser('flowchart:element:deleted', { id });

      callback?.({ success: true });

    } catch (error) {
      console.error('Element delete error:', error);
      callback?.({ success: false, error: 'Ошибка удаления элемента' });
    }
  });

  // Nest element
  socket.on('flowchart:element:nest', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { childId, parentId } = data;
      
      if (!childId || !parentId) {
        return callback?.({ success: false, error: 'Некорректные данные: childId и parentId обязательны' });
      }

      // Check if an existing parent-child connection exists and remove it if different
      const existingConnection = await pool.query(
        `SELECT id, parent_element_id FROM element_parent_child_connections WHERE child_element_id = $1`,
        [childId]
      );

      if (existingConnection.rows.length > 0) {
        if (existingConnection.rows[0].parent_element_id !== parentId) {
          await pool.query(
            `DELETE FROM element_parent_child_connections WHERE id = $1`,
            [existingConnection.rows[0].id]
          );
          console.log(`🔗 Removed old parent-child connection for child ${childId}`);
        } else {
          return callback?.({ success: true, message: 'Элемент уже вложен в указанный родительский элемент' });
        }
      }

      // Create new parent-child connection
      await pool.query(
        `INSERT INTO element_parent_child_connections (parent_element_id, child_element_id, user_id)
         VALUES ($1, $2, $3)`,
        [parentId, childId, socket.userId]
      );
      
      console.log(`📦 Element nested: ${childId} -> ${parentId} by user ${socket.userId}`);

      broadcastToUser('flowchart:element:nested', { childId, parentId });

      callback?.({ success: true });

    } catch (error) {
      console.error('Element nest error:', error);
      callback?.({ success: false, error: 'Ошибка вложения элемента' });
    }
  });

  // Unnest element
  socket.on('flowchart:element:unnest', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, newPosition_2d, newPosition } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID элемента обязателен' });
      }

      // Remove parent-child connection from the dedicated table
      const deleteResult = await pool.query(
        `DELETE FROM element_parent_child_connections WHERE child_element_id = $1 AND user_id = $2 RETURNING parent_element_id`,
        [id, socket.userId]
      );

      const unnestedParentId = deleteResult.rows[0]?.parent_element_id;
      if (unnestedParentId) {
        console.log(`📤 Removed parent-child connection for element ${id} from parent ${unnestedParentId} by user ${socket.userId}`);
      } else {
        console.log(`❕ No parent-child connection found for element ${id} to unnest.`);
      }

      const updateFields = ['updated_at = CURRENT_TIMESTAMP']; // Start with updated_at
      const updateValues = [];
      let paramIndex = 1;

      if (newPosition_2d) {
        updateFields.push(`position_2d = $${paramIndex}`);
        updateValues.push(JSON.stringify(newPosition_2d));
        paramIndex++;
      }
      if (newPosition) {
        updateFields.push(`position = $${paramIndex}`);
        updateValues.push(JSON.stringify(newPosition));
        paramIndex++;
      }
      
      // Only run UPDATE if there are actual fields to update (positions or just updated_at)
      if (updateFields.length > 0) {
        await pool.query(
          `UPDATE elements SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
          [...updateValues, id, socket.userId]
        );
        console.log(`📝 Element position updated after unnest: ${id} by user ${socket.userId}`);
      }
      
      broadcastToUser('flowchart:element:unnested', { id, newPosition_2d, newPosition, unnestedParentId });

      callback?.({ success: true });

    } catch (error) {
      console.error('Element unnest error:', error);
      callback?.({ success: false, error: 'Ошибка извлечения элемента' });
    }
  });

  // === CONNECTION OPERATIONS ===

  // Create connection
  socket.on('flowchart:connection:create', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { connection } = data;
      
      if (!connection || !connection.id || !connection.from_element_id || !connection.to_element_id) {
        return callback?.({ success: false, error: 'Некорректные данные связи: отсутствуют id, from_element_id или to_element_id' });
      }

      const newConnection = {
        id: connection.id,
        user_id: socket.userId,
        from_element_id: connection.from_element_id,
        to_element_id: connection.to_element_id,
        type: connection.type || 'one-way',
        bidirectional: connection.bidirectional || false,
        label: connection.label || null,
        color: connection.color || '#ffffff',
        created_by: socket.userId,
      };

      await pool.query(
        `INSERT INTO elements_connections (id, user_id, from_element_id, to_element_id, type, bidirectional, label, color, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newConnection.id,
          newConnection.user_id,
          newConnection.from_element_id,
          newConnection.to_element_id,
          newConnection.type,
          newConnection.bidirectional,
          newConnection.label,
          newConnection.color,
          newConnection.created_by,
        ]
      );
      
      console.log(`🔗 Connection created: ${newConnection.from_element_id} -> ${newConnection.to_element_id} by user ${socket.userId}`);

      broadcastToUser('flowchart:connection:created', { connection: newConnection });

      callback?.({ success: true, connection: newConnection });

    } catch (error) {
      console.error('Connection create error:', error);
      callback?.({ success: false, error: 'Ошибка создания связи' });
    }
  });

  // Update connection
  socket.on('flowchart:connection:update', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id, updates } = data;
      
      if (!id || !updates) {
        return callback?.({ success: false, error: 'ID связи и обновления обязательны' });
      }

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      for (const key in updates) {
        if (updates.hasOwnProperty(key)) {
          updateFields.push(`${key} = $${paramIndex}`);
          updateValues.push(updates[key]);
          paramIndex++;
        }
      }
      
      if (updateFields.length === 0) {
        return callback?.({ success: true, message: 'Нет полей для обновления' });
      }

      // Add updated_at
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      await pool.query(
        `UPDATE elements_connections SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
        [...updateValues, id, socket.userId]
      );
      
      console.log(`📝 Connection updated: ${id} by user ${socket.userId}, fields: ${Object.keys(updates).join(', ')}`);

      broadcastToUser('flowchart:connection:updated', { id, updates });

      callback?.({ success: true });

    } catch (error) {
      console.error('Connection update error:', error);
      callback?.({ success: false, error: 'Ошибка обновления связи' });
    }
  });

  // Delete connection
  socket.on('flowchart:connection:delete', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { id } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID связи обязателен' });
      }

      await pool.query(
        `DELETE FROM elements_connections WHERE id = $1 AND user_id = $2`,
        [id, socket.userId]
      );

      console.log(`🗑️ Connection deleted: ${id} by user ${socket.userId}`);

      broadcastToUser('flowchart:connection:deleted', { id });

      callback?.({ success: true });

    } catch (error) {
      console.error('Connection delete error:', error);
      callback?.({ success: false, error: 'Ошибка удаления связи' });
    }
  });

  // === VIEW STATE ===

  // Update view state (pan, zoom, currentViewId)
  socket.on('flowchart:view:update', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { viewState } = data;
      
      // Broadcast to other clients for sync
      broadcastToUser('flowchart:view:updated', { viewState });

      callback?.({ success: true });

    } catch (error) {
      console.error('View update error:', error);
      callback?.({ success: false, error: 'Ошибка обновления состояния' });
    }
  });

  // Navigate into element
  socket.on('flowchart:navigate:into', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { elementId } = data;
      
      // Broadcast to other clients
      broadcastToUser('flowchart:navigated:into', { elementId });

      callback?.({ success: true });

    } catch (error) {
      console.error('Navigate into error:', error);
      callback?.({ success: false, error: 'Ошибка навигации' });
    }
  });

  // Navigate up
  socket.on('flowchart:navigate:up', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      // Broadcast to other clients
      broadcastToUser('flowchart:navigated:up', {});

      callback?.({ success: true });

    } catch (error) {
      console.error('Navigate up error:', error);
      callback?.({ success: false, error: 'Ошибка навигации' });
    }
  });

  // Navigate to root
  socket.on('flowchart:navigate:root', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      // Broadcast to other clients
      broadcastToUser('flowchart:navigated:root', {});

      callback?.({ success: true });

    } catch (error) {
      console.error('Navigate root error:', error);
      callback?.({ success: false, error: 'Ошибка навигации' });
    }
  });

  // === AI GENERATION ===

  // Generate company structure using GPT
  socket.on('flowchart:generate-company', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { name, description } = data;
      
      if (!name || name.trim().length === 0) {
        return callback?.({ success: false, error: 'Название компании обязательно' });
      }

      console.log(`🤖 Generating company for user ${socket.userId}: ${name}`);
      console.log(`📝 Description: ${description || '(empty)'}`);

      // Progress callback to send updates to client
      const onProgress = (progress) => {
        socket.emit('flowchart:generate-progress', progress);
        console.log(`📊 Progress: Step ${progress.step}/${progress.total} - ${progress.message}`);
      };

      // Call OpenAI multi-step generation
      console.log('🔄 Starting multi-step generation...');
      const structure = await generateCompanyStructure(name, description || '', onProgress);
      console.log('✅ Multi-step generation complete');
      
      // Convert GPT response to flowchart elements (with root company element)
      const { elements, connections } = convertToFlowchartElements(structure, name, description || '');

      // Use a transaction for atomicity
      await pool.query('BEGIN');

      try {
        const createdElementIds = new Set();
        const createdConnectionIds = new Set();

        // 1. Insert elements
        for (const elementData of elements) {
          const newElement = {
            id: elementData.id,
            user_id: socket.userId,
            name: elementData.name || 'Сгенерированный элемент',
            description: elementData.description || null,
            element_type: elementData.element_type || 'block',
            position_2d: elementData.position_2d || { x: 0, y: 0 },
            position: elementData.position || { x: 0, y: 0, z: 0 },
            size_2d: elementData.size_2d || { width: 100, height: 100 },
            size: elementData.size || { width: 100, height: 100, depth: 10 },
            color: elementData.color || '#6b7280',
            emissive: elementData.emissive || null,
            background: elementData.background || null,
            show_grid: elementData.show_grid || false,
            created_by: socket.userId,
          };

          await pool.query(
            `INSERT INTO elements (id, user_id, name, description, element_type, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               element_type = EXCLUDED.element_type,
               position_2d = EXCLUDED.position_2d,
               position = EXCLUDED.position,
               size_2d = EXCLUDED.size_2d,
               size = EXCLUDED.size,
               color = EXCLUDED.color,
               emissive = EXCLUDED.emissive,
               background = EXCLUDED.background,
               show_grid = EXCLUDED.show_grid,
               updated_at = CURRENT_TIMESTAMP
            `,
            [
              newElement.id,
              newElement.user_id,
              newElement.name,
              newElement.description,
              newElement.element_type,
              JSON.stringify(newElement.position_2d),
              JSON.stringify(newElement.position),
              JSON.stringify(newElement.size_2d),
              JSON.stringify(newElement.size),
              newElement.color,
              newElement.emissive,
              newElement.background,
              newElement.show_grid,
              newElement.created_by,
            ]
          );
          createdElementIds.add(newElement.id);

          // Insert parent-child connections
          if (elementData.parent_id) {
            await pool.query(
              `INSERT INTO element_parent_child_connections (parent_element_id, child_element_id, user_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (parent_element_id, child_element_id) DO UPDATE SET
                 updated_at = CURRENT_TIMESTAMP
              `,
              [elementData.parent_id, newElement.id, socket.userId]
            );
          }
        }

        // 2. Insert connections
        for (const connectionData of connections) {
          const newConnection = {
            id: connectionData.id,
            user_id: socket.userId,
            from_element_id: connectionData.from_element_id,
            to_element_id: connectionData.to_element_id,
            type: connectionData.type || 'one-way',
            bidirectional: connectionData.bidirectional || false,
            label: connectionData.label || null,
            color: connectionData.color || '#ffffff',
            created_by: socket.userId,
          };

          await pool.query(
            `INSERT INTO elements_connections (id, user_id, from_element_id, to_element_id, type, bidirectional, label, color, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               from_element_id = EXCLUDED.from_element_id,
               to_element_id = EXCLUDED.to_element_id,
               type = EXCLUDED.type,
               bidirectional = EXCLUDED.bidirectional,
               label = EXCLUDED.label,
               color = EXCLUDED.color,
               updated_at = CURRENT_TIMESTAMP
            `,
            [
              newConnection.id,
              newConnection.user_id,
              newConnection.from_element_id,
              newConnection.to_element_id,
              newConnection.type,
              newConnection.bidirectional,
              newConnection.label,
              newConnection.color,
              newConnection.created_by,
            ]
          );
          createdConnectionIds.add(newConnection.id);
        }

        await pool.query('COMMIT');
        console.log(`✅ Company generated for user ${socket.userId}: ${elements.length} elements, ${connections.length} connections`);

        // Broadcast to all user's clients
        emitToUser('flowchart:generated', {
          elements,
          connections,
          // For now, we don't have a single "flowchartId",
          // so we'll pass the root element ID if available, or null
          flowchartId: elements.find(e => e.element_type === 'flowchart_root')?.id || null,
          updatedAt: new Date().toISOString() // Use current time for updatedAt
        });

        callback?.({
          success: true,
          elements,
          connections,
          flowchartId: elements.find(e => e.element_type === 'flowchart_root')?.id || null,
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error; // Re-throw to be caught by the outer catch block
      }

    } catch (error) {
      console.error('Company generation error:', error);
      callback?.({ success: false, error: error.message || 'Ошибка генерации компании' });
    }
  });

  // === SYNC ===

  // Request full sync (when client reconnects or needs to resync)
  socket.on('flowchart:sync:request', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      // Fetch all elements for the user
      const elementsResult = await pool.query(
        `SELECT
           id, user_id, name, description, element_type,
           position_2d, position, size_2d, size, color, emissive, background, show_grid,
           created_at, updated_at, created_by
         FROM elements
         WHERE user_id = $1`,
        [socket.userId]
      );
      const elements = elementsResult.rows;

      // Fetch all connections for the user
      const connectionsResult = await pool.query(
        `SELECT
           id, user_id, from_element_id, to_element_id, type, bidirectional, label, color,
           created_at, updated_at, created_by
         FROM elements_connections
         WHERE user_id = $1`,
        [socket.userId]
      );
      const connections = connectionsResult.rows;

      // Fetch all parent-child connections for the user
      const parentChildConnectionsResult = await pool.query(
        `SELECT
           parent_element_id, child_element_id
         FROM element_parent_child_connections
         WHERE user_id = $1`,
        [socket.userId]
      );
      const parentChildConnections = parentChildConnectionsResult.rows;

      // Augment elements with parent_id for client consumption
      const elementsWithParents = elements.map(element => {
        const parentConnection = parentChildConnections.find(conn => conn.child_element_id === element.id);
        return {
          ...element,
          parent_id: parentConnection ? parentConnection.parent_element_id : null,
        };
      });

      if (elements.length === 0 && connections.length === 0) {
        return callback?.({ success: true, hasData: false });
      }

      // Find a root flowchart element if it exists to serve as the main flowchartId
      const flowchartRootElement = elements.find(e => e.element_type === 'flowchart_root');
      const flowchartId = flowchartRootElement ? flowchartRootElement.id : null;

      // Determine the latest update time from all fetched entities
      let latestUpdatedAt = new Date(0);
      elements.forEach(el => {
        if (new Date(el.updated_at) > latestUpdatedAt) latestUpdatedAt = new Date(el.updated_at);
      });
      connections.forEach(conn => {
        if (new Date(conn.updated_at) > latestUpdatedAt) latestUpdatedAt = new Date(conn.updated_at);
      });

      callback?.({
        success: true,
        hasData: true,
        flowchart: {
          id: flowchartId, // This might be null if no explicit root element
          name: flowchartRootElement?.name || 'Generated Flowchart',
          elements: elementsWithParents || [],
          connections: connections || [],
          viewState: flowchartRootElement?.position_2d ? { currentViewId: null, zoom: 1, pan: { x: flowchartRootElement.position_2d.x, y: flowchartRootElement.position_2d.y } } : { currentViewId: null, zoom: 1, pan: { x: 0, y: 0 } },
          updatedAt: latestUpdatedAt.toISOString()
        }
      });

    } catch (error) {
      console.error('Sync request error:', error);
      callback?.({ success: false, error: 'Ошибка синхронизации' });
    }
  });
}
export default { setupFlowchartHandlers };

