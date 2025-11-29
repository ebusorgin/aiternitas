// Socket.IO обработчики для 3D-сцены
// Все события синхронизируются между подключенными клиентами

import pool from '../db.mjs';

export function setupSceneHandlers(io, sessionStore) {
  // Хранилище состояния сцены (в памяти, для real-time синхронизации)
  // В production можно использовать Redis для масштабирования
  const sceneState = {
    entities: [],
    connections: [],
    lastUpdate: Date.now()
  };

  // Debounce для автоматического сохранения сцены в БД
  const saveTimeouts = new Map(); // userId -> timeout
  const SAVE_DEBOUNCE_MS = 2000; // Сохраняем через 2 секунды после последнего изменения

  // Функция автоматического сохранения сцены в БД
  async function saveSceneToDatabase(userId, state) {
    if (!userId) {
      return; // Не сохраняем для анонимных пользователей
    }

    // Отменяем предыдущий таймер для этого пользователя
    if (saveTimeouts.has(userId)) {
      clearTimeout(saveTimeouts.get(userId));
    }

    // Устанавливаем новый таймер
    const timeout = setTimeout(async () => {
      try {
        // Проверяем, есть ли уже сохраненная сцена для этого пользователя
        const existingScene = await pool.query(
          `SELECT id FROM scenes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );

        const sceneData = {
          entities: state.entities,
          connections: state.connections
        };

        if (existingScene.rows.length > 0) {
          // Обновляем существующую сцену
          await pool.query(
            `UPDATE scenes SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [JSON.stringify(sceneData), existingScene.rows[0].id]
          );
          console.log(`💾 Сцена обновлена в БД для пользователя ${userId}`);
        } else {
          // Создаем новую сцену
          await pool.query(
            `INSERT INTO scenes (user_id, name, data) VALUES ($1, $2, $3)`,
            [userId, 'Auto-saved Scene', JSON.stringify(sceneData)]
          );
          console.log(`💾 Сцена создана в БД для пользователя ${userId}`);
        }

        saveTimeouts.delete(userId);
      } catch (error) {
        console.error('❌ Ошибка автоматического сохранения сцены:', error);
        saveTimeouts.delete(userId);
      }
    }, SAVE_DEBOUNCE_MS);

    saveTimeouts.set(userId, timeout);
  }

  // Middleware для проверки авторизации через сессию
  // Socket.IO получает доступ к сессии через cookie
  io.use((socket, next) => {
    // Получаем cookie из запроса
    const cookieHeader = socket.request.headers.cookie;
    console.log('🔍 Socket.IO cookie header:', cookieHeader ? 'present' : 'missing');
    
    if (!cookieHeader) {
      console.log('⚠️ Socket.IO: cookie header отсутствует');
      socket.userId = null;
      return next();
    }

    // Парсим cookie для получения session ID
    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('='); // На случай если в значении есть =
        cookies[name] = decodeURIComponent(value);
      }
    });

    let sessionId = cookies['aiternitas.sid'];
    console.log('🔍 Socket.IO sessionId (raw):', sessionId ? `found (${sessionId.substring(0, 50)}...)` : 'not found');
    
    if (!sessionId) {
      socket.userId = null;
      return next();
    }
    
    // connect-pg-simple хранит sessionId в БД БЕЗ префикса 's:' и подписи
    // В cookie формат: s:sessionId.signature или s%3AsessionId.signature (URL-encoded)
    
    // Декодируем URL-encoded sessionId сначала
    try {
      sessionId = decodeURIComponent(sessionId);
    } catch (e) {
      // Если не URL-encoded, оставляем как есть
    }
    
    // Убираем префикс 's:' если он есть
    if (sessionId.startsWith('s:')) {
      sessionId = sessionId.substring(2);
    }
    
    // Убираем подпись после точки (если есть)
    // Формат: sessionId.signature
    if (sessionId.includes('.')) {
      sessionId = sessionId.split('.')[0];
    }
    
    console.log('🔍 Socket.IO sessionId (cleaned):', sessionId.substring(0, 30));

    // Получаем сессию через sessionStore (предпочтительный способ)
    // connect-pg-simple.get() ожидает sessionId БЕЗ префикса 's:' и подписи
    if (sessionStore && sessionStore.get) {
      console.log('🔍 Пытаемся получить сессию через sessionStore для sessionId:', sessionId.substring(0, 30));
      // sessionStore.get() сам обрабатывает формат, но мы уже очистили sessionId
      sessionStore.get(sessionId, (err, session) => {
        if (err) {
          console.error('❌ Ошибка получения сессии через sessionStore:', err);
          socket.userId = null;
          return next();
        }
        
        console.log('🔍 Результат sessionStore.get:', {
          hasSession: !!session,
          sessionType: typeof session,
          sessionKeys: session ? Object.keys(session) : null
        });
        
        if (!session) {
          console.log('⚠️ Socket.IO: сессия не найдена через sessionStore. Пробуем прямой запрос к БД...');
          // Fallback: прямой запрос к БД
          // connect-pg-simple хранит sessionId БЕЗ префикса 's:' и подписи
          pool.query(
            `SELECT sid, sess, expire FROM session WHERE sid = $1 AND expire > NOW()`,
            [sessionId]
          ).then(result => {
            if (result.rows.length === 0) {
              console.log('⚠️ Socket.IO: сессия не найдена в БД для sessionId:', sessionId.substring(0, 30));
              // Попробуем найти все активные сессии для отладки
              pool.query(
                `SELECT sid, expire FROM session WHERE expire > NOW() ORDER BY expire DESC LIMIT 5`
              ).then(debugResult => {
                console.log('🔍 Активные сессии в БД (первые 30 символов):', debugResult.rows.map(r => ({
                  sid: r.sid ? r.sid.substring(0, 30) : 'null',
                  expire: r.expire
                })));
              }).catch(() => {});
              socket.userId = null;
              return next();
            }
            
            const row = result.rows[0];
            const now = new Date();
            const expire = new Date(row.expire);
            
            if (expire < now) {
              console.log('⚠️ Socket.IO: сессия истекла. Expire:', expire, 'Now:', now);
              socket.userId = null;
              return next();
            }
            
            const sessionData = row.sess;
            let session;
            try {
              session = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
            } catch (e) {
              console.error('❌ Ошибка парсинга сессии:', e);
              session = sessionData;
            }
            
            console.log('🔍 Socket.IO session из БД:', {
              hasUserId: !!session?.userId,
              keys: session ? Object.keys(session) : [],
              userId: session?.userId
            });
            
            if (session && session.userId) {
              socket.userId = session.userId;
              socket.userName = session.userName || session.name || 'Unknown';
              console.log(`✅ Socket.IO авторизация (через БД): userId=${session.userId}, userName=${socket.userName}`);
            } else {
              socket.userId = null;
              console.log('⚠️ Socket.IO: сессия найдена в БД, но userId отсутствует');
            }
            next();
          }).catch(dbError => {
            console.error('❌ Ошибка БД:', dbError);
            socket.userId = null;
            next();
          });
          return;
        }
        
        console.log('🔍 Socket.IO session через sessionStore:', {
          hasUserId: !!session?.userId,
          keys: session ? Object.keys(session) : [],
          userId: session?.userId,
          userName: session?.userName || session?.name
        });
        
        if (session.userId) {
          socket.userId = session.userId;
          socket.userName = session.userName || session.name || 'Unknown';
          console.log(`✅ Socket.IO авторизация: userId=${session.userId}, userName=${socket.userName}`);
        } else {
          socket.userId = null;
          console.log('⚠️ Socket.IO: сессия найдена, но userId отсутствует');
        }
        next();
      });
      } else {
        // Fallback: получаем сессию из БД напрямую
        (async () => {
          try {
            const result = await pool.query(
            `SELECT sess FROM session WHERE sid = $1 AND expire > NOW()`,
            [sessionId]
          );

          if (result.rows.length === 0) {
            console.log('⚠️ Socket.IO: сессия не найдена в БД или истекла');
            socket.userId = null;
            return next();
          }

          const sessionData = result.rows[0].sess;
          let session;
          try {
            if (typeof sessionData === 'string') {
              session = JSON.parse(sessionData);
            } else if (sessionData && typeof sessionData === 'object') {
              session = sessionData;
            } else {
              session = null;
            }
          } catch (parseError) {
            console.error('❌ Ошибка парсинга сессии:', parseError);
            session = null;
          }
          
          if (!session) {
            console.log('⚠️ Socket.IO: не удалось распарсить сессию');
            socket.userId = null;
            return next();
          }
          
          if (session.userId) {
            socket.userId = session.userId;
            socket.userName = session.userName || session.name || 'Unknown';
            console.log(`✅ Socket.IO авторизация: userId=${session.userId}, userName=${socket.userName}`);
          } else {
            socket.userId = null;
            console.log('⚠️ Socket.IO: сессия найдена, но userId отсутствует');
          }
            next();
          } catch (dbError) {
            console.error('❌ Ошибка получения сессии из БД:', dbError);
            socket.userId = null;
            next();
          }
        })();
      }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket.IO подключение: ${socket.id} (user: ${socket.userId || 'anonymous'})`);
    console.log('🔍 Socket connection details:', {
      id: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      headers: socket.request.headers
    });

    // Присоединение к сцене - отправляем текущее состояние
    socket.on('scene:join', async () => {
      // Если пользователь авторизован, пытаемся загрузить его последнюю сохраненную сцену
      if (socket.userId) {
        try {
          const result = await pool.query(
            `SELECT data FROM scenes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
            [socket.userId]
          );

          if (result.rows.length > 0) {
            const sceneData = typeof result.rows[0].data === 'string' 
              ? JSON.parse(result.rows[0].data) 
              : result.rows[0].data;
            
            // Восстанавливаем состояние сцены из БД
            sceneState.entities = sceneData.entities || [];
            sceneState.connections = sceneData.connections || [];
            sceneState.lastUpdate = Date.now();
            
            console.log(`📥 Загружена сохраненная сцена для пользователя ${socket.userId}`);
          } else {
            // Если нет сохраненной сцены, сохраняем текущее состояние (пустое)
            saveSceneToDatabase(socket.userId, sceneState);
          }
        } catch (error) {
          console.error('❌ Ошибка загрузки сцены при присоединении:', error);
        }
      }

      socket.emit('scene:state', {
        entities: sceneState.entities,
        connections: sceneState.connections
      });
      console.log(`📥 Клиент ${socket.id} присоединился к сцене`);
    });

    // Создание новой сущности (куба)
    socket.on('entity:create', (entityData) => {
      console.log('🔍 entity:create event:', { 
        socketId: socket.id, 
        userId: socket.userId,
        entityData 
      });
      
      if (!socket.userId) {
        console.log('❌ entity:create: userId отсутствует для socket', socket.id);
        socket.emit('error', { message: 'Требуется авторизация для создания сущностей' });
        return;
      }

      const entity = {
        id: entityData.id || `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: entityData.name || `Entity ${sceneState.entities.length + 1}`,
        description: entityData.description || '',
        color: entityData.color || '#3b82f6',
        position: entityData.position || [0, 0, 0],
        size: entityData.size || [1, 1, 1],
        type: entityData.type || 'box',
        createdAt: Date.now(),
        createdBy: socket.userId
      };

      sceneState.entities.push(entity);
      sceneState.lastUpdate = Date.now();

      // Синхронизация со всеми клиентами
      io.emit('entity:created', entity);
      console.log(`✨ Создана сущность ${entity.id} пользователем ${socket.userId}`);
      
      // Автоматическое сохранение сцены в БД
      saveSceneToDatabase(socket.userId, sceneState);
    });

    // Обновление сущности (позиция, свойства)
    socket.on('entity:update', (updateData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      const { id, ...updates } = updateData;
      const entityIndex = sceneState.entities.findIndex(e => e.id === id);

      if (entityIndex === -1) {
        socket.emit('error', { message: 'Сущность не найдена' });
        return;
      }

      // Обновляем сущность
      sceneState.entities[entityIndex] = {
        ...sceneState.entities[entityIndex],
        ...updates,
        updatedAt: Date.now(),
        updatedBy: socket.userId
      };

      sceneState.lastUpdate = Date.now();

      // Синхронизация
      io.emit('entity:updated', sceneState.entities[entityIndex]);
      
      // Автоматическое сохранение сцены в БД
      saveSceneToDatabase(socket.userId, sceneState);
    });

    // Удаление сущности
    socket.on('entity:delete', (entityId) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      const entityIndex = sceneState.entities.findIndex(e => e.id === entityId);
      if (entityIndex === -1) {
        socket.emit('error', { message: 'Сущность не найдена' });
        return;
      }

      sceneState.entities.splice(entityIndex, 1);
      
      // Удаляем все связи с этой сущностью
      sceneState.connections = sceneState.connections.filter(
        conn => conn.from !== entityId && conn.to !== entityId
      );

      sceneState.lastUpdate = Date.now();

      // Синхронизация
      io.emit('entity:deleted', { id: entityId });
      io.emit('connections:updated', sceneState.connections);
      console.log(`🗑️ Удалена сущность ${entityId}`);
      
      // Автоматическое сохранение сцены в БД
      saveSceneToDatabase(socket.userId, sceneState);
    });

    // Создание связи между сущностями
    socket.on('connection:create', (connectionData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      const { from, to, ...rest } = connectionData;
      
      // Проверяем существование сущностей
      const fromExists = sceneState.entities.some(e => e.id === from);
      const toExists = sceneState.entities.some(e => e.id === to);

      if (!fromExists || !toExists) {
        socket.emit('error', { message: 'Одна из сущностей не найдена' });
        return;
      }

      // Проверяем, нет ли уже такой связи
      const exists = sceneState.connections.some(
        conn => conn.from === from && conn.to === to
      );

      if (exists) {
        socket.emit('error', { message: 'Связь уже существует' });
        return;
      }

      const connection = {
        id: connectionData.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from,
        to,
        type: rest.type || 'one-way',
        bidirectional: rest.bidirectional || false,
        label: rest.label || '',
        color: rest.color || '#ffffff',
        createdAt: Date.now(),
        createdBy: socket.userId
      };

      sceneState.connections.push(connection);
      sceneState.lastUpdate = Date.now();

      // Синхронизация
      io.emit('connection:created', connection);
      console.log(`🔗 Создана связь ${connection.id} между ${from} и ${to}`);
      
      // Автоматическое сохранение сцены в БД
      saveSceneToDatabase(socket.userId, sceneState);
    });

    // Обновление связи
    socket.on('connection:update', (updateData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      const { id, ...updates } = updateData;
      const connIndex = sceneState.connections.findIndex(c => c.id === id);

      if (connIndex === -1) {
        socket.emit('error', { message: 'Связь не найдена' });
        return;
      }

      sceneState.connections[connIndex] = {
        ...sceneState.connections[connIndex],
        ...updates,
        updatedAt: Date.now()
      };

      sceneState.lastUpdate = Date.now();

      // Синхронизация
      io.emit('connection:updated', sceneState.connections[connIndex]);
      
      // Автоматическое сохранение сцены в БД
      saveSceneToDatabase(socket.userId, sceneState);
    });

    // Удаление связи
    socket.on('connection:delete', (connectionId) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      const connIndex = sceneState.connections.findIndex(c => c.id === connectionId);
      if (connIndex === -1) {
        socket.emit('error', { message: 'Связь не найдена' });
        return;
      }

      sceneState.connections.splice(connIndex, 1);
      sceneState.lastUpdate = Date.now();

      // Синхронизация
      io.emit('connection:deleted', { id: connectionId });
      console.log(`🔗 Удалена связь ${connectionId}`);
      
      // Автоматическое сохранение сцены в БД
      saveSceneToDatabase(socket.userId, sceneState);
    });

    // Сохранение сцены в БД
    socket.on('scene:save', async (sceneData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { name, data } = sceneData;
        
        const result = await pool.query(
          `INSERT INTO scenes (user_id, name, data) 
           VALUES ($1, $2, $3) 
           RETURNING id, created_at`,
          [socket.userId, name || 'Untitled Scene', JSON.stringify(data || {
            entities: sceneState.entities,
            connections: sceneState.connections
          })]
        );

        socket.emit('scene:saved', {
          id: result.rows[0].id,
          name: name || 'Untitled Scene',
          createdAt: result.rows[0].created_at
        });

        console.log(`💾 Сцена сохранена пользователем ${socket.userId}`);
      } catch (error) {
        console.error('Ошибка сохранения сцены:', error);
        socket.emit('error', { message: 'Ошибка сохранения сцены' });
      }
    });

    // Загрузка сцены из БД
    socket.on('scene:load', async (sceneId) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const result = await pool.query(
          `SELECT id, name, data, created_at, updated_at 
           FROM scenes 
           WHERE id = $1 AND user_id = $2`,
          [sceneId, socket.userId]
        );

        if (result.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        const scene = result.rows[0];
        const sceneData = typeof scene.data === 'string' 
          ? JSON.parse(scene.data) 
          : scene.data;

        // Обновляем состояние сцены
        sceneState.entities = sceneData.entities || [];
        sceneState.connections = sceneData.connections || [];
        sceneState.lastUpdate = Date.now();

        // Синхронизируем со всеми клиентами
        io.emit('scene:state', {
          entities: sceneState.entities,
          connections: sceneState.connections
        });

        // Обновляем updated_at в БД при загрузке
        await pool.query(
          `UPDATE scenes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sceneId]
        );

        socket.emit('scene:loaded', {
          id: scene.id,
          name: scene.name,
          createdAt: scene.created_at
        });

        console.log(`📥 Сцена ${sceneId} загружена пользователем ${socket.userId}`);
      } catch (error) {
        console.error('Ошибка загрузки сцены:', error);
        socket.emit('error', { message: 'Ошибка загрузки сцены' });
      }
    });

    // Список сцен пользователя
    socket.on('scene:list', async () => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const result = await pool.query(
          `SELECT id, name, created_at, updated_at 
           FROM scenes 
           WHERE user_id = $1 
           ORDER BY updated_at DESC 
           LIMIT 50`,
          [socket.userId]
        );

        socket.emit('scene:list', result.rows);
      } catch (error) {
        console.error('Ошибка получения списка сцен:', error);
        socket.emit('error', { message: 'Ошибка получения списка сцен' });
      }
    });

    // Отключение
    socket.on('disconnect', () => {
      console.log(`🔌 Socket.IO отключение: ${socket.id}`);
    });
  });

  return sceneState;
}

