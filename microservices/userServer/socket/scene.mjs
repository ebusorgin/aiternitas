// Socket.IO обработчики для 3D-сцены
// Все события синхронизируются между подключенными клиентами

import pool from '../db.mjs';

export function setupSceneHandlers(io, sessionStore) {
  // Хранилище состояния сцены (в памяти, для real-time синхронизации)
  // В production можно использовать Redis для масштабирования
  const sceneState = {
    elements: [],
    connections: [],
    lastUpdate: Date.now(),
    currentSceneId: null // Текущая активная сцена (null означает элементы без сцены)
  };

  // Debounce для автоматического сохранения сцены в БД
  const saveTimeouts = new Map(); // userId -> timeout
  const SAVE_DEBOUNCE_MS = 2000; // Сохраняем через 2 секунды после последнего изменения

  // Функция автоматического сохранения элементов в БД
  // sceneId может быть null, если элементы создаются без сцены
  async function saveElementsToDatabase(userId, state, sceneId = null) {
    console.log(`🔍 saveElementsToDatabase вызвана: userId=${userId}, elements=${state.elements.length}`);
    
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
        
        // Используем переданный sceneId (может быть null для elements без сцены)
        // Если sceneId не передан, используем null (elements без сцены)

        // Сохраняем элементы
        // Если sceneId есть, сохраняем элементы с этим parent_id
        // Если sceneId нет, сохраняем элементы с parent_id = NULL (элементы без сцены)
        console.log(`📊 Сохранение ${state.elements.length} элементов...`);
        for (const element of state.elements) {
          await pool.query(
            `INSERT INTO elements (id, user_id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               element_type = EXCLUDED.element_type,
               type = EXCLUDED.type,
               parent_id = EXCLUDED.parent_id,
               position_2d = EXCLUDED.position_2d,
               position = EXCLUDED.position,
               size_2d = EXCLUDED.size_2d,
               size = EXCLUDED.size,
               color = EXCLUDED.color,
               emissive = EXCLUDED.emissive,
               background = EXCLUDED.background,
               show_grid = EXCLUDED.show_grid,
               updated_at = CURRENT_TIMESTAMP`,
            [
              element.id,
              userId,
              element.name || 'Untitled Element',
              element.description || '',
              element.elementType || 'worker',
              element.type || null,
              element.parent_id || sceneId || null,
              element.position_2d ? JSON.stringify(element.position_2d) : null,
              element.position ? JSON.stringify(element.position) : null,
              element.size_2d ? JSON.stringify(element.size_2d) : null,
              element.size ? JSON.stringify(element.size) : null,
              element.color || null,
              element.emissive || null,
              element.background || null,
              element.showGrid !== undefined ? element.showGrid : null,
              element.createdBy || userId
            ]
          );
        }
        console.log(`✅ Сохранено ${state.elements.length} элементов${sceneId ? ` для сцены ${sceneId}` : ' без сцены'}`);

        // ВАЖНО: Не удаляем элементы автоматически при сохранении
        // Удаление должно происходить только явно через element:delete
        // Это предотвращает случайное удаление элементов при сохранении одной сцены
        // Элементы могут принадлежать разным сценам или не иметь сцены вообще

        // ПРИМЕЧАНИЕ: Связи (connections) больше не сохраняются здесь,
        // так как они сохраняются напрямую в БД через connection:create/update/delete
        // Это предотвращает конфликты и дублирование сохранения

        console.log(`✅ Сцена полностью сохранена в БД: scene_id=${sceneId}, elements=${state.elements.length}`);
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

          return
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
          // Сначала ищем корневую сцену (parent_id IS NULL) с наибольшим количеством элементов
          // Это будет дефолтная сцена, в которой показываются все остальные
          let sceneResult = await pool.query(
            `SELECT s.id, COUNT(e.id) as elements_count
             FROM elements s
             LEFT JOIN elements e ON e.parent_id = s.id
             WHERE s.user_id = $1 AND s.element_type = 'scene' AND s.parent_id IS NULL
             GROUP BY s.id
             ORDER BY elements_count DESC, s.created_at ASC
             LIMIT 1`,
            [socket.userId]
          );
          
          // Если корневой сцены нет, берем последнюю обновленную
          if (sceneResult.rows.length === 0) {
            sceneResult = await pool.query(
              `SELECT id FROM elements WHERE user_id = $1 AND element_type = 'scene' ORDER BY updated_at DESC LIMIT 1`,
              [socket.userId]
            );
          }

          if (sceneResult.rows.length > 0) {
            const sceneId = sceneResult.rows[0].id;
            loadedSceneId = sceneId;
            
            // Загружаем все дочерние элементы из БД
            const elementsResult = await pool.query(
              `SELECT id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_at, updated_at, created_by
               FROM elements WHERE parent_id = $1 ORDER BY created_at`,
              [sceneId]
            );
            
            // Загружаем связи из БД
            const connectionsResult = await pool.query(
              `SELECT c.id, c.from_element_id, c.to_element_id, c.type, c.bidirectional, c.label, c.color, c.created_at, c.updated_at, c.created_by
               FROM elements_connections c
               INNER JOIN elements e1 ON e1.id = c.from_element_id
               INNER JOIN elements e2 ON e2.id = c.to_element_id
               WHERE c.user_id = $1 AND (e1.parent_id = $2 OR e2.parent_id = $2)
               ORDER BY c.created_at`,
              [socket.userId, sceneId]
            );
            
            // Преобразуем данные из БД в формат приложения
            sceneState.elements = elementsResult.rows.map(row => ({
              id: row.id,
              name: row.name,
              description: row.description || '',
              elementType: row.element_type,
              type: row.type || null,
              parent_id: row.parent_id || null,
              position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : null,
              position: row.position ? (typeof row.position === 'string' ? JSON.parse(row.position) : row.position) : null,
              size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : null,
              size: row.size ? (typeof row.size === 'string' ? JSON.parse(row.size) : row.size) : null,
              color: row.color || null,
              emissive: row.emissive || null,
              background: row.background || null,
              showGrid: row.show_grid !== undefined ? row.show_grid : null,
              createdAt: row.created_at?.getTime() || Date.now(),
              updatedAt: row.updated_at?.getTime() || Date.now(),
              createdBy: row.created_by
            }));
            
            // connections больше не загружаются в sceneState, так как они загружаются отдельно через scene:list-with-connections
            
            sceneState.lastUpdate = Date.now();
            
            console.log(`📥 Загружена сохраненная сцена для пользователя ${socket.userId}: ${sceneState.elements.length} элементов`);
          } else {
            // Если нет сохраненной сцены, загружаем элементы без сцены (parent_id IS NULL)
            console.log(`📥 Нет сохраненной сцены для пользователя ${socket.userId}, загружаем элементы без сцены`);
            
            const elementsResult = await pool.query(
              `SELECT id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_at, updated_at, created_by
               FROM elements WHERE user_id = $1 AND parent_id IS NULL AND element_type != 'scene' ORDER BY created_at`,
              [socket.userId]
            );
            
            const connectionsResult = await pool.query(
              `SELECT c.id, c.from_element_id, c.to_element_id, c.type, c.bidirectional, c.label, c.color, c.created_at, c.updated_at, c.created_by
               FROM elements_connections c
               INNER JOIN elements e1 ON e1.id = c.from_element_id
               INNER JOIN elements e2 ON e2.id = c.to_element_id
               WHERE c.user_id = $1 AND (e1.parent_id IS NULL AND e2.parent_id IS NULL)
               ORDER BY c.created_at`,
              [socket.userId]
            );
            
            sceneState.elements = elementsResult.rows.map(row => ({
              id: row.id,
              name: row.name,
              description: row.description || '',
              elementType: row.element_type,
              type: row.type || null,
              parent_id: row.parent_id || null,
              position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : null,
              position: row.position ? (typeof row.position === 'string' ? JSON.parse(row.position) : row.position) : null,
              size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : null,
              size: row.size ? (typeof row.size === 'string' ? JSON.parse(row.size) : row.size) : null,
              color: row.color || null,
              emissive: row.emissive || null,
              background: row.background || null,
              showGrid: row.show_grid !== undefined ? row.show_grid : null,
              createdAt: row.created_at?.getTime() || Date.now(),
              updatedAt: row.updated_at?.getTime() || Date.now(),
              createdBy: row.created_by
            }));
            
            // connections больше не загружаются в sceneState, так как они загружаются отдельно через scene:list-with-connections
            
            sceneState.lastUpdate = Date.now();
            
            console.log(`📥 Загружены элементы без сцены для пользователя ${socket.userId}: ${sceneState.elements.length} элементов`);
          }
        } catch (error) {
          console.error('❌ Ошибка загрузки сцены при присоединении:', error);
        }
      }

      // Обновляем currentSceneId в состоянии
      sceneState.currentSceneId = loadedSceneId;
      
      // Отправляем состояние сцены и ID сцены, если она была загружена
      // Если sceneId = null, но есть elements, это означает, что показываем elements без сцены
      socket.emit('scene:state', {
        elements: sceneState.elements,
        // connections больше не отправляются здесь, так как они загружаются отдельно через scene:list-with-connections
        sceneId: loadedSceneId
      });
      
      // Отправляем информацию о загруженной сцене только если она была реально создана пользователем
      if (loadedSceneId) {
        try {
          const sceneInfo = await pool.query(
            'SELECT name FROM elements WHERE id = $1 AND user_id = $2 AND element_type = \'scene\'',
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

    // Создание нового элемента
    socket.on('element:create', (elementData) => {
      console.log('🔍 element:create event:', { 
        socketId: socket.id, 
        userId: socket.userId,
        userName: socket.userName,
        elementData 
      });
      
      if (!socket.userId) {
        console.log('❌ element:create: userId отсутствует для socket', socket.id);
        socket.emit('error', { message: 'Требуется авторизация для создания элементов' });
        return;
      }
      
      console.log(`✅ element:create: userId=${socket.userId} установлен, продолжаем создание`);

      const element = {
        id: elementData.id || `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: elementData.name || `Element ${sceneState.elements.length + 1}`,
        description: elementData.description || '',
        color: elementData.color || '#3b82f6',
        emissive: elementData.emissive || null,
        position: elementData.position || [0, 0, 0],
        position_2d: elementData.position_2d || null,
        size: elementData.size || [1, 1, 1],
        size_2d: elementData.size_2d || null,
        type: elementData.type || 'box',
        elementType: elementData.elementType || (elementData.type === 'block' ? 'block' : 'worker'),
        parent_id: elementData.parent_id || null,
        background: elementData.background || null,
        showGrid: elementData.showGrid !== undefined ? elementData.showGrid : null,
        createdAt: Date.now(),
        createdBy: socket.userId
      };

      sceneState.elements.push(element);
      sceneState.lastUpdate = Date.now();

      // Синхронизация со всеми клиентами
      io.emit('element:created', element);
      console.log(`✨ Создан элемент ${element.id} пользователем ${socket.userId}`);
      
      // Автоматическое сохранение элементов в БД
      // Используем currentSceneId из состояния (может быть null для элементов без сцены)
      saveElementsToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
    });

    // Обновление элемента (позиция, свойства)
    socket.on('element:update', async (updateData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      const { id, ...updates } = updateData;
      
      // Проверяем, есть ли элемент в sceneState.elements
      let element = sceneState.elements.find(e => e.id === id);
      
      // Если элемента нет в sceneState, загружаем его из БД
      if (!element) {
        try {
          const elementResult = await pool.query(
            `SELECT id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_by
             FROM elements 
             WHERE id = $1 AND user_id = $2`,
            [id, socket.userId]
          );
          
          if (elementResult.rows.length === 0) {
            socket.emit('error', { message: 'Элемент не найден' });
            return;
          }
          
          const row = elementResult.rows[0];
          element = {
            id: row.id,
            name: row.name,
            description: row.description || '',
            elementType: row.element_type,
            type: row.type || null,
            parent_id: row.parent_id || null,
            position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : null,
            position: row.position ? (typeof row.position === 'string' ? JSON.parse(row.position) : row.position) : null,
            size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : null,
            size: row.size ? (typeof row.size === 'string' ? JSON.parse(row.size) : row.size) : null,
            color: row.color || null,
            emissive: row.emissive || null,
            background: row.background || null,
            showGrid: row.show_grid !== undefined ? row.show_grid : null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: row.created_by
          };
        } catch (error) {
          console.error(`❌ Ошибка загрузки элемента ${id} из БД:`, error);
          socket.emit('error', { message: 'Ошибка загрузки элемента' });
          return;
        }
      }
      
      // Обновляем элемент
      const updatedElement = {
        ...element,
        ...updates,
        updatedAt: Date.now(),
        updatedBy: socket.userId
      };
      
      // Обновляем в sceneState, если он там был
      const elementIndex = sceneState.elements.findIndex(e => e.id === id);
      if (elementIndex !== -1) {
        sceneState.elements[elementIndex] = updatedElement;
        sceneState.lastUpdate = Date.now();
      }

      // Синхронизация
      io.emit('element:updated', updatedElement);
      
      // ВАЖНО: Сохраняем элемент напрямую в БД, а не через saveElementsToDatabase
      // Это предотвращает удаление других элементов
      try {
        await pool.query(
          `INSERT INTO elements (id, user_id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             element_type = EXCLUDED.element_type,
             type = EXCLUDED.type,
             parent_id = EXCLUDED.parent_id,
             position_2d = EXCLUDED.position_2d,
             position = EXCLUDED.position,
             size_2d = EXCLUDED.size_2d,
             size = EXCLUDED.size,
             color = EXCLUDED.color,
             emissive = EXCLUDED.emissive,
             background = EXCLUDED.background,
             show_grid = EXCLUDED.show_grid,
             updated_at = CURRENT_TIMESTAMP`,
          [
            updatedElement.id,
            socket.userId,
            updatedElement.name || 'Untitled Element',
            updatedElement.description || '',
            updatedElement.elementType || 'worker',
            updatedElement.type || null,
            updatedElement.parent_id || null,
            updatedElement.position_2d ? JSON.stringify(updatedElement.position_2d) : null,
            updatedElement.position ? JSON.stringify(updatedElement.position) : null,
            updatedElement.size_2d ? JSON.stringify(updatedElement.size_2d) : null,
            updatedElement.size ? JSON.stringify(updatedElement.size) : null,
            updatedElement.color || null,
            updatedElement.emissive || null,
            updatedElement.background || null,
            updatedElement.showGrid !== undefined ? updatedElement.showGrid : null,
            updatedElement.createdBy || socket.userId
          ]
        );
        console.log(`💾 Элемент ${id} сохранен в БД`);
      } catch (error) {
        console.error(`❌ Ошибка сохранения элемента ${id}:`, error);
      }
    });

    // Удаление элемента
    socket.on('element:delete', async (elementId) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const elementIndex = sceneState.elements.findIndex(e => e.id === elementId);
        if (elementIndex === -1) {
          socket.emit('error', { message: 'Элемент не найден' });
          return;
        }

        sceneState.elements.splice(elementIndex, 1);
        
        // Удаляем все связи с этим элементом напрямую из БД
        await pool.query(
          `DELETE FROM elements_connections 
           WHERE (from_element_id = $1 OR to_element_id = $1) AND user_id = $2`,
          [elementId, socket.userId]
        );

        // Получаем все удаленные связи для синхронизации с клиентами
        // Примечание: связи уже удалены, но нужно уведомить клиентов
        // Клиенты получат уведомление через connection:deleted события
        // Но проще всего - просто перезагрузить связи через scene:list-with-connections

        sceneState.lastUpdate = Date.now();

        // Синхронизация
        io.emit('element:deleted', { id: elementId });
        // Уведомляем, что связи нужно перезагрузить
        io.emit('connections:reload');
        console.log(`🗑️ Удален элемент ${elementId} и все его связи`);
        
        // Автоматическое сохранение элементов в БД
        // Используем currentSceneId из состояния (может быть null для элементов без сцены)
        saveElementsToDatabase(socket.userId, sceneState, sceneState.currentSceneId);
      } catch (error) {
        console.error('Ошибка удаления элемента:', error);
        socket.emit('error', { message: 'Ошибка удаления элемента' });
      }
    });

    // Создание связи между сущностями
    socket.on('connection:create', async (connectionData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { from, to, type = 'one-way', bidirectional = false, label, color = '#ffffff' } = connectionData;
        
        if (!from || !to) {
          socket.emit('error', { message: 'ID элементов обязательны' });
          return;
        }

        if (from === to) {
          socket.emit('error', { message: 'Нельзя создать связь элемента с самим собой' });
          return;
        }

        // Проверяем права доступа к обоим элементам
        const elementsCheck = await pool.query(
          'SELECT id, element_type FROM elements WHERE id IN ($1, $2) AND user_id = $3',
          [from, to, socket.userId]
        );

        if (elementsCheck.rows.length !== 2) {
          socket.emit('error', { message: 'Один из элементов не найден или нет доступа' });
          return;
        }

        // Проверяем, нет ли уже такой связи
        const existingCheck = await pool.query(
          `SELECT id FROM elements_connections 
           WHERE from_element_id = $1 AND to_element_id = $2 AND user_id = $3`,
          [from, to, socket.userId]
        );

        if (existingCheck.rows.length > 0) {
          socket.emit('error', { message: 'Связь уже существует' });
          return;
        }

        const connectionId = connectionData.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Создаем связь в таблице elements_connections
        const result = await pool.query(
          `INSERT INTO elements_connections 
           (id, user_id, from_element_id, to_element_id, type, bidirectional, label, color, created_by) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
           RETURNING id, from_element_id, to_element_id, type, bidirectional, label, color, created_at`,
          [connectionId, socket.userId, from, to, type, bidirectional, label || null, color, socket.userId]
        );

        const newConnection = {
          id: result.rows[0].id,
          from: result.rows[0].from_element_id,
          to: result.rows[0].to_element_id,
          type: result.rows[0].type,
          bidirectional: result.rows[0].bidirectional,
          label: result.rows[0].label || '',
          color: result.rows[0].color,
          createdAt: result.rows[0].created_at?.getTime() || Date.now(),
          createdBy: socket.userId
        };

        // Синхронизируем со всеми клиентами
        // Примечание: не обновляем sceneState.connections, так как связи сохраняются напрямую в БД
        io.emit('connection:created', newConnection);
        console.log(`🔗 Создана связь ${newConnection.id} между ${from} и ${to}`);
      } catch (error) {
        console.error('Ошибка создания связи:', error);
        socket.emit('error', { message: 'Ошибка создания связи' });
      }
    });

    // Обновление связи
    socket.on('connection:update', async (updateData) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { id, ...updates } = updateData;
        
        if (!id) {
          socket.emit('error', { message: 'ID связи обязателен' });
          return;
        }

        // Проверяем права доступа
        const connectionCheck = await pool.query(
          'SELECT id FROM elements_connections WHERE id = $1 AND user_id = $2',
          [id, socket.userId]
        );

        if (connectionCheck.rows.length === 0) {
          socket.emit('error', { message: 'Связь не найдена или нет доступа' });
          return;
        }

        // Обновляем связь в БД
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (updates.type !== undefined) {
          updateFields.push(`type = $${paramIndex++}`);
          updateValues.push(updates.type);
        }
        if (updates.bidirectional !== undefined) {
          updateFields.push(`bidirectional = $${paramIndex++}`);
          updateValues.push(updates.bidirectional);
        }
        if (updates.label !== undefined) {
          updateFields.push(`label = $${paramIndex++}`);
          updateValues.push(updates.label);
        }
        if (updates.color !== undefined) {
          updateFields.push(`color = $${paramIndex++}`);
          updateValues.push(updates.color);
        }

        if (updateFields.length === 0) {
          socket.emit('error', { message: 'Нет полей для обновления' });
          return;
        }

        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateValues.push(id, socket.userId);

        const result = await pool.query(
          `UPDATE elements_connections 
           SET ${updateFields.join(', ')} 
           WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
           RETURNING id, from_element_id, to_element_id, type, bidirectional, label, color, created_at, updated_at`,
          updateValues
        );

        const updatedConnection = {
          id: result.rows[0].id,
          from: result.rows[0].from_element_id,
          to: result.rows[0].to_element_id,
          type: result.rows[0].type,
          bidirectional: result.rows[0].bidirectional,
          label: result.rows[0].label || '',
          color: result.rows[0].color,
          createdAt: result.rows[0].created_at?.getTime() || Date.now(),
          updatedAt: result.rows[0].updated_at?.getTime() || Date.now()
        };

        // Синхронизация
        // Примечание: не обновляем sceneState.connections, так как связи сохраняются напрямую в БД
        io.emit('connection:updated', updatedConnection);
        console.log(`🔗 Связь ${id} обновлена`);
      } catch (error) {
        console.error('Ошибка обновления связи:', error);
        socket.emit('error', { message: 'Ошибка обновления связи' });
      }
    });

    // Удаление связи
    socket.on('connection:delete', async (connectionId) => {
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
          'SELECT id FROM elements_connections WHERE id = $1 AND user_id = $2',
          [connectionId, socket.userId]
        );

        if (connectionCheck.rows.length === 0) {
          socket.emit('error', { message: 'Связь не найдена или нет доступа' });
          return;
        }

        // Удаляем связь из БД
        await pool.query(
          'DELETE FROM elements_connections WHERE id = $1',
          [connectionId]
        );

        // Синхронизация
        // Примечание: не обновляем sceneState.connections, так как связи сохраняются напрямую в БД
        io.emit('connection:deleted', { id: connectionId });
        console.log(`🔗 Удалена связь ${connectionId}`);
      } catch (error) {
        console.error('Ошибка удаления связи:', error);
        socket.emit('error', { message: 'Ошибка удаления связи' });
      }
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
          elements: sceneState.elements,
          // connections больше не используются здесь, так как они загружаются отдельно
          connections: []
        };
        
        // Создаем новую сцену (элемент с element_type='scene')
        const sceneId = sceneData.id || `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const sceneResult = await pool.query(
          `INSERT INTO elements (id, user_id, name, description, element_type, background, show_grid, created_by) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
           RETURNING id, created_at`,
          [
            sceneId,
            socket.userId, 
            name || 'Untitled Scene', 
            description || null,
            'scene',
            data.background || '#000000',
            data.showGrid !== undefined ? data.showGrid : true,
            socket.userId
          ]
        );
        
        // Сохраняем элементы
        for (const element of data.elements || []) {
          await pool.query(
            `INSERT INTO elements (id, user_id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               element_type = EXCLUDED.element_type,
               type = EXCLUDED.type,
               parent_id = EXCLUDED.parent_id,
               position_2d = EXCLUDED.position_2d,
               position = EXCLUDED.position,
               size_2d = EXCLUDED.size_2d,
               size = EXCLUDED.size,
               color = EXCLUDED.color,
               emissive = EXCLUDED.emissive,
               background = EXCLUDED.background,
               show_grid = EXCLUDED.show_grid,
               updated_at = CURRENT_TIMESTAMP`,
            [
              element.id,
              socket.userId,
              element.name || 'Untitled Element',
              element.description || '',
              element.elementType || 'worker',
              element.type || null,
              element.parent_id || sceneId,
              element.position_2d ? JSON.stringify(element.position_2d) : null,
              element.position ? JSON.stringify(element.position) : null,
              element.size_2d ? JSON.stringify(element.size_2d) : null,
              element.size ? JSON.stringify(element.size) : null,
              element.color || null,
              element.emissive || null,
              element.background || null,
              element.showGrid !== undefined ? element.showGrid : null,
              element.createdBy || socket.userId
            ]
          );
        }
        
        // Сохраняем связи
        for (const connection of data.connections || []) {
          await pool.query(
            `INSERT INTO elements_connections (id, user_id, from_element_id, to_element_id, type, bidirectional, label, color, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               type = EXCLUDED.type,
               bidirectional = EXCLUDED.bidirectional,
               label = EXCLUDED.label,
               color = EXCLUDED.color,
               updated_at = CURRENT_TIMESTAMP`,
            [
              connection.id,
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
        // Загружаем сцену (элемент с element_type='scene')
        const sceneResult = await pool.query(
          `SELECT id, name, description, element_type, parent_id, position_2d, size_2d, background, show_grid, created_at, updated_at 
           FROM elements 
           WHERE id = $1 AND user_id = $2 AND element_type = 'scene'`,
          [sceneId, socket.userId]
        );

        if (sceneResult.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        const scene = sceneResult.rows[0];
        
        // Загружаем все дочерние элементы (worker, block, другие scene)
        const elementsResult = await pool.query(
          `SELECT id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_at, updated_at, created_by
           FROM elements WHERE parent_id = $1 ORDER BY created_at`,
          [sceneId]
        );
        
        // Загружаем связи между элементами этой сцены
        const connectionsResult = await pool.query(
          `SELECT c.id, c.from_element_id, c.to_element_id, c.type, c.bidirectional, c.label, c.color, c.created_at, c.updated_at, c.created_by
           FROM elements_connections c
           INNER JOIN elements e1 ON e1.id = c.from_element_id
           INNER JOIN elements e2 ON e2.id = c.to_element_id
           WHERE c.user_id = $1 AND (e1.parent_id = $2 OR e2.parent_id = $2)
           ORDER BY c.created_at`,
          [socket.userId, sceneId]
        );
        
        // Преобразуем данные из БД в формат приложения
        sceneState.elements = elementsResult.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          elementType: row.element_type,
          type: row.type || null,
          parent_id: row.parent_id || null,
          position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : null,
          position: row.position ? (typeof row.position === 'string' ? JSON.parse(row.position) : row.position) : null,
          size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : null,
          size: row.size ? (typeof row.size === 'string' ? JSON.parse(row.size) : row.size) : null,
          color: row.color || null,
          emissive: row.emissive || null,
          background: row.background || null,
          showGrid: row.show_grid !== undefined ? row.show_grid : null,
          createdAt: row.created_at?.getTime() || Date.now(),
          updatedAt: row.updated_at?.getTime() || Date.now(),
          createdBy: row.created_by
        }));
        
        // connections больше не загружаются в sceneState, так как они загружаются отдельно через scene:list-with-connections
        
        sceneState.lastUpdate = Date.now();
        sceneState.currentSceneId = sceneId; // Обновляем текущую сцену

        // Синхронизируем со всеми клиентами
        io.emit('scene:state', {
          elements: sceneState.elements,
          // connections больше не отправляются здесь, так как они загружаются отдельно через scene:list-with-connections
          sceneId: sceneId
        });

        // Обновляем updated_at в БД при загрузке
        await pool.query(
          `UPDATE elements SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sceneId]
        );

        socket.emit('scene:loaded', {
          id: scene.id,
          name: scene.name,
          description: scene.description || '',
          parent_id: scene.parent_id || null,
          position_2d: scene.position_2d ? (typeof scene.position_2d === 'string' ? JSON.parse(scene.position_2d) : scene.position_2d) : [0, 0],
          size_2d: scene.size_2d ? (typeof scene.size_2d === 'string' ? JSON.parse(scene.size_2d) : scene.size_2d) : [200, 150],
          background: scene.background || '#000000',
          showGrid: scene.show_grid !== undefined ? scene.show_grid : true,
          createdAt: scene.created_at
        });

        console.log(`📥 Сцена ${sceneId} загружена пользователем ${socket.userId}: ${sceneState.elements.length} элементов`);
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
          `SELECT id, name, description, parent_id, position_2d, size_2d, background, show_grid, created_at, updated_at 
           FROM elements 
           WHERE user_id = $1 AND element_type = 'scene' AND parent_id IS NULL
           ORDER BY updated_at DESC 
           LIMIT 50`,
          [socket.userId]
        );

        // Преобразуем position_2d и size_2d из JSONB в массив
        const scenes = result.rows.map(row => ({
          ...row,
          position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : [0, 0],
          size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : [200, 150],
          parent_id: row.parent_id || null,
          background: row.background || '#000000',
          showGrid: row.show_grid !== undefined ? row.show_grid : true
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
        const sceneId = sceneData.id || `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`💾 Вставляем сцену в БД: userId=${socket.userId}, name="${name.trim()}"`);
        const sceneResult = await pool.query(
          `INSERT INTO elements (id, user_id, name, description, element_type, parent_id, position_2d, size_2d, background, show_grid, created_by) 
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11) 
           RETURNING id, name, description, parent_id, position_2d, size_2d, background, show_grid, created_at, updated_at`,
          [
            sceneId,
            socket.userId, 
            name.trim(), 
            (description || '').trim() || null,
            'scene',
            parent_id || null,
            JSON.stringify(position_2d || [0, 0]),
            JSON.stringify(sceneData.size_2d || [200, 150]),
            sceneData.background || '#000000',
            sceneData.showGrid !== undefined ? sceneData.showGrid : true,
            socket.userId
          ]
        );

        const newScene = sceneResult.rows[0];
        newScene.position_2d = newScene.position_2d ? (typeof newScene.position_2d === 'string' ? JSON.parse(newScene.position_2d) : newScene.position_2d) : [0, 0];
        newScene.size_2d = newScene.size_2d ? (typeof newScene.size_2d === 'string' ? JSON.parse(newScene.size_2d) : newScene.size_2d) : [200, 150];
        newScene.parent_id = newScene.parent_id || null;
        newScene.background = newScene.background || '#000000';
        newScene.showGrid = newScene.show_grid !== undefined ? newScene.show_grid : true;
        console.log(`✅ Сцена создана в БД:`, newScene);
        
        // Очищаем текущее состояние сцены только для этого пользователя
        // Не отправляем scene:state всем, так как каждый клиент должен загрузить сцену явно
        sceneState.elements = [];
        // connections больше не хранятся в sceneState
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
          `SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = 'scene'`,
          [sceneId, socket.userId]
        );

        if (sceneResult.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена или нет доступа' });
          return;
        }

        // Перемещаем дочерние элементы на верхний уровень (parent_id = NULL)
        await pool.query(
          `UPDATE elements SET parent_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE parent_id = $1`,
          [sceneId]
        );

        // Удаляем связи, связанные с этой сценой и её дочерними элементами
        await pool.query(
          `DELETE FROM elements_connections 
           WHERE user_id = $1 AND (
             from_element_id = $2 OR to_element_id = $2 OR
             from_element_id IN (SELECT id FROM elements WHERE parent_id = $2) OR
             to_element_id IN (SELECT id FROM elements WHERE parent_id = $2)
           )`,
          [socket.userId, sceneId]
        );

        // Удаляем все дочерние элементы
        await pool.query(
          `DELETE FROM elements WHERE parent_id = $1`,
          [sceneId]
        );

        // Удаляем сцену
        await pool.query(
          `DELETE FROM elements WHERE id = $1`,
          [sceneId]
        );

        // Очищаем состояние сцены, так как удаленная сцена могла быть загружена
        sceneState.elements = [];
        // connections больше не хранятся в sceneState
        sceneState.lastUpdate = Date.now();

        // Отправляем пустое состояние всем клиентам
        io.emit('scene:state', {
          elements: [],
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
          'SELECT parent_id FROM elements WHERE id = $1 AND element_type = \'scene\'',
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
          'SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = \'scene\'',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Обновляем позицию
        await pool.query(
          `UPDATE elements SET position_2d = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
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
          'SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = \'scene\'',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Обновляем размер сцены
        await pool.query(
          `UPDATE elements SET size_2d = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
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
          'SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = \'scene\'',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Обновляем название и описание сцены
        await pool.query(
          `UPDATE elements SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
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
          'SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = \'scene\'',
          [sceneId, socket.userId]
        );

        if (sceneCheck.rows.length === 0) {
          socket.emit('error', { message: 'Сцена не найдена' });
          return;
        }

        // Если указан parentId, проверяем права доступа к родительской сцене
        if (parentId) {
          const parentCheck = await pool.query(
            'SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = \'scene\'',
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
            `UPDATE elements SET parent_id = $1, position_2d = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
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
            `UPDATE elements SET parent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
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

    // Установка родительской сцены для элемента (parent_id)
    socket.on('element:set-scene', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        const { elementId, sceneId } = data;
        
        if (!elementId) {
          socket.emit('error', { message: 'ID элемента обязателен' });
          return;
        }

        // Проверяем права доступа к элементу
        const elementCheck = await pool.query(
          'SELECT id, user_id FROM elements WHERE id = $1 AND user_id = $2',
          [elementId, socket.userId]
        );

        if (elementCheck.rows.length === 0) {
          socket.emit('error', { message: 'Элемент не найден или нет доступа' });
          return;
        }

        // Если sceneId указан, проверяем права доступа к сцене (элемент с element_type='scene')
        if (sceneId) {
          const sceneCheck = await pool.query(
            'SELECT id FROM elements WHERE id = $1 AND user_id = $2 AND element_type = $3',
            [sceneId, socket.userId, 'scene']
          );

          if (sceneCheck.rows.length === 0) {
            socket.emit('error', { message: 'Сцена не найдена или нет доступа' });
            return;
          }
        }

        // Обновляем parent_id у элемента
        await pool.query(
          `UPDATE elements SET parent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [sceneId || null, elementId]
        );

        // Обновляем в локальном состоянии, если элемент есть
        const elementIndex = sceneState.elements.findIndex(e => e.id === elementId);
        if (elementIndex !== -1) {
          sceneState.elements[elementIndex].parent_id = sceneId || null;
        }

        // Синхронизируем со всеми клиентами
        io.emit('element:scene-updated', {
          elementId,
          sceneId: sceneId || null
        });

        console.log(`🔗 Элемент ${elementId} теперь в сцене: ${sceneId || 'null'}`);
      } catch (error) {
        console.error('Ошибка установки сцены для элемента:', error);
        socket.emit('error', { message: 'Ошибка установки сцены для элемента' });
      }
    });


    // Получение всех сцен с их связями
    socket.on('scene:list-with-connections', async () => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Требуется авторизация' });
        return;
      }

      try {
        // Получаем все сцены (элементы с element_type='scene')
        const scenesResult = await pool.query(
          `SELECT id, name, description, parent_id, position_2d, size_2d, background, show_grid, created_at, updated_at 
           FROM elements 
           WHERE user_id = $1 AND element_type = 'scene'
           ORDER BY updated_at DESC`,
          [socket.userId]
        );

        const scenes = scenesResult.rows.map(row => ({
          ...row,
          position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : [0, 0],
          size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : [200, 150],
          parent_id: row.parent_id || null,
          background: row.background || '#000000',
          showGrid: row.show_grid !== undefined ? row.show_grid : true
        }));

        // Получаем все связи между сценами (элементами с element_type='scene')
        // Теперь это часть общих connections, но возвращаем для обратной совместимости
        const sceneConnectionsResult = await pool.query(
          `SELECT c.id, c.from_element_id, c.to_element_id, c.type, c.bidirectional, c.label, c.color, c.created_at 
           FROM elements_connections c
           INNER JOIN elements e1 ON e1.id = c.from_element_id AND e1.element_type = 'scene'
           INNER JOIN elements e2 ON e2.id = c.to_element_id AND e2.element_type = 'scene'
           WHERE c.user_id = $1`,
          [socket.userId]
        );

        const sceneConnections = sceneConnectionsResult.rows.map(row => ({
          id: row.id,
          from: row.from_element_id,
          to: row.to_element_id,
          type: row.type,
          bidirectional: row.bidirectional,
          label: row.label || '',
          color: row.color,
          createdAt: row.created_at?.getTime() || Date.now()
        }));

        // Загружаем все элементы пользователя (для отображения в ScenesView)
        const allElementsResult = await pool.query(
          `SELECT id, name, description, element_type, type, parent_id, position_2d, position, size_2d, size, color, emissive, background, show_grid, created_at, updated_at, created_by
           FROM elements 
           WHERE user_id = $1 
           ORDER BY created_at`,
          [socket.userId]
        );

        const allElements = allElementsResult.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          elementType: row.element_type,
          type: row.type || null,
          parent_id: row.parent_id || null,
          position_2d: row.position_2d ? (typeof row.position_2d === 'string' ? JSON.parse(row.position_2d) : row.position_2d) : null,
          position: row.position ? (typeof row.position === 'string' ? JSON.parse(row.position) : row.position) : null,
          size_2d: row.size_2d ? (typeof row.size_2d === 'string' ? JSON.parse(row.size_2d) : row.size_2d) : null,
          size: row.size ? (typeof row.size === 'string' ? JSON.parse(row.size) : row.size) : null,
          color: row.color || null,
          emissive: row.emissive || null,
          background: row.background || null,
          showGrid: row.show_grid !== undefined ? row.show_grid : null,
          createdAt: row.created_at?.getTime() || Date.now(),
          updatedAt: row.updated_at?.getTime() || Date.now(),
          createdBy: row.created_by
        }));

        // Загружаем все связи между элементами
        const allConnectionsResult = await pool.query(
          `SELECT id, from_element_id, to_element_id, type, bidirectional, label, color, created_at, updated_at, created_by
           FROM elements_connections 
           WHERE user_id = $1 
           ORDER BY created_at`,
          [socket.userId]
        );

        const allConnections = allConnectionsResult.rows.map(row => ({
          id: row.id,
          from: row.from_element_id,
          to: row.to_element_id,
          type: row.type,
          bidirectional: row.bidirectional,
          label: row.label || '',
          color: row.color,
          createdAt: row.created_at?.getTime() || Date.now(),
          updatedAt: row.updated_at?.getTime() || Date.now(),
          createdBy: row.created_by
        }));

        socket.emit('scene:list-with-connections', {
          scenes,
          connections: sceneConnections, // Связи между сценами (для обратной совместимости)
          elements: allElements,
          elementConnections: allConnections // Все связи между элементами
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

