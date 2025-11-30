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
      
      // Инициализируем 2D позиции для всех элементов из 3D координат
      const newPositions2D = { ...currentState.elementPositions2D };
      if (state.elements && state.elements.length > 0) {
        state.elements.forEach(element => {
          if (!newPositions2D[element.id] && element.position) {
            // Создаем 2D позицию из 3D (используем X и Z)
            newPositions2D[element.id] = [element.position[0], element.position[2] || 0];
          }
        });
      }
      
      // Если мы в режиме просмотра всех сцен (currentSceneId === null), не перезаписываем elements
      // Они будут загружены через loadAllScenes
      if (currentState.currentSceneId === null && state.sceneId) {
        // Мы переключаемся в конкретную сцену - обновляем elements
        const updates = {
          elements: state.elements || [],
          connections: state.connections || [],
          elementPositions2D: newPositions2D,
          currentSceneId: state.sceneId
        };
        console.log('✅ Установлена текущая сцена:', state.sceneId, 'elements:', state.elements?.length || 0);
        set(updates);
      } else if (currentState.currentSceneId === null) {
        // Мы в режиме просмотра всех сцен и получили elements без сцены - обновляем только если нет elements
        if (currentState.elements.length === 0) {
          const updates = {
            elements: state.elements || [],
            connections: state.connections || [],
            elementPositions2D: newPositions2D
          };
          console.log('📋 Нет sceneId, показываем корневые сцены, elements:', state.elements?.length || 0);
          set(updates);
        }
      } else {
        // Мы в конкретной сцене - обновляем elements
        const updates = {
          elements: state.elements || [],
          connections: state.connections || [],
          elementPositions2D: newPositions2D
        };
        
        // Если в состоянии есть sceneId, устанавливаем его как текущую сцену
        if (state.sceneId) {
          updates.currentSceneId = state.sceneId;
          console.log('✅ Установлена текущая сцена:', state.sceneId, 'elements:', state.elements?.length || 0);
        } else {
          // Если sceneId нет, но есть elements, это означает, что мы в дефолтной сцене
          // Оставляем currentSceneId как null, чтобы показывать корневые сцены
          console.log('📋 Нет sceneId, показываем корневые сцены, elements:', state.elements?.length || 0);
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
          elements: [],
          connections: [],
          selectedElementId: null,
          selectedConnectionId: null,
          elementPositions2D: {},
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


    socket.on('element:created', (element) => {
      set((state) => {
        // Автоматически создаем 2D позицию для нового элемента
        const newPositions2D = { ...state.elementPositions2D };
        if (!newPositions2D[element.id] && element.position) {
          // Если элемент создан в 3D, создаем 2D позицию из 3D (X и Z)
          newPositions2D[element.id] = [element.position[0], element.position[2] || 0];
        }
        return {
          elements: [...state.elements, element],
          elementPositions2D: newPositions2D
        };
      });
    });

    socket.on('element:updated', (updatedElement) => {
      set((state) => {
        const updatedElements = state.elements.map(e =>
          e.id === updatedElement.id ? updatedElement : e
        );
        return { elements: updatedElements };
      });
    });

    socket.on('element:scene-updated', ({ elementId, sceneId }) => {
      console.log('📥 Получено element:scene-updated:', { elementId, sceneId });
      set((state) => ({
        elements: state.elements.map(e =>
          e.id === elementId ? { ...e, parent_id: sceneId } : e
        )
      }));
    });

    socket.on('element:deleted', ({ id }) => {
      set((state) => {
        const newPositions2D = { ...state.elementPositions2D };
        delete newPositions2D[id];
        return {
          elements: state.elements.filter(e => e.id !== id),
          selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
          elementPositions2D: newPositions2D
        };
      });
    });

    socket.on('connection:created', (connection) => {
      set((state) => {
        // Проверяем, нет ли уже такой связи (избегаем дубликатов)
        const exists = state.connections.some(c => c.id === connection.id);
        if (exists) {
          return state;
        }
        
        const newConnections = [...state.connections, connection];
        
        // Обновляем sceneConnections, если связь между сценами
        const sceneIds = new Set(state.allScenes.map(s => s.id));
        const isSceneConnection = sceneIds.has(connection.from) && sceneIds.has(connection.to);
        const newSceneConnections = isSceneConnection 
          ? [...(state.sceneConnections || []), connection]
          : state.sceneConnections;
        
        return {
          connections: newConnections,
          sceneConnections: newSceneConnections
        };
      });
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
        sceneConnections: state.sceneConnections.filter(c => c.id !== id),
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
    elements: [],
    connections: [],
    selectedElementId: null,
    selectedConnectionId: null,
    connectMode: false,
    connectingFrom: null,
    cameraPosition: [0, 5, 10],
    viewMode: '2d', // '3d' or '2d' - по умолчанию 2D вид
    elementPositions2D: {}, // Отдельное хранилище для 2D координат: { elementId: [x, z] }
    socket: null,
    socketConnected: false,
    error: null,
    orbitControls: null, // Ссылка на OrbitControls для блокировки камеры
    currentSceneId: null,
    currentSceneName: null,
    
    // Состояние для работы со сценами в 2D (в разделе "Мои сцены")
    allScenes: [], // Все сцены пользователя с позициями (элементы с element_type='scene')
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

    // Управление элементами
    createElement: (elementData) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      const currentElements = get().elements || [];
      let requestedPosition = elementData.position;
      
      // Если позиция не указана или null, используем центр canvas
      if (!requestedPosition && canvasCenterCallback) {
        const center = canvasCenterCallback();
        requestedPosition = [center.x, 1, center.z];
      } else if (!requestedPosition) {
        requestedPosition = [0, 1, 0];
      }
      
      const size = elementData.size || [1, 1, 1];
      const type = elementData.type || null;
      
      // Находим свободную позицию без коллизий (только для worker/block, не для scene)
      let freePosition = requestedPosition;
      if (elementData.elementType !== 'scene') {
        // Убеждаемся, что currentElements - это массив
        const elementsArray = Array.isArray(currentElements) ? currentElements : [];
        freePosition = findFreePosition(size, type || 'box', elementsArray, requestedPosition);
      }

      const element = {
        id: elementData.id || `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: elementData.name || `Element ${currentElements.length + 1}`,
        description: elementData.description || '',
        elementType: elementData.elementType || 'worker',
        type: type,
        parent_id: elementData.parent_id || null,
        position_2d: elementData.position_2d || null,
        position: elementData.elementType === 'scene' ? null : freePosition,
        size_2d: elementData.size_2d || null,
        size: elementData.elementType === 'scene' ? null : size,
        color: elementData.color || null,
        emissive: elementData.emissive || null,
        background: elementData.background || null,
        showGrid: elementData.showGrid !== undefined ? elementData.showGrid : null
      };

      socket.emit('element:create', element);
      
      // Оптимистичное обновление + создание 2D позиции
      set((state) => {
        const newPositions2D = { ...state.elementPositions2D };
        // Создаем 2D позицию из 3D (X и Z) или используем position_2d
        if (element.position_2d) {
          newPositions2D[element.id] = element.position_2d;
        } else if (element.position) {
          newPositions2D[element.id] = [freePosition[0], freePosition[2] || 0];
        }
        return {
          elements: [...state.elements, element],
          selectedElementId: element.id,
          elementPositions2D: newPositions2D
        };
      });
    },

    updateElement: (() => {
      let updateTimeout = null;
      const pendingUpdates = new Map();

      return (id, updates) => {
        if (!socket || !socket.connected) {
          console.error('Socket не подключен');
          return;
        }

        // Оптимистичное обновление сразу
        set((state) => {
          const updatedElements = state.elements.map(e =>
            e.id === id ? { ...e, ...updates } : e
          );
          return { elements: updatedElements };
        });

        // Debounce отправки на сервер (особенно для позиций)
        if (updates.position || updates.position_2d) {
          pendingUpdates.set(id, { id, ...updates });
          
          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }
          
          updateTimeout = setTimeout(() => {
            pendingUpdates.forEach((update) => {
              socket.emit('element:update', update);
            });
            pendingUpdates.clear();
          }, 100); // 100ms debounce для позиций
        } else {
          // Для других обновлений (type, color, name, description) отправляем сразу
          socket.emit('element:update', { id, ...updates });
        }
      };
    })(),

    deleteElement: (id) => {
      if (!socket || !socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      socket.emit('element:delete', id);
      
      // Оптимистичное обновление
      set((state) => ({
        elements: state.elements.filter(e => e.id !== id),
        selectedElementId: state.selectedElementId === id ? null : state.selectedElementId
      }));
    },

    // Установка родительской сцены для элемента (parent_id)
    setElementScene: (elementId, sceneId) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      set({
        elements: state.elements.map(e =>
          e.id === elementId ? { ...e, parent_id: sceneId || null } : e
        )
      });

      // Отправляем на сервер
      state.socket.emit('element:set-scene', {
        elementId,
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
    selectElement: (id) => {
      set({ selectedElementId: id, selectedConnectionId: null });
    },

    selectConnection: (id) => {
      set({ selectedConnectionId: id, selectedElementId: null });
    },

    clearSelection: () => {
      set({ selectedElementId: null, selectedConnectionId: null });
    },

    // Режим соединения
    setConnectMode: (enabled) => {
      set({ connectMode: enabled, connectingFrom: null });
    },

    setConnectingFrom: (elementId) => {
      set({ connectingFrom: elementId });
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
    updateElementPosition2D: (id, position2D) => {
      const currentState = get();
      const element = currentState.elements.find(e => e.id === id);
      
      set((state) => ({
        elementPositions2D: {
          ...state.elementPositions2D,
          [id]: position2D // [x, z] для 2D
        }
      }));
      
      // Также обновляем 3D позицию, чтобы она сохранялась (только для worker/block)
      if (element && element.position) {
        const newPosition3D = [position2D[0], element.position?.[1] || 1, position2D[1]];
        get().updateElementPosition3D(id, newPosition3D);
      } else if (element && element.elementType === 'scene') {
        // Для сцен обновляем position_2d
        get().updateElement(id, { position_2d: position2D });
      }
    },

    // Обновление 3D позиции (не влияет на 2D)
    updateElementPosition3D: (id, position3D) => {
      const state = get();
      if (!state.socket || !state.socket.connected) {
        console.error('Socket не подключен');
        return;
      }

      // Обновляем локально
      set((state) => {
        const updatedElements = state.elements.map(e =>
          e.id === id ? { ...e, position: position3D } : e
        );
        return { elements: updatedElements };
      });

      // Отправляем на сервер с debounce
      if (position3DUpdateTimeout) {
        clearTimeout(position3DUpdateTimeout);
      }
      position3DUpdateTimeout = setTimeout(() => {
        state.socket.emit('element:update', { id, position: position3D });
      }, 100);
    },

    // Получение 2D позиции (если есть) или создание из 3D
    getElementPosition2D: (element) => {
      const state = get();
      if (element.position_2d) {
        return element.position_2d;
      }
      if (state.elementPositions2D[element.id]) {
        return state.elementPositions2D[element.id];
      }
      // Если нет 2D позиции, создаем из 3D (используем X и Z)
      if (element.position) {
        return [element.position[0], element.position[2] || 0];
      }
      return [0, 0];
    },

    // Инициализация 2D позиций из 3D при первом переключении в 2D
    initialize2DPositions: () => {
      const state = get();
      const newPositions2D = { ...state.elementPositions2D };
      let hasNew = false;

      // Обрабатываем только worker и block (не scene)
      const workerAndBlockElements = state.elements.filter(e => e.elementType !== 'scene');
      
      workerAndBlockElements.forEach(element => {
        if (!newPositions2D[element.id] && element.position) {
          // Создаем 2D позицию из 3D (X и Z)
          newPositions2D[element.id] = [element.position[0], element.position[2] || 0];
          hasNew = true;
        }
      });

      if (hasNew) {
        set({ elementPositions2D: newPositions2D });
      }
      
      // Всегда проверяем, все ли блоки на одной позиции при переключении в 2D
      if (workerAndBlockElements.length > 1) {
        // Проверяем, все ли на одной позиции
        let allSamePosition = true;
        const firstPos = newPositions2D[workerAndBlockElements[0].id] || 
          (workerAndBlockElements[0].position ? [workerAndBlockElements[0].position[0], workerAndBlockElements[0].position[2] || 0] : [0, 0]);
        
        for (let i = 1; i < workerAndBlockElements.length; i++) {
          const pos = newPositions2D[workerAndBlockElements[i].id] || 
            (workerAndBlockElements[i].position ? [workerAndBlockElements[i].position[0], workerAndBlockElements[i].position[2] || 0] : [0, 0]);
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
          const cols = Math.ceil(Math.sqrt(workerAndBlockElements.length));
          const rows = Math.ceil(workerAndBlockElements.length / cols);
          
          workerAndBlockElements.forEach((element, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const newX = (col - (cols - 1) / 2) * blockSpacing;
            const newZ = (row - (rows - 1) / 2) * blockSpacing;
            newPositions2D[element.id] = [newX, newZ];
          });
          
          // Обновляем сразу синхронно
          set({ elementPositions2D: newPositions2D });
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
        elements: [],
        connections: [],
        selectedElementId: null,
        selectedConnectionId: null,
        elementPositions2D: {},
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

      // Устанавливаем currentSceneId в null, чтобы показывать все элементы
      set({ currentSceneId: null });

      state.socket.emit('scene:list-with-connections');

      const handleList = (data) => {
        const { scenes, connections, elements, elementConnections } = data;
        const positions2D = {};
        
        scenes.forEach(scene => {
          if (scene.position_2d) {
            positions2D[scene.id] = scene.position_2d;
          }
        });

        // Убеждаемся, что connections - это массив
        const normalizedConnections = Array.isArray(connections) ? connections : [];
        const normalizedElements = Array.isArray(elements) ? elements : [];
        const normalizedElementConnections = Array.isArray(elementConnections) ? elementConnections : [];

        const currentState = get();
        
        // Вычисляем sceneConnections из connections - фильтруем связи между сценами
        const sceneIds = new Set(scenes.map(s => s.id));
        const computedSceneConnections = normalizedElementConnections.filter(conn => 
          sceneIds.has(conn.from) && sceneIds.has(conn.to)
        );
        
        const updates = {
          allScenes: scenes,
          sceneConnections: computedSceneConnections, // Вычисляем из connections
          scenePositions2D: positions2D
        };

        // loadAllScenes всегда загружает ВСЕ элементы пользователя для режима "Мои сцены"
        // Обновляем элементы независимо от currentSceneId
        updates.elements = normalizedElements;
        updates.connections = normalizedElementConnections;
        
        // Инициализируем 2D позиции для всех элементов из 3D координат или position_2d
        const newPositions2D = { ...currentState.elementPositions2D };
        normalizedElements.forEach(element => {
          if (element.position_2d) {
            newPositions2D[element.id] = element.position_2d;
          } else if (element.position && (!newPositions2D[element.id] || 
              (element.position[0] !== newPositions2D[element.id][0] || 
               (element.position[2] || 0) !== newPositions2D[element.id][1]))) {
            // Создаем или обновляем 2D позицию из 3D (используем X и Z)
            newPositions2D[element.id] = [element.position[0], element.position[2] || 0];
          }
        });
        updates.elementPositions2D = newPositions2D;

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

