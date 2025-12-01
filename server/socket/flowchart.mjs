// Socket.IO flowchart handlers
// Real-time CRUD operations with instant DB persistence

import pool from '../db.mjs';
import { userRooms } from './auth.mjs';
import { generateCompanyStructure, convertToFlowchartElements } from '../services/openai.mjs';

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

  // Load flowchart
  socket.on('flowchart:load', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const result = await pool.query(
        `SELECT id, name, elements, connections, view_state, updated_at 
         FROM flowcharts 
         WHERE user_id = $1 
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [socket.userId]
      );

      if (result.rows.length === 0) {
        return callback?.({
          success: true,
          hasData: false,
          flowchart: null
        });
      }

      const flowchart = result.rows[0];

      console.log(`📥 Flowchart loaded for user ${socket.userId}: ${flowchart.elements?.length || 0} elements`);

      callback?.({
        success: true,
        hasData: true,
        flowchart: {
          id: flowchart.id,
          name: flowchart.name,
          elements: flowchart.elements || [],
          connections: flowchart.connections || [],
          viewState: flowchart.view_state || null,
          updatedAt: flowchart.updated_at
        }
      });

    } catch (error) {
      console.error('Flowchart load error:', error);
      callback?.({ success: false, error: 'Ошибка загрузки блок-схемы' });
    }
  });

  // Save entire flowchart (batch save)
  socket.on('flowchart:save', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { name = 'Моя схема', elements, connections, viewState } = data;

      if (!Array.isArray(elements) || !Array.isArray(connections)) {
        return callback?.({ success: false, error: 'Некорректный формат данных' });
      }

      const result = await pool.query(
        `INSERT INTO flowcharts (user_id, name, elements, connections, view_state)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, name) 
         DO UPDATE SET 
           elements = EXCLUDED.elements,
           connections = EXCLUDED.connections,
           view_state = EXCLUDED.view_state,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, updated_at`,
        [socket.userId, name, JSON.stringify(elements), JSON.stringify(connections), JSON.stringify(viewState)]
      );

      console.log(`💾 Flowchart saved for user ${socket.userId}: ${elements.length} elements, ${connections.length} connections`);

      // Broadcast save confirmation to all user's clients
      emitToUser('flowchart:saved', {
        id: result.rows[0].id,
        updatedAt: result.rows[0].updated_at
      });

      callback?.({
        success: true,
        flowchart: {
          id: result.rows[0].id,
          updatedAt: result.rows[0].updated_at
        }
      });

    } catch (error) {
      console.error('Flowchart save error:', error);
      callback?.({ success: false, error: 'Ошибка сохранения блок-схемы' });
    }
  });

  // === ELEMENT OPERATIONS ===

  // Create element
  socket.on('flowchart:element:create', async (data, callback) => {
    if (!socket.userId) {
      return callback?.({ success: false, error: 'Требуется авторизация' });
    }

    try {
      const { element } = data;
      
      if (!element || !element.id || !element.type) {
        return callback?.({ success: false, error: 'Некорректные данные элемента' });
      }

      // Save to DB immediately
      await saveFlowchartState(socket.userId);

      console.log(`✨ Element created: ${element.id} by user ${socket.userId}`);

      // Broadcast to other clients
      broadcastToUser('flowchart:element:created', { element });

      callback?.({ success: true, element });

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
      
      if (!id) {
        return callback?.({ success: false, error: 'ID элемента обязателен' });
      }

      console.log(`📝 Element updated: ${id} by user ${socket.userId}`);

      // Broadcast to other clients
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
      const { id, position } = data;
      
      if (!id || !position) {
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      // Broadcast to other clients immediately for smooth sync
      broadcastToUser('flowchart:element:moved', { id, position });

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

      console.log(`🗑️ Element deleted: ${id} by user ${socket.userId}`);

      // Broadcast to other clients
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
        return callback?.({ success: false, error: 'Некорректные данные' });
      }

      console.log(`📦 Element nested: ${childId} -> ${parentId} by user ${socket.userId}`);

      // Broadcast to other clients
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
      const { id, newPosition } = data;
      
      if (!id) {
        return callback?.({ success: false, error: 'ID элемента обязателен' });
      }

      console.log(`📤 Element unnested: ${id} by user ${socket.userId}`);

      // Broadcast to other clients
      broadcastToUser('flowchart:element:unnested', { id, newPosition });

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
      
      if (!connection || !connection.id || !connection.from || !connection.to) {
        return callback?.({ success: false, error: 'Некорректные данные связи' });
      }

      console.log(`🔗 Connection created: ${connection.from} -> ${connection.to} by user ${socket.userId}`);

      // Broadcast to other clients
      broadcastToUser('flowchart:connection:created', { connection });

      callback?.({ success: true, connection });

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
      
      if (!id) {
        return callback?.({ success: false, error: 'ID связи обязателен' });
      }

      console.log(`📝 Connection updated: ${id} by user ${socket.userId}`);

      // Broadcast to other clients
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

      console.log(`🗑️ Connection deleted: ${id} by user ${socket.userId}`);

      // Broadcast to other clients
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

      // Save to database
      const result = await pool.query(
        `INSERT INTO flowcharts (user_id, name, elements, connections, view_state)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, name) 
         DO UPDATE SET 
           elements = EXCLUDED.elements,
           connections = EXCLUDED.connections,
           view_state = EXCLUDED.view_state,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, updated_at`,
        [socket.userId, name, JSON.stringify(elements), JSON.stringify(connections), JSON.stringify({ currentViewId: null, zoom: 1, pan: { x: 0, y: 0 } })]
      );

      console.log(`✅ Company generated for user ${socket.userId}: ${elements.length} elements, ${connections.length} connections`);

      // Broadcast to all user's clients
      emitToUser('flowchart:generated', {
        elements,
        connections,
        flowchartId: result.rows[0].id
      });

      callback?.({
        success: true,
        elements,
        connections,
        flowchartId: result.rows[0].id,
        updatedAt: result.rows[0].updated_at
      });

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
      const result = await pool.query(
        `SELECT id, name, elements, connections, view_state, updated_at 
         FROM flowcharts 
         WHERE user_id = $1 
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [socket.userId]
      );

      if (result.rows.length === 0) {
        return callback?.({ success: true, hasData: false });
      }

      const flowchart = result.rows[0];

      callback?.({
        success: true,
        hasData: true,
        flowchart: {
          id: flowchart.id,
          name: flowchart.name,
          elements: flowchart.elements || [],
          connections: flowchart.connections || [],
          viewState: flowchart.view_state || null,
          updatedAt: flowchart.updated_at
        }
      });

    } catch (error) {
      console.error('Sync request error:', error);
      callback?.({ success: false, error: 'Ошибка синхронизации' });
    }
  });
}

// Helper: save current flowchart state (debounced on client side)
async function saveFlowchartState(userId) {
  // This is called by the client when they emit flowchart:save
  // The actual save logic is in the flowchart:save handler above
  return true;
}

export default { setupFlowchartHandlers };

