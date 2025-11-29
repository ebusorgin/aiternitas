import { create } from 'zustand';
import { io } from 'socket.io-client';
import { findFreePosition } from '../utils/collisionUtils';

// Инициализация Socket.IO клиента
const getSocket = () => {
  const socket = io(window.location.origin, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    // Убеждаемся, что cookie передаются
    extraHeaders: {},
    // Автоматическое переподключение
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });
  
  console.log('🔌 Инициализация Socket.IO клиента:', window.location.origin);
  return socket;
};

export const useSceneStore = create((set, get) => {
  let socket = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  let position3DUpdateTimeout = null;
  let canvasCenterCallback = null; // Callback для получения центра canvas

  // Инициализация Socket.IO
  const initSocket = () => {
    if (socket && socket.connected) {
      return socket;
    }

    socket = getSocket();

    socket.on('connect', () => {
      console.log('🔌 Socket.IO подключен:', socket.id);
      reconnectAttempts = 0;
      set({ socketConnected: true });
      
      // Присоединяемся к сцене - сервер автоматически загрузит дефолтную сцену
      socket.emit('scene:join');
      
      // Также загружаем список всех сцен для отображения иерархии
      setTimeout(() => {
        const state = get();
        if (state.socket && state.socket.connected) {
          state.loadAllScenes();
        }
      }, 500); // Небольшая задержка, чтобы scene:join успел обработаться
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket.IO отключен');
      set({ socketConnected: false });
      
      // Попытка переподключения
      if (reconnectAttempts < maxReconnectAttempts && socket) {
        reconnectAttempts++;
        setTimeout(() => {
          if (socket) {
            console.log(`🔄 Попытка переподключения ${reconnectAttempts}/${maxReconnectAttempts}`);
            socket.connect();
          }
        }, 2000 * reconnectAttempts);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Ошибка подключения Socket.IO:', error);
      set({ socketConnected: false });
    });

    // Обработчики событий от сервера
    socket.on('scene:state', (state) => {
      console.log('📥 Получено состояние сцены:', state);
      const currentState = get();
      
      // Инициализируем 2D позиции для всех сущностей из 3D координат
      const newPositions2D = { ...currentState.entityPositions2D };
      if (state.entities && state.entities.length > 0) {
        state.entities.forEach(entity => {
          if (!newPositions2D[entity.id] && entity.position) {
            // Создаем 2D позицию из 3D (используем X и Z)
            newPositions2D[entity.id] = [entity.position[0], entity.position[2] || 0];
          }
        });
      }
      
      // Если мы в режиме просмотра всех сцен (currentSceneId === null), не перезаписываем entities
      // Они будут загружены через loadAllScenes
      if (currentState.currentSceneId === null && state.sceneId) {
        // Мы переключаемся в конкретную сцену - обновляем entities
        const updates = {
          entities: state.entities || [],
          connections: state.connections || [],
          entityPositions2D: newPositions2D,
          currentSceneId: state.sceneId
        };
        console.log('✅ Установлена текущая сцена:', state.sceneId, 'entities:', state.entities?.length || 0);
        set(updates);
      } else if (currentState.currentSceneId === null) {
        // Мы в режиме просмотра всех сцен и получили entities без сцены - обновляем только если нет entities
        if (currentState.entities.length === 0) {
          const updates = {
            entities: state.entities || [],
            connections: state.connections || [],
            entityPositions2D: newPositions2D
          };
          console.log('📋 Нет sceneId, показываем корневые сцены, entities:', state.entities?.length || 0);
          set(updates);
        }
      } else {
        // Мы в конкретной сцене - обновляем entities
        const updates = {
          entities: state.entities || [],
          connections: state.connections || [],
          entityPositions2D: newPositions2D
        };
        
        // Если в состоянии есть sceneId, устанавливаем его как текущую сцену
        if (state.sceneId) {
          updates.currentSceneId = state.sceneId;
          console.log('✅ Установлена текущая сцена:', state.sceneId, 'entities:', state.entities?.length || 0);
        } else {
          // Если sceneId нет, но есть entities, это означает, что мы в дефолтной сцене
          // Оставляем currentSceneId как null, чтобы показывать корневые сцены
          console.log('📋 Нет sceneId, показываем корневые сцены, entities:', state.entities?.length || 0);
        }
        
        set(updates);
      }
    });

    socket.on('scene:loaded', (scene) => {
      console.log('📥 Сцена загружена:', scene);
      set({ currentSceneId: scene.id, currentSceneName: scene.name });
    });

    socket.on('scene:deleted', ({ id }) => {
      console.log('🗑️ Сцена удалена:', id);
      const state = get();
      // Если удаленная сцена была текущей, очищаем состояние
      if (state.currentSceneId === id) {
        set({
          entities: [],
          connections: [],
          selectedEntityId: null,
          selectedConnectionId: null,
          entityPositions2D: {},
          currentSceneId: null,
          currentSceneName: null
        });
      }
      // Удаляем сцену из списка всех сцен
      if (state.allScenes) {
        set({
          allScenes: state.allScenes.filter(s => s.id !== id),
          sceneConnections: state.sceneConnections.filter(c => c.from !== id && c.to !== id)
        });
      }
    });

    // Обработчики для работы со сценами в 2D
    socket.on('scene:created', (scene) => {
      console.log('📥 Новая сцена создана:', scene);
      const state = get();
      if (state.allScenes) {
        set({
          allScenes: [...state.allScenes, {
            ...scene,
            position_2d: scene.position_2d || [0, 0],
            parent_id: scene.parent_id || null
          }]
        });
      }
    });

    socket.on('scene:position-updated', ({ sceneId, position2D }) => {
      console.log('📍 Позиция сцены обновлена:', sceneId, position2D);
      const state = get();
      if (state.allScenes) {
        set({
          allScenes: state.allScenes.map(s => 
            s.id === sceneId ? { ...s, position_2d: position2D } : s
          ),
          scenePositions2D: {
            ...state.scenePositions2D,
            [sceneId]: position2D
          }
        });
      }
    });

    socket.on('scene:parent-updated', ({ sceneId, parentId }) => {
      console.log('🔗 Родитель сцены обновлен:', sceneId, parentId);
      const state = get();
      if (state.allScenes) {
        set({
          allScenes: state.allScenes.map(s => 
            s.id === sceneId ? { ...s, parent_id: parentId } : s
          )
        });
      }
    });

    socket.on('scene:size-updated', ({ sceneId, size2D }) => {
      console.log('📏 Размер сцены обновлен:', sceneId, size2D);
      const state = get();
      if (state.allScenes) {
        set({
          allScenes: state.allScenes.map(s => 
            s.id === sceneId ? { ...s, size_2d: size2D } : s
          )
        });
      }
    });

    socket.on('scene-connection:created', (connection) => {
      console.log('🔗 Связь между сценами создана:', connection);
      const state = get();
      // Убеждаемся, что sceneConnections инициализирован
      const currentConnections = state.sceneConnections || [];
      // Проверяем, нет ли уже такой связи (избегаем дубликатов)
      const exists = currentConnections.some(c => c.id === connection.id);
      if (!exists) {
        set({
          sceneConnections: [...currentConnections, connection]
        });
      }
    });

    socket.on('scene-connection:deleted', ({ id }) => {
      console.log('🗑️ Связь между сценами удалена:', id);
      const state = get();
      if (state.sceneConnections) {
        set({
          sceneConnections: state.sceneConnections.filter(c => c.id !== id)
        });
      }
    });

    socket.on('entity:created', (entity) => {
      set((state) => {
        // Автоматически создаем 2D позицию для новой сущности
        const newPositions2D = { ...state.entityPositions2D };
        if (!newPositions2D[entity.id]) {
          // Если сущность создана в 3D, создаем 2D позицию из 3D (X и Z)
          newPositions2D[entity.id] = [entity.position[0], entity.position[2] || 0];
        }
        return {
          entities: [...state.entities, entity],
          entityPositions2D: newPositions2D
        };
      });
    });

    socket.on('entity:updated', (updatedEntity) => {
      set((state) => {
        const updatedEntities = state.entities.map(e =>
          e.id === updatedEntity.id ? updatedEntity : e
        );
        return { entities: updatedEntities };
      });
    });

    socket.on('entity:scene-updated', ({ entityId, sceneId }) => {
      console.log('📥 Получено entity:scene-updated:', { entityId, sceneId });
      set((state) => ({
        entities: state.entities.map(e =>
          e.id === entityId ? { ...e, scene_id: sceneId } : e
        )
      }));
    });

    socket.on('entity:deleted', ({ id }) => {
      set((state) => {
        const newPositions2D = { ...state.entityPositions2D };
        delete newPositions2D[id];
        return {
          entities: state.entities.filter(e => e.id !== id),
          selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
          entityPositions2D: newPositions2D
        };
      });
    });

    socket.on('connection:created', (connection) => {
      set((state) => ({
        connections: [...state.connections, connection]
      }));
    });

    socket.on('connection:updated', (updatedConnection) => {
      set((state) => ({
        connections: state.connections.map(c =>
          c.id === updatedConnection.id ? updatedConnection : c
        )
      }));
    });

    socket.on('connection:deleted', ({ id }) => {
      set((state) => ({
        connections: state.connections.filter(c => c.id !== id),
        selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId
      }));
    });

    socket.on('connections:updated', (connections) => {
      set({ connections });
    });

    socket.on('error', ({ message }) => {
      console.error('❌ Ошибка Socket.IO:', message);
      set({ error: message });
    });

    return socket;
  };

  return {
    // Состояние
    entities: [],
    connections: [],
    selectedEntityId: null,
    selectedConnectionId: null,
    connectMode: false,
    connectingFrom: null,
    cameraPosition: [0, 5, 10],
    viewMode: '2d', // '3d' or '2d' - по умолчанию 2D вид
    entityPositions2D: {}, // Отдельное хранилище для 2D координат: { entityId: [x, z] }
    socket: null,
    socketConnected: false,
    error: null,
    orbitControls: null, // Ссылка на OrbitControls для блокировки камеры
    currentSceneId: null,
    currentSceneName: null,
    
    // Состояние для работы со сценами в 2D (в разделе "Мои сцены")
    allScenes: [], // Все сцены пользователя с позициями
    sceneConnections: [], // Связи между сценами
    scenePositions2D: {}, // Позиции сцен на 2D-карте: { sceneId: [x, z] }

    // Действия
    initSocket: () => {
      const s = initSocket();
      set({ socket: s });
    },

    disconnectSocket: () => {
      if (socket) {
        socket.disconnect();
        socket = null;
        set({ socket: null, socketConnected: false });
      }
    },

    // Управление сущностями
    createEntity: (entityData) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      const currentEntities = get().entities;
      let requestedPosition = entityData.position;
      
      // Если позиция не указана или null, используем центр canvas
      if (!requestedPosition && canvasCenterCallback) {
        const center = canvasCenterCallback();
        requestedPosition = [center.x, 1, center.z];
      } else if (!requestedPosition) {
        requestedPosition = [0, 1, 0];
      }
      
      const size = entityData.size || [1, 1, 1];
      const type = entityData.type || 'box';
      
      // Находим свободную позицию без коллизий
      const freePosition = findFreePosition(size, type, currentEntities, requestedPosition);

      const entity = {
        id: entityData.id || `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: entityData.name || `Entity ${currentEntities.length + 1}`,
        description: entityData.description || '',
        color: entityData.color || '#3b82f6',
        position: freePosition,
        size: size,
        type: type
      };

      socket.emit('entity:create', entity);
      
      // Оптимистичное обновление + создание 2D позиции
      set((state) => {
        const newPositions2D = { ...state.entityPositions2D };
        // Создаем 2D позицию из 3D (X и Z)
        newPositions2D[entity.id] = [freePosition[0], freePosition[2] || 0];
        return {
          entities: [...state.entities, entity],
          selectedEntityId: entity.id,
          entityPositions2D: newPositions2D
        };
      });
    },

    updateEntity: (() => {
      let updateTimeout = null;
      const pendingUpdates = new Map();

      return (id, updates) => {
        if (!socket || !socket.connected) {
          console.error('Socket не подключен');
          return;
        }

        // Оптимистичное обновление сразу
        set((state) => {
          const updatedEntities = state.entities.map(e =>
            e.id === id ? { ...e, ...updates } : e
          );
          return { entities: updatedEntities };
        });

        // Debounce отправки на сервер (особенно для позиций)
        if (updates.position) {
          pendingUpdates.set(id, { id, ...updates });
          
          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }
          
          updateTimeout = setTimeout(() => {
            pendingUpdates.forEach((update) => {
              socket.emit('entity:update', update);
            });
            pendingUpdates.clear();
          }, 100); // 100ms debounce для позиций
        } else {
          // Для других обновлений (type, color, name, description) отправляем сразу
          socket.emit('entity:update', { id, ...updates });
        }
      };
    })(),

    deleteEntity: (id) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      socket.emit('entity:delete', id);
      
      // Оптимистичное обновление
      set((state) => ({
        entities: state.entities.filter(e => e.id !== id),
        selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId
      }));
    },

    // Установка родительской сцены для сущности (scene_id)
    setEntityScene: (entityId, sceneId) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      set({
        entities: state.entities.map(e =>
          e.id === entityId ? { ...e, scene_id: sceneId || null } : e
        )
      });

      // Отправляем на сервер
      state.socket.emit('entity:set-scene', {
        entityId,
        sceneId: sceneId || null
      });
    },

    // Управление связями
    createConnection: (connectionData) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      const connection = {
        id: connectionData.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: connectionData.from,
        to: connectionData.to,
        type: connectionData.type || 'one-way',
        bidirectional: connectionData.bidirectional || false,
        label: connectionData.label || '',
        color: connectionData.color || '#ffffff'
      };

      socket.emit('connection:create', connection);
      
      // Оптимистичное обновление
      set((state) => ({
        connections: [...state.connections, connection],
        selectedConnectionId: connection.id,
        connectMode: false
      }));
    },

    updateConnection: (id, updates) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      socket.emit('connection:update', { id, ...updates });
      
      // Оптимистичное обновление
      set((state) => ({
        connections: state.connections.map(c =>
          c.id === id ? { ...c, ...updates } : c
        )
      }));
    },

    deleteConnection: (id) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      socket.emit('connection:delete', id);
      
      // Оптимистичное обновление
      set((state) => ({
        connections: state.connections.filter(c => c.id !== id),
        selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId
      }));
    },

    // Выделение
    selectEntity: (id) => {
      set({ selectedEntityId: id, selectedConnectionId: null });
    },

    selectConnection: (id) => {
      set({ selectedConnectionId: id, selectedEntityId: null });
    },

    clearSelection: () => {
      set({ selectedEntityId: null, selectedConnectionId: null });
    },

    // Режим соединения
    setConnectMode: (enabled) => {
      set({ connectMode: enabled, connectingFrom: null });
    },

    setConnectingFrom: (entityId) => {
      set({ connectingFrom: entityId });
    },

    // Камера
    setCameraPosition: (position) => {
      set({ cameraPosition: position });
    },

    // Переключение вида
    setViewMode: (mode) => {
      set({ viewMode: mode });
    },

    // Установка ссылки на OrbitControls
    setOrbitControls: (controls) => {
      set({ orbitControls: controls });
    },

    // Обновление 2D позиции (также обновляет 3D позицию для сохранения)
    updateEntityPosition2D: (id, position2D) => {
      const currentState = get();
      const entity = currentState.entities.find(e => e.id === id);
      
      set((state) => ({
        entityPositions2D: {
          ...state.entityPositions2D,
          [id]: position2D // [x, z] для 2D
        }
      }));
      
      // Также обновляем 3D позицию, чтобы она сохранялась
      if (entity) {
        const newPosition3D = [position2D[0], entity.position?.[1] || 1, position2D[1]];
        get().updateEntityPosition3D(id, newPosition3D);
      }
    },

    // Обновление 3D позиции (не влияет на 2D)
    updateEntityPosition3D: (id, position3D) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      set((state) => {
        const updatedEntities = state.entities.map(e =>
          e.id === id ? { ...e, position: position3D } : e
        );
        return { entities: updatedEntities };
      });

      // Отправляем на сервер с debounce
      if (position3DUpdateTimeout) {
        clearTimeout(position3DUpdateTimeout);
      }
      position3DUpdateTimeout = setTimeout(() => {
        state.socket.emit('entity:update', { id, position: position3D });
      }, 100);
    },

    // Получение 2D позиции (если есть) или создание из 3D
    getEntityPosition2D: (entity) => {
      const state = get();
      if (state.entityPositions2D[entity.id]) {
        return state.entityPositions2D[entity.id];
      }
      // Если нет 2D позиции, создаем из 3D (используем X и Z)
      return [entity.position[0], entity.position[2] || 0];
    },

    // Инициализация 2D позиций из 3D при первом переключении в 2D
    initialize2DPositions: () => {
      const state = get();
      const newPositions2D = { ...state.entityPositions2D };
      let hasNew = false;

      state.entities.forEach(entity => {
        if (!newPositions2D[entity.id]) {
          // Создаем 2D позицию из 3D (X и Z)
          newPositions2D[entity.id] = [entity.position[0], entity.position[2] || 0];
          hasNew = true;
        }
      });

      if (hasNew) {
        set({ entityPositions2D: newPositions2D });
      }
      
      // Всегда проверяем, все ли блоки на одной позиции при переключении в 2D
      if (state.entities.length > 1) {
        // Проверяем, все ли на одной позиции
        let allSamePosition = true;
        const firstPos = newPositions2D[state.entities[0].id] || [state.entities[0].position[0], state.entities[0].position[2] || 0];
        
        for (let i = 1; i < state.entities.length; i++) {
          const pos = newPositions2D[state.entities[i].id] || [state.entities[i].position[0], state.entities[i].position[2] || 0];
          const dx = Math.abs(pos[0] - firstPos[0]);
          const dz = Math.abs(pos[1] - firstPos[1]);
          if (dx > 1 || dz > 1) {
            allSamePosition = false;
            break;
          }
        }
        
        // Если все на одной позиции, распределяем в сетку немедленно
        if (allSamePosition) {
          const blockSpacing = 160;
          const cols = Math.ceil(Math.sqrt(state.entities.length));
          const rows = Math.ceil(state.entities.length / cols);
          
          state.entities.forEach((entity, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const newX = (col - (cols - 1) / 2) * blockSpacing;
            const newZ = (row - (rows - 1) / 2) * blockSpacing;
            newPositions2D[entity.id] = [newX, newZ];
          });
          
          // Обновляем сразу синхронно
          set({ entityPositions2D: newPositions2D });
        }
      }
    },

    // Загрузка сцены по ID
    loadScene: (sceneId) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }
      
      // Очищаем текущее состояние перед загрузкой новой сцены
      set({
        entities: [],
        connections: [],
        selectedEntityId: null,
        selectedConnectionId: null,
        entityPositions2D: {},
        currentSceneId: sceneId || null,
        currentSceneName: sceneId ? null : null
      });
      
      if (sceneId) {
        state.socket.emit('scene:load', sceneId);
      }
    },
    
    // Получение родительской сцены

    // Действия для работы со сценами в 2D
    loadAllScenes: () => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Устанавливаем currentSceneId в null, чтобы показывать все сущности
      set({ currentSceneId: null });

      state.socket.emit('scene:list-with-connections');

      const handleList = (data) => {
        const { scenes, connections, entities, entityConnections } = data;
        const positions2D = {};
        
        scenes.forEach(scene => {
          if (scene.position_2d) {
            positions2D[scene.id] = scene.position_2d;
          }
        });

        // Убеждаемся, что connections - это массив
        const normalizedConnections = Array.isArray(connections) ? connections : [];
        const normalizedEntities = Array.isArray(entities) ? entities : [];
        const normalizedEntityConnections = Array.isArray(entityConnections) ? entityConnections : [];

        const currentState = get();
        const updates = {
          allScenes: scenes,
          sceneConnections: normalizedConnections,
          scenePositions2D: positions2D
        };

        // loadAllScenes всегда загружает ВСЕ сущности пользователя для режима "Мои сцены"
        // Обновляем сущности независимо от currentSceneId
        updates.entities = normalizedEntities;
        updates.connections = normalizedEntityConnections;
        
        // Инициализируем 2D позиции для всех сущностей из 3D координат
        const newPositions2D = { ...currentState.entityPositions2D };
        normalizedEntities.forEach(entity => {
          if (entity.position && (!newPositions2D[entity.id] || 
              (entity.position[0] !== newPositions2D[entity.id][0] || 
               (entity.position[2] || 0) !== newPositions2D[entity.id][1]))) {
            // Создаем или обновляем 2D позицию из 3D (используем X и Z)
            newPositions2D[entity.id] = [entity.position[0], entity.position[2] || 0];
          }
        });
        updates.entityPositions2D = newPositions2D;

        set(updates);
      };

      const handleError = ({ message }) => {
        // Игнорируем ошибку "Связь уже существует" - это не критично при загрузке списка
        if (message !== 'Связь уже существует') {
          console.error('Ошибка загрузки списка сцен:', message);
        }
      };

      state.socket.once('scene:list-with-connections', handleList);
      state.socket.once('error', handleError);

      setTimeout(() => {
        state.socket.off('scene:list-with-connections', handleList);
        state.socket.off('error', handleError);
      }, 5000);
    },

    updateScenePosition: (sceneId, position2D) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      set({
        allScenes: state.allScenes.map(s => 
          s.id === sceneId ? { ...s, position_2d: position2D } : s
        ),
        scenePositions2D: {
          ...state.scenePositions2D,
          [sceneId]: position2D
        }
      });

      // Отправляем на сервер
      state.socket.emit('scene:update-position', {
        sceneId,
        position2D
      });
    },

    setSceneParent: (sceneId, parentId, position2D = null) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      const updates = {};
      if (parentId !== undefined) {
        updates.parent_id = parentId;
      }
      if (position2D) {
        updates.position_2d = position2D;
      }
      
      set({
        allScenes: state.allScenes.map(s => 
          s.id === sceneId ? { ...s, ...updates } : s
        )
      });

      // Отправляем на сервер
      const data = {
        sceneId,
        parentId: parentId !== undefined ? (parentId || null) : undefined
      };
      if (position2D) {
        data.position2D = position2D;
      }
      state.socket.emit('scene:set-parent', data);
    },

    createSceneConnection: (fromSceneId, toSceneId, data = {}) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      state.socket.emit('scene-connection:create', {
        fromSceneId,
        toSceneId,
        type: data.type || 'one-way',
        bidirectional: data.bidirectional || false,
        label: data.label || '',
        color: data.color || '#ffffff'
      });
    },

    deleteSceneConnection: (connectionId) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Удаляем локально
      set({
        sceneConnections: state.sceneConnections.filter(c => c.id !== connectionId)
      });

      // Отправляем на сервер
      state.socket.emit('scene-connection:delete', connectionId);
    },

    updateSceneSize: (sceneId, size2D) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      set({
        allScenes: state.allScenes.map(s => 
          s.id === sceneId ? { ...s, size_2d: size2D } : s
        )
      });

      // Отправляем на сервер
      state.socket.emit('scene:update-size', {
        sceneId,
        size2D
      });
    },
    
    // Создание сцены
    createScene: (sceneData) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return Promise.reject(new Error('Socket не подключен'));
      }
      
      return new Promise((resolve, reject) => {
        state.socket.emit('scene:create', sceneData);
        
        const handleSceneCreated = (newScene) => {
          state.socket.off('scene:created', handleSceneCreated);
          state.socket.off('error', handleError);
          // Обновляем список сцен
          get().loadAllScenes();
          resolve(newScene);
        };
        
        const handleError = ({ message }) => {
          state.socket.off('scene:created', handleSceneCreated);
          state.socket.off('error', handleError);
          reject(new Error(message));
        };
        
        state.socket.once('scene:created', handleSceneCreated);
        state.socket.once('error', handleError);
        
        setTimeout(() => {
          state.socket.off('scene:created', handleSceneCreated);
          state.socket.off('error', handleError);
          reject(new Error('Таймаут создания сцены'));
        }, 5000);
      });
    },
    
    // Установка callback для получения центра canvas
    setCanvasCenterCallback: (callback) => {
      canvasCenterCallback = callback;
    },
    
    // Получение центра canvas (для использования в компонентах)
    getCanvasCenter: () => {
      if (canvasCenterCallback) {
        return canvasCenterCallback();
      }
      return null;
    },

  };
});

