// Socket.IO обработчики для 3D-сцены
// Все события синхронизируются между подключенными клиентами

import pool from '../db.mjs';

export function setupSceneHandlers(io, sessionStore) {
  // Хранилище состояния сцены (в памяти, для real-time синхронизации)
  // В production можно использовать Redis для масштабирования
  const sceneState = {
    entities: [],
    connections: [],
    lastUpdate: Date.now(),
    currentSceneId: null // Текущая активная сцена (null означает entities без сцены)
  };

  // Debounce для автоматического сохранения сцены в БД
  const saveTimeouts = new Map(); // userId -> timeout
  const SAVE_DEBOUNCE_MS = 2000; // Сохраняем через 2 секунды после последнего изменения

  // Функция автоматического сохранения entities в БД
  // sceneId может быть null, если entities создаются без сцены
  async function saveSceneToDatabase(userId, state, sceneId = null) {
    console.log(`🔍 saveSceneToDatabase вызвана: userId=${userId}, entities=${state.entities.length}, connections=${state.connections.length}`);
    
    if (!userId) {
      console.log('⚠️ saveSceneToDatabase: userId отсутствует, сохранение пропущено');
      return; // Не сохраняем для анонимных пользователей
    }

    // Отменяем предыдущий таймер для этого пользователя
    if (saveTimeouts.has(userId)) {
      clearTimeout(saveTimeouts.get(userId));
      console.log(`⏱️ Предыдущий таймер сохранения отменен для userId=${userId}`);
    }

    // Устанавливаем новый таймер
    const timeout = setTimeout(async () => {
      try {
        console.log(`💾 Начинаем сохранение сцены в БД для userId=${userId}`);
        
        // Проверяем подключение к БД
        const testQuery = await pool.query('SELECT NOW()');
        console.log(`✅ Подключение к БД работает, текущее время: ${testQuery.rows[0].now}`);
        
        // Используем переданный sceneId (может быть null для entities без сцены)
        // Если sceneId не передан, используем null (entities без сцены)

        // Сохраняем сущности
        // Если sceneId есть, сохраняем entities с этим scene_id
        // Если sceneId нет, сохраняем entities с scene_id = NULL (entities без сцены)
        console.log(`📊 Сохранение ${state.entities.length} сущностей...`);
        for (const entity of state.entities) {
          await pool.query(
            `INSERT INTO entities (id, scene_id, user_id, name, description, type, color, position, size, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               type = EXCLUDED.type,
               color = EXCLUDED.color,
               position = EXCLUDED.position,
               size = EXCLUDED.size,
               scene_id = EXCLUDED.scene_id,
               updated_at = CURRENT_TIMESTAMP`,
            [
              entity.id,
              sceneId || null, // Если sceneId нет, сохраняем с NULL
              userId,
              entity.name || 'Untitled Entity',
              entity.description || '',
              entity.type || 'box',
              entity.color || '#3b82f6',
              JSON.stringify(entity.position || [0, 0, 0]),
              JSON.stringify(entity.size || [1, 1, 1]),
              entity.createdBy || userId
            ]
          );
        }
        console.log(`✅ Сохранено ${state.entities.length} сущностей${sceneId ? ` для сцены ${sceneId}` : ' без сцены'}`);

        // Удаляем сущности, которых нет в текущем состоянии
        const entityIds = state.entities.map(e => e.id);
        if (entityIds.length > 0) {
          await pool.query(
            `DELETE FROM entities WHERE scene_id = $1 AND id != ALL($2::text[])`,
            [sceneId, entityIds]
          );
        } else {
          // Если нет сущностей, удаляем все для этой сцены
          await pool.query(
            `DELETE FROM entities WHERE scene_id = $1`,
            [sceneId]
          );
        }

        // Сохраняем связи
        console.log(`📊 Сохранение ${state.connections.length} связей...`);
        for (const connection of state.connections) {
          await pool.query(
            `INSERT INTO connections (id, scene_id, user_id, from_entity_id, to_entity_id, type, bidirectional, label, color, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               type = EXCLUDED.type,
               bidirectional = EXCLUDED.bidirectional,
               label = EXCLUDED.label,
               color = EXCLUDED.color,
               updated_at = CURRENT_TIMESTAMP`,
            [
              connection.id,
              sceneId,
              userId,
              connection.from,
              connection.to,
              connection.type || 'one-way',
              connection.bidirectional || false,
              connection.label || '',
              connection.color || '#ffffff',
              connection.createdBy || userId
            ]
          );
        }
        console.log(`✅ Сохранено ${state.connections.length} связей`);

        // Удаляем связи, которых нет в текущем состоянии
        // Если sceneId есть, удаляем connections этой сцены, которых нет в состоянии
        // Если sceneId нет, удаляем connections без сцены, которых нет в состоянии
        const connectionIds = state.connections.map(c => c.id);
        if (connectionIds.length > 0) {
          if (sceneId) {
            await pool.query(
              `DELETE FROM connections WHERE scene_id = $1 AND id != ALL($2::text[])`,
              [sceneId, connectionIds]
            );
          } else {
            await pool.query(
              `DELETE FROM connections WHERE user_id = $1 AND scene_id IS NULL AND id != ALL($2::text[])`,
              [userId, connectionIds]
            );
          }
        } else {
          if (sceneId) {
            await pool.query(
              `DELETE FROM connections WHERE scene_id = $1`,
              [sceneId]
            );
          } else {
            await pool.query(
              `DELETE FROM connections WHERE user_id = $1 AND scene_id IS NULL`,
              [userId]
            );
          }
        }

        console.log(`✅ Сцена полностью сохранена в БД: scene_id=${sceneId}, entities=${state.entities.length}, connections=${state.connections.length}`);
        saveTimeouts.delete(userId);
      } catch (error) {
        console.error('❌ Ошибка автоматического сохранения сцены:', error);
        console.error('❌ Детали ошибки:', {
          message: error.message,
          stack: error.stack,
          code: error.code
        });
        saveTimeouts.delete(userId);
      }
    }, SAVE_DEBOUNCE_MS);

    saveTimeouts.set(userId, timeout);
    console.log(`⏱️ Таймер сохранения установлен для userId=${userId}, сработает через ${SAVE_DEBOUNCE_MS}ms`);
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
      let loadedSceneId = null;
      
      // Если пользователь авторизован, пытаемся загрузить его дефолтную сцену (первую корневую)
      if (socket.userId) {
        try {
          // Сначала ищем корневую сцену (parent_id IS NULL) с наибольшим количеством entities
          // Это будет дефолтная сцена, в которой показываются все остальные
          let sceneResult = await pool.query(
            `SELECT s.id, COUNT(e.id) as entities_count
             FROM scenes s
             LEFT JOIN entities e ON e.scene_id = s.id
             WHERE s.user_id = $1 AND s.parent_id IS NULL
             GROUP BY s.id
             ORDER BY entities_count DESC, s.created_at ASC
             LIMIT 1`,
            [socket.userId]
          );
          
          // Если корневой сцены нет, берем последнюю обновленную
          if (sceneResult.rows.length === 0) {
            sceneResult = await pool.query(
              `SELECT id FROM scenes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
              [socket.userId]
            );
          }

          if (sceneResult.rows.length > 0) {
            const sceneId = sceneResult.rows[0].id;
            loadedSceneId = sceneId;
            
            // Загружаем сущности из БД
            const entitiesResult = await pool.query(
              `SELECT id, name, description, type, color, position, size, created_at, updated_at, created_by
               FROM entities WHERE scene_id = $1 ORDER BY created_at`,
              [sceneId]
            );
            
            // Загружаем связи из БД
            const connectionsResult = await pool.query(
              `SELECT id, from_entity_id, to_entity_id, type, bidirectional, label, color, created_at, updated_at, created_by
               FROM connections WHERE scene_id = $1 ORDER BY created_at`,
              [sceneId]
            );
            
            // Преобразуем данные из БД в формат приложения
            sceneState.entities = entitiesResult.rows.map(row => ({
              id: row.id,
              name: row.name,
              description: row.description || '',
              type: row.type,
              color: row.color,
              position: typeof row.position === 'string' ? JSON.parse(row.position) : row.position,
              size: typeof row.size === 'string' ? JSON.parse(row.size) : row.size,
              createdAt: row.created_at?.getTime() || Date.now(),
              updatedAt: row.updated_at?.getTime() || Date.now(),
              createdBy: row.created_by
            }));
            
            sceneState.connections = connectionsResult.rows.map(row => ({
              id: row.id,
              from: row.from_entity_id,
              to: row.to_entity_id,
              type: row.type,
              bidirectional: row.bidirectional,
              label: row.label || '',
              color: row.color,
              createdAt: row.created_at?.getTime() || Date.now(),
              updatedAt: row.updated_at?.getTime() || Date.now(),
              createdBy: row.created_by
            }));
            
            sceneState.lastUpdate = Date.now();
            
            console.log(`📥 Загружена сохраненная сцена для пользователя ${socket.userId}: ${sceneState.entities.length} сущностей, ${sceneState.connections.length} связей`);
          } else {
            // Если нет сохраненной сцены, загружаем entities без сцены (scene_id IS NULL)
            console.log(`📥 Нет сохраненной сцены для пользователя ${socket.userId}, загружаем entities без сцены`);
            
            const entitiesResult = await pool.query(
              `SELECT id, name, description, type, color, position, size, created_at, updated_at, created_by
               FROM entities WHERE user_id = $1 AND scene_id IS NULL ORDER BY created_at`,
              [socket.userId]
            );
            
            const connectionsResult = await pool.query(
              `SELECT c.id, c.from_entity_id, c.to_entity_id, c.type, c.bidirectional, c.label, c.color, c.created_at, c.updated_at, c.created_by
               FROM connections c
               INNER JOIN entities e1 ON e1.id = c.from_entity_id
               INNER JOIN entities e2 ON e2.id = c.to_entity_id
               WHERE c.user_id = $1 AND (e1.scene_id IS NULL AND e2.scene_id IS NULL)
               ORDER BY c.created_at`,
              [socket.userId]
            );
            
            sceneState.entities = entitiesResult.rows.map(row => ({
              id: row.id,
              name: row.name,
              description: row.description || '',
              type: row.type,
              color: row.color,
              position: typeof row.position === 'string' ? JSON.parse(row.position) : row.position,
              size: typeof row.size === 'string' ? JSON.parse(row.size) : row.size,
              createdAt: row.created_at?.getTime() || Date.now(),
              updatedAt: row.updated_at?.getTime() || Date.now(),
              createdBy: row.created_by
            }));
            
            sceneState.connections = connectionsResult.rows.map(row => ({
              id: row.id,
              from: row.from_entity_id,
              to: row.to_entity_id,
              type: row.type,
              bidirectional: row.bidirectional,
              label: row.label || '',
              color: row.color,
              createdAt: row.created_at?.getTime() || Date.now(),
              updatedAt: row.updated_at?.getTime() || Date.now(),
              createdBy: row.created_by
            }));
            
            sceneState.lastUpdate = Date.now();
            
            console.log(`📥 Загружены entities без сцены для пользователя ${socket.userId}: ${sceneState.entities.length} сущностей, ${sceneState.connections.length} связей`);
          }
        } catch (error) {
          console.error('❌ Ошибка загрузки сцены при присоединении:', error);
        }
      }

      // Обновляем currentSceneId в состоянии
      sceneState.currentSceneId = loadedSceneId;
      
      // Отправляем состояние сцены и ID сцены, если она была загружена
      // Если sceneId = null, но есть entities, это означает, что показываем entities без сцены
      socket.emit('scene:state', {
        entities: sceneState.entities,
        connections: sceneState.connections,
        sceneId: loadedSceneId
      });
      
      // Отправляем информацию о загруженной сцене только если она была реально создана пользователем
      if (loadedSceneId) {
        try {
          const sceneInfo = await pool.query(
            'SELECT name FROM scenes WHERE id = $1 AND user_id = $2',
            [loadedSceneId, socket.userId]
          );
          if (sceneInfo.rows.length > 0) {
            socket.emit('scene:loaded', {
              id: loadedSceneId,
              name: sceneInfo.rows[0].name
            });
          }
        } catch (error) {
          console.error('❌ Ошибка получения информации о сцене:', error);
        }
      }
      
      console.log(`📥 Клиент ${socket.id} присоединился к сцене${loadedSceneId ? ` (scene_id=${loadedSceneId})` : ''}`);
    });

    // Создание новой сущности (куба)
    socket.on('entity:create', (entityData) => {
      console.log('🔍 entity:create event:', { 
        socketId: socket.id, 
        userId: socket.userId,
        userName: socket.userName,
        entityData 
      });
      
      if (!socket.userId) {
        console.log('❌ entity:create: userId отсутствует для socket', socket.id);
        socket.emit('error', { message: 'Требуется авторизация для создания сущностей' });
        return;
      }
      
      console.log(`✅ entity:create: userId=${socket.userId} установлен, продолжаем создание`);

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
      
      // Автоматическое сохранение entities в БД
      // Используем currentSceneId из состояния (может быть null для entities без сцены)
      saveSceneToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
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
      
      // Автоматическое сохранение entities в БД
      // Используем currentSceneId из состояния (может быть null для entities без сцены)
      saveSceneToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
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
      
      // Автоматическое сохранение entities в БД
      // Используем currentSceneId из состояния (может быть null для entities без сцены)
      saveSceneToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
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
      
      // Автоматическое сохранение entities в БД
      // Используем currentSceneId из состояния (может быть null для entities без сцены)
      saveSceneToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
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
      
      // Автоматическое сохранение entities в БД
      // Используем currentSceneId из состояния (может быть null для entities без сцены)
      saveSceneToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
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
      
      // Автоматическое сохранение entities в БД
      // Используем currentSceneId из состояния (может быть null для entities без сцены)
      saveSceneToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
    });

    // Сохранение сцены в БД (ручное сохранение с именем)
    socket.on('scene:save', async (sceneData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { name, description } = sceneData;
        const data = sceneData.data || {
          entities: sceneState.entities,
          connections: sceneState.connections
        };
        
        // Создаем новую сцену с именем и описанием
        const sceneResult = await pool.query(
          `INSERT INTO scenes (user_id, name, description) 
           VALUES ($1, $2, $3) 
           RETURNING id, created_at`,
          [socket.userId, name || 'Untitled Scene', description || null]
        );
        
        const sceneId = sceneResult.rows[0].id;
        
        // Сохраняем сущности
        for (const entity of data.entities || []) {
          await pool.query(
            `INSERT INTO entities (id, scene_id, user_id, name, description, type, color, position, size, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               type = EXCLUDED.type,
               color = EXCLUDED.color,
               position = EXCLUDED.position,
               size = EXCLUDED.size,
               updated_at = CURRENT_TIMESTAMP`,
            [
              entity.id,
              sceneId,
              socket.userId,
              entity.name || 'Untitled Entity',
              entity.description || '',
              entity.type || 'box',
              entity.color || '#3b82f6',
              JSON.stringify(entity.position || [0, 0, 0]),
              JSON.stringify(entity.size || [1, 1, 1]),
              entity.createdBy || socket.userId
            ]
          );
        }
        
        // Сохраняем связи
        for (const connection of data.connections || []) {
          await pool.query(
            `INSERT INTO connections (id, scene_id, user_id, from_entity_id, to_entity_id, type, bidirectional, label, color, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               type = EXCLUDED.type,
               bidirectional = EXCLUDED.bidirectional,
               label = EXCLUDED.label,
               color = EXCLUDED.color,
               updated_at = CURRENT_TIMESTAMP`,
            [
              connection.id,
              sceneId,
              socket.userId,
              connection.from,
              connection.to,
              connection.type || 'one-way',
              connection.bidirectional || false,
              connection.label || '',
              connection.color || '#ffffff',
              connection.createdBy || socket.userId
            ]
          );
        }

        socket.emit('scene:saved', {
          id: sceneResult.rows[0].id,
          name: name || 'Untitled Scene',
          createdAt: sceneResult.rows[0].created_at
        });

        console.log(`💾 Сцена сохранена пользователем ${socket.userId}, scene_id=${sceneId}`);
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
        const sceneResult = await pool.query(
          `SELECT id, name, description, created_at, updated_at 
           FROM scenes 
           WHERE id = $1 AND user_id = $2`,
          [sceneId, socket.userId]
        );

        if (sceneResult.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        const scene = sceneResult.rows[0];
        
        // Загружаем сущности из БД
        const entitiesResult = await pool.query(
          `SELECT id, name, description, type, color, position, size, created_at, updated_at, created_by
           FROM entities WHERE scene_id = $1 ORDER BY created_at`,
          [sceneId]
        );
        
        // Загружаем связи из БД
        const connectionsResult = await pool.query(
          `SELECT id, from_entity_id, to_entity_id, type, bidirectional, label, color, created_at, updated_at, created_by
           FROM connections WHERE scene_id = $1 ORDER BY created_at`,
          [sceneId]
        );
        
        // Преобразуем данные из БД в формат приложения
        sceneState.entities = entitiesResult.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          type: row.type,
          color: row.color,
          position: typeof row.position === 'string' ? JSON.parse(row.position) : row.position,
          size: typeof row.size === 'string' ? JSON.parse(row.size) : row.size,
          createdAt: row.created_at?.getTime() || Date.now(),
          updatedAt: row.updated_at?.getTime() || Date.now(),
          createdBy: row.created_by
        }));
        
        sceneState.connections = connectionsResult.rows.map(row => ({
          id: row.id,
          from: row.from_entity_id,
          to: row.to_entity_id,
          type: row.type,
          bidirectional: row.bidirectional,
          label: row.label || '',
          color: row.color,
          createdAt: row.created_at?.getTime() || Date.now(),
          updatedAt: row.updated_at?.getTime() || Date.now(),
          createdBy: row.created_by
        }));
        
        sceneState.lastUpdate = Date.now();
        sceneState.currentSceneId = sceneId; // Обновляем текущую сцену

        // Синхронизируем со всеми клиентами
        io.emit('scene:state', {
          entities: sceneState.entities,
          connections: sceneState.connections,
          sceneId: sceneId
        });

        // Обновляем updated_at в БД при загрузке
        await pool.query(
          `UPDATE scenes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sceneId]
        );

        socket.emit('scene:loaded', {
          id: sceneResult.rows[0].id,
          name: sceneResult.rows[0].name,
          createdAt: sceneResult.rows[0].created_at
        });

        console.log(`📥 Сцена ${sceneId} загружена пользователем ${socket.userId}: ${sceneState.entities.length} сущностей, ${sceneState.connections.length} связей`);
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
          `SELECT id, name, description, parent_id, position_2d, size_2d, created_at, updated_at 
           FROM scenes 
           WHERE user_id = $1 
           ORDER BY updated_at DESC 
           LIMIT 50`,
          [socket.userId]
        );

        // Преобразуем position_2d и size_2d из JSONB в массив
        const scenes = result.rows.map(row => ({
          ...row,
          position_2d: row.position_2d || [0, 0],
          size_2d: row.size_2d || [200, 150],
          parent_id: row.parent_id || null
        }));

        socket.emit('scene:list', scenes);
      } catch (error) {
        console.error('Ошибка получения списка сцен:', error);
        socket.emit('error', { message: 'Ошибка получения списка сцен' });
      }
    });

    // Создание новой пустой сцены
    socket.on('scene:create', async (sceneData) => {
      console.log(`📝 Запрос на создание сцены от пользователя ${socket.userId}:`, sceneData);
      
      if (!socket.userId) {
        console.error('❌ Создание сцены: требуется авторизация');
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { name, description } = sceneData;
        
        if (!name || name.trim() === '') {
          console.error('❌ Создание сцены: имя не указано');
          socket.emit('error', { message: 'Имя сцены обязательно' });
          return;
        }

        const { parent_id, position_2d } = sceneData;
        
        console.log(`💾 Вставляем сцену в БД: userId=${socket.userId}, name="${name.trim()}"`);
        const sceneResult = await pool.query(
          `INSERT INTO scenes (user_id, name, description, parent_id, position_2d, size_2d) 
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) 
           RETURNING id, name, description, parent_id, position_2d, size_2d, created_at, updated_at`,
          [
            socket.userId, 
            name.trim(), 
            (description || '').trim() || null,
            parent_id || null,
            JSON.stringify(position_2d || [0, 0]),
            JSON.stringify(sceneData.size_2d || [200, 150])
          ]
        );

        const newScene = sceneResult.rows[0];
        newScene.position_2d = newScene.position_2d || [0, 0];
        newScene.size_2d = newScene.size_2d || [200, 150];
        newScene.parent_id = newScene.parent_id || null;
        console.log(`✅ Сцена создана в БД:`, newScene);
        
        // Очищаем текущее состояние сцены только для этого пользователя
        // Не отправляем scene:state всем, так как каждый клиент должен загрузить сцену явно
        sceneState.entities = [];
        sceneState.connections = [];
        sceneState.lastUpdate = Date.now();

        // Отправляем событие создания сцены
        console.log(`📤 Отправляем событие scene:created клиенту ${socket.id}`);
        socket.emit('scene:created', newScene);
        
        // Синхронизируем со всеми клиентами
        io.emit('scene:created', newScene);
        console.log(`✨ Создана новая сцена ${newScene.id} пользователем ${socket.userId}`);
      } catch (error) {
        console.error('❌ Ошибка создания сцены:', error);
        socket.emit('error', { message: 'Ошибка создания сцены' });
      }
    });

    // Удаление сцены
    socket.on('scene:delete', async (sceneId) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        // Проверяем, что сцена принадлежит пользователю
        const sceneResult = await pool.query(
          `SELECT id FROM scenes WHERE id = $1 AND user_id = $2`,
          [sceneId, socket.userId]
        );

        if (sceneResult.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена или нет доступа' });
          return;
        }

        // Перемещаем дочерние сцены на верхний уровень
        await pool.query(
          `UPDATE scenes SET parent_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE parent_id = $1`,
          [sceneId]
        );

        // Удаляем связи, связанные с этой сценой
        await pool.query(
          `DELETE FROM scene_connections WHERE from_scene_id = $1 OR to_scene_id = $1`,
          [sceneId]
        );

        // Удаляем сцену (сущности и связи удалятся автоматически через CASCADE)
        await pool.query(
          `DELETE FROM scenes WHERE id = $1`,
          [sceneId]
        );

        // Очищаем состояние сцены, так как удаленная сцена могла быть загружена
        sceneState.entities = [];
        sceneState.connections = [];
        sceneState.lastUpdate = Date.now();

        // Отправляем пустое состояние всем клиентам
        io.emit('scene:state', {
          entities: [],
          connections: [],
          sceneId: null
        });

        // Синхронизируем со всеми клиентами
        io.emit('scene:deleted', { id: sceneId });
        socket.emit('scene:deleted', { id: sceneId });
        console.log(`🗑️ Сцена ${sceneId} удалена пользователем ${socket.userId}`);
      } catch (error) {
        console.error('Ошибка удаления сцены:', error);
        socket.emit('error', { message: 'Ошибка удаления сцены' });
      }
    });

    // Вспомогательная функция для проверки циклических зависимостей
    async function checkCircularDependency(sceneId, parentId) {
      if (!parentId || sceneId === parentId) {
        return false; // Нет цикла, если нет родителя или это та же сцена
      }

      // Проверяем, не является ли сцена предком своего потенциального родителя
      let currentId = parentId;
      const visited = new Set([sceneId]);
      
      while (currentId) {
        if (visited.has(currentId)) {
          return true; // Обнаружен цикл
        }
        visited.add(currentId);
        
        const result = await pool.query(
          'SELECT parent_id FROM scenes WHERE id = $1',
          [currentId]
        );
        
        if (result.rows.length === 0 || !result.rows[0].parent_id) {
          break;
        }
        currentId = result.rows[0].parent_id;
      }
      
      return false;
    }

    // Обновление позиции сцены на 2D-карте
    socket.on('scene:update-position', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { sceneId, position2D } = data;
        
        if (!sceneId || !Array.isArray(position2D) || position2D.length !== 2) {
          socket.emit('error', { message: 'Неверные данные' });
          return;
        }

        // Проверяем права доступа
        const sceneCheck = await pool.query(
          'SELECT id FROM scenes WHERE id = $1 AND user_id = $2',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Обновляем позицию
        await pool.query(
          `UPDATE scenes SET position_2d = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [JSON.stringify(position2D), sceneId]
        );

        // Синхронизируем со всеми клиентами
        io.emit('scene:position-updated', {
          sceneId,
          position2D
        });

        console.log(`📍 Позиция сцены ${sceneId} обновлена: [${position2D[0]}, ${position2D[1]}]`);
      } catch (error) {
        console.error('Ошибка обновления позиции сцены:', error);
        socket.emit('error', { message: 'Ошибка обновления позиции сцены' });
      }
    });

    // Обновление размера сцены
    socket.on('scene:update-size', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { sceneId, size2D } = data;
        
        if (!sceneId || !Array.isArray(size2D) || size2D.length !== 2) {
          socket.emit('error', { message: 'Неверные данные' });
          return;
        }

        // Проверяем права доступа к сцене
        const sceneCheck = await pool.query(
          'SELECT id FROM scenes WHERE id = $1 AND user_id = $2',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Обновляем размер сцены
        await pool.query(
          `UPDATE scenes SET size_2d = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [JSON.stringify(size2D), sceneId]
        );

        // Синхронизируем со всеми клиентами
        io.emit('scene:size-updated', {
          sceneId,
          size2D
        });

        console.log(`📏 Размер сцены ${sceneId} обновлен: [${size2D[0]}, ${size2D[1]}]`);
      } catch (error) {
        console.error('Ошибка обновления размера сцены:', error);
        socket.emit('error', { message: 'Ошибка обновления размера сцены' });
      }
    });

    // Обновление названия и описания сцены
    socket.on('scene:update', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { sceneId, name, description } = data;
        
        if (!sceneId) {
          socket.emit('error', { message: 'ID сцены обязателен' });
          return;
        }

        // Проверяем права доступа к сцене
        const sceneCheck = await pool.query(
          'SELECT id FROM scenes WHERE id = $1 AND user_id = $2',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Обновляем название и описание сцены
        await pool.query(
          `UPDATE scenes SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [name || '', description || '', sceneId]
        );

        // Синхронизируем со всеми клиентами
        io.emit('scene:updated', {
          sceneId,
          name: name || '',
          description: description || ''
        });

        console.log(`📝 Сцена ${sceneId} обновлена: name="${name || ''}", description="${description || ''}"`);
      } catch (error) {
        console.error('Ошибка обновления сцены:', error);
        socket.emit('error', { message: 'Ошибка обновления сцены' });
      }
    });

    // Установка родительской сцены (вложение/вытаскивание)
    socket.on('scene:set-parent', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { sceneId, parentId, position2D } = data;
        
        if (!sceneId) {
          socket.emit('error', { message: 'ID сцены обязателен' });
          return;
        }

        // Проверяем права доступа к сцене
        const sceneCheck = await pool.query(
          'SELECT id FROM scenes WHERE id = $1 AND user_id = $2',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Если указан parentId, проверяем права доступа к родительской сцене
        if (parentId) {
          const parentCheck = await pool.query(
            'SELECT id FROM scenes WHERE id = $1 AND user_id = $2',
            [parentId, socket.userId]
          );

          if (parentCheck.rows.length === 0) {
            socket.emit('error', { message: 'Родительская сцена не найдена' });
            return;
          }

          // Проверяем циклические зависимости
          const hasCycle = await checkCircularDependency(sceneId, parentId);
          if (hasCycle) {
            socket.emit('error', { message: 'Невозможно создать циклическую зависимость' });
            return;
          }
        }

        // Обновляем parent_id и опционально позицию одновременно
        if (position2D && Array.isArray(position2D) && position2D.length === 2) {
          // Обновляем и parent_id, и позицию одновременно (при извлечении)
          await pool.query(
            `UPDATE scenes SET parent_id = $1, position_2d = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [parentId || null, JSON.stringify(position2D), sceneId]
          );
          console.log(`🔗 Сцена ${sceneId}: parent_id = ${parentId || 'null'}, позиция = [${position2D[0]}, ${position2D[1]}]`);
          
          // Отправляем оба события: обновление родителя И обновление позиции
          io.emit('scene:parent-updated', {
            sceneId,
            parentId: parentId || null
          });
          io.emit('scene:position-updated', {
            sceneId,
            position2D
          });
        } else {
          // Обновляем только parent_id (при вложении)
          await pool.query(
            `UPDATE scenes SET parent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [parentId || null, sceneId]
          );
          
          // Синхронизируем со всеми клиентами
          io.emit('scene:parent-updated', {
            sceneId,
            parentId: parentId || null
          });
        }

        console.log(`🔗 Родитель сцены ${sceneId} обновлен: ${parentId || 'null'}`);
      } catch (error) {
        console.error('Ошибка установки родительской сцены:', error);
        socket.emit('error', { message: 'Ошибка установки родительской сцены' });
      }
    });

    // Создание связи между сценами
    socket.on('scene-connection:create', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { fromSceneId, toSceneId, type = 'one-way', bidirectional = false, label, color = '#ffffff' } = data;
        
        if (!fromSceneId || !toSceneId) {
          socket.emit('error', { message: 'ID сцен обязательны' });
          return;
        }

        if (fromSceneId === toSceneId) {
          socket.emit('error', { message: 'Нельзя создать связь сцены с самой собой' });
          return;
        }

        // Проверяем права доступа к обеим сценам
        const scenesCheck = await pool.query(
          'SELECT id FROM scenes WHERE id IN ($1, $2) AND user_id = $3',
          [fromSceneId, toSceneId, socket.userId]
        );

        if (scenesCheck.rows.length !== 2) {
          socket.emit('error', { message: 'Одна из сцен не найдена или нет доступа' });
          return;
        }

        // Проверяем, нет ли уже такой связи
        const existingCheck = await pool.query(
          `SELECT id FROM scene_connections 
           WHERE from_scene_id = $1 AND to_scene_id = $2 AND user_id = $3`,
          [fromSceneId, toSceneId, socket.userId]
        );

        if (existingCheck.rows.length > 0) {
          socket.emit('error', { message: 'Связь уже существует' });
          return;
        }

        const connectionId = `scene-conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Создаем связь
        const result = await pool.query(
          `INSERT INTO scene_connections 
           (id, from_scene_id, to_scene_id, type, bidirectional, label, color, user_id, created_by) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
           RETURNING id, from_scene_id, to_scene_id, type, bidirectional, label, color, created_at`,
          [connectionId, fromSceneId, toSceneId, type, bidirectional, label || null, color, socket.userId, socket.userId]
        );

        const newConnection = {
          id: result.rows[0].id,
          from: result.rows[0].from_scene_id,
          to: result.rows[0].to_scene_id,
          type: result.rows[0].type,
          bidirectional: result.rows[0].bidirectional,
          label: result.rows[0].label || '',
          color: result.rows[0].color,
          createdAt: result.rows[0].created_at?.getTime() || Date.now()
        };

        // Синхронизируем со всеми клиентами
        io.emit('scene-connection:created', newConnection);

        socket.emit('scene-connection:created', newConnection);
        console.log(`🔗 Связь между сценами создана: ${fromSceneId} -> ${toSceneId}`);
      } catch (error) {
        console.error('Ошибка создания связи между сценами:', error);
        socket.emit('error', { message: 'Ошибка создания связи между сценами' });
      }
    });

    // Удаление связи между сценами
    socket.on('scene-connection:delete', async (connectionId) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        if (!connectionId) {
          socket.emit('error', { message: 'ID связи обязателен' });
          return;
        }

        // Проверяем права доступа
        const connectionCheck = await pool.query(
          'SELECT id FROM scene_connections WHERE id = $1 AND user_id = $2',
          [connectionId, socket.userId]
        );

        if (connectionCheck.rows.length === 0) {
          socket.emit('error', { message: 'Связь не найдена или нет доступа' });
          return;
        }

        // Удаляем связь
        await pool.query(
          'DELETE FROM scene_connections WHERE id = $1',
          [connectionId]
        );

        // Синхронизируем со всеми клиентами
        io.emit('scene-connection:deleted', { id: connectionId });

        console.log(`🗑️ Связь между сценами удалена: ${connectionId}`);
      } catch (error) {
        console.error('Ошибка удаления связи между сценами:', error);
        socket.emit('error', { message: 'Ошибка удаления связи между сценами' });
      }
    });

    // Получение всех сцен с их связями
    socket.on('scene:list-with-connections', async () => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        // Получаем все сцены
        const scenesResult = await pool.query(
          `SELECT id, name, description, parent_id, position_2d, size_2d, created_at, updated_at 
           FROM scenes 
           WHERE user_id = $1 
           ORDER BY updated_at DESC`,
          [socket.userId]
        );

        const scenes = scenesResult.rows.map(row => ({
          ...row,
          position_2d: row.position_2d || [0, 0],
          size_2d: row.size_2d || [200, 150],
          parent_id: row.parent_id || null
        }));

        // Получаем все связи между сценами
        const connectionsResult = await pool.query(
          `SELECT id, from_scene_id, to_scene_id, type, bidirectional, label, color, created_at 
           FROM scene_connections 
           WHERE user_id = $1`,
          [socket.userId]
        );

        const connections = connectionsResult.rows.map(row => ({
          id: row.id,
          from: row.from_scene_id,
          to: row.to_scene_id,
          type: row.type,
          bidirectional: row.bidirectional,
          label: row.label || '',
          color: row.color,
          createdAt: row.created_at?.getTime() || Date.now()
        }));

        socket.emit('scene:list-with-connections', {
          scenes,
          connections
        });
      } catch (error) {
        console.error('Ошибка получения списка сцен с связями:', error);
        socket.emit('error', { message: 'Ошибка получения списка сцен с связями' });
      }
    });

    // Отключение
    socket.on('disconnect', () => {
      console.log(`🔌 Socket.IO отключение: ${socket.id}`);
    });
  });

  return sceneState;
}

