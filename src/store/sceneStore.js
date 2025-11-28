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
      
      // Присоединяемся к сцене
      socket.emit('scene:join');
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
      set({
        entities: state.entities || [],
        connections: state.connections || []
      });
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
      console.log('📥 Получено entity:updated:', updatedEntity);
      set((state) => {
        const updatedEntities = state.entities.map(e =>
          e.id === updatedEntity.id ? updatedEntity : e
        );
        const changedEntity = updatedEntities.find(e => e.id === updatedEntity.id);
        console.log('🔄 Store updated entity:', { id: changedEntity?.id, type: changedEntity?.type });
        return { entities: updatedEntities };
      });
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
    viewMode: '3d', // '3d' or '2d'
    entityPositions2D: {}, // Отдельное хранилище для 2D координат: { entityId: [x, z] }
    socket: null,
    socketConnected: false,
    error: null,

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
      const requestedPosition = entityData.position || [0, 1, 0];
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
          console.log('🔄 updateEntity local:', { id, updates, updatedEntity: updatedEntities.find(e => e.id === id) });
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
          console.log('📤 Отправка entity:update на сервер:', { id, ...updates });
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

    // Обновление 2D позиции (не влияет на 3D)
    updateEntityPosition2D: (id, position2D) => {
      set((state) => ({
        entityPositions2D: {
          ...state.entityPositions2D,
          [id]: position2D // [x, z] для 2D
        }
      }));
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
    }
  };
});

