import { create } from 'zustand';
import socketService from '../services/socket';

// 4 типа элементов блок-схемы
export const ELEMENT_TYPES = {
  flowchart_root: {
    id: 'flowchart_root',
    name: 'Компания',
    icon: '🏢',
    color: '#6366f1',
    description: 'Корень организационной структуры',
    canContain: true,
    properties: {
      head: { label: 'Генеральный директор', type: 'text', default: '' },
      location: { label: 'Расположение', type: 'text', default: '' },
      budget: { label: 'Общий бюджет', type: 'number', default: 0 }
    }
  },
  executive: {
    id: 'executive',
    name: 'Топ-менеджер',
    icon: '👔',
    color: '#ec4899',
    description: 'Высшее руководство компании',
    canContain: true,
    properties: {
      position: { label: 'Должность', type: 'text', default: '' },
      level: { label: 'Уровень', type: 'text', default: 'c-level' },
      email: { label: 'Email', type: 'text', default: '' },
      phone: { label: 'Телефон', type: 'text', default: '' }
    }
  },
  head: {
    id: 'head',
    name: 'Руководитель отдела',
    icon: '👤',
    color: '#f59e0b',
    description: 'Руководитель департамента или подразделения',
    canContain: true,
    properties: {
      position: { label: 'Должность', type: 'text', default: '' },
      level: { label: 'Уровень', type: 'text', default: 'head' },
      email: { label: 'Email', type: 'text', default: '' },
      phone: { label: 'Телефон', type: 'text', default: '' }
    }
  },
  department: {
    id: 'department',
    name: 'Департамент',
    icon: '🏢',
    color: '#3b82f6',
    description: 'Отдел или подразделение компании',
    canContain: true,
    properties: {
      head: { label: 'Руководитель', type: 'text', default: '' },
      location: { label: 'Расположение', type: 'text', default: '' },
      budget: { label: 'Бюджет', type: 'number', default: 0 }
    }
  },
  worker: {
    id: 'worker',
    name: 'Работник',
    icon: '👷',
    color: '#22c55e',
    description: 'Рядовой сотрудник компании',
    canContain: false,
    properties: {
      position: { label: 'Должность', type: 'text', default: '' },
      level: { label: 'Уровень', type: 'text', default: 'middle' },
      email: { label: 'Email', type: 'text', default: '' },
      phone: { label: 'Телефон', type: 'text', default: '' }
    }
  },
  service: {
    id: 'service',
    name: 'Сервис',
    icon: '⚙️',
    color: '#f59e0b',
    description: 'Внутренний сервис или система',
    canContain: false,
    properties: {
      type: { label: 'Тип сервиса', type: 'text', default: '' },
      status: { label: 'Статус', type: 'text', default: 'Активен' },
      url: { label: 'URL', type: 'text', default: '' }
    }
  },
  offering: {
    id: 'offering',
    name: 'Услуга',
    icon: '💼',
    color: '#8b5cf6',
    description: 'Услуга для клиентов',
    canContain: false,
    properties: {
      price: { label: 'Цена', type: 'number', default: 0 },
      duration: { label: 'Длительность', type: 'text', default: '' },
      category: { label: 'Категория', type: 'text', default: '' }
    }
  }
};

// Типы направления связей
export const CONNECTION_DIRECTIONS = {
  outgoing: { id: 'outgoing', name: 'Исходящая', icon: '→' },
  incoming: { id: 'incoming', name: 'Входящая', icon: '←' },
  bidirectional: { id: 'bidirectional', name: 'Двунаправленная', icon: '↔' }
};

// Типы связей для организационной структуры
export const CONNECTION_TYPES = {
  manages: { 
    id: 'manages', 
    name: 'Руководит', 
    icon: '👔',
    color: '#6366f1',
    defaultDirection: 'outgoing'
  },
  reports_to: { 
    id: 'reports_to', 
    name: 'Подчиняется', 
    icon: '📊',
    color: '#3b82f6',
    defaultDirection: 'outgoing'
  },
  collaborates: { 
    id: 'collaborates', 
    name: 'Сотрудничает', 
    icon: '🤝',
    color: '#22c55e',
    defaultDirection: 'bidirectional'
  },
  approves: { 
    id: 'approves', 
    name: 'Согласовывает', 
    icon: '✅',
    color: '#f59e0b',
    defaultDirection: 'outgoing'
  },
  consults: { 
    id: 'consults', 
    name: 'Консультирует', 
    icon: '💬',
    color: '#8b5cf6',
    defaultDirection: 'outgoing'
  },
  supports: { 
    id: 'supports', 
    name: 'Обеспечивает', 
    icon: '🔧',
    color: '#ef4444',
    defaultDirection: 'outgoing'
  }
};

// Базовый размер элемента
const BASE_SIZE = 100;
// Коэффициент уменьшения для дочерних элементов
const CHILD_SCALE = 0.4;
// Отступ между элементами внутри родителя
const PADDING = 10;

// Auto-layout constants
const ELEMENT_SIZE = 120; // Visual size of elements
const ELEMENT_GAP = 40;   // Gap between elements
const VIEW_PADDING = 60;  // Padding from viewport edges

// Debounce timer for auto-save
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_MS = 2000;

export const useFlowchartStore = create((set, get) => ({
  // Состояние элементов и связей
  elements: [],
  connections: [],
  parentChildConnections: [], // New state for parent-child relationships

  selectedElementId: null,
  selectedConnectionId: null,
  
  // Viewport состояние
  pan: { x: 0, y: 0 },
  zoom: 1,
  
  // Режимы
  isConnecting: false,
  connectingFrom: null,
  dropTargetId: null,
  viewMode: '2d', // '2d' or '3d'

  // Навигация по иерархии
  currentViewId: null, // ID элемента, внутрь которого мы "провалились" (null = корень)
  viewHistory: [], // История навигации для возврата

  // Socket.IO состояние
  socketInitialized: false,
  isSaving: false,
  isLoading: false,
  lastSaved: null,
  hasUnsavedChanges: false,

  // Вычислить размер элемента на основе его детей
  calculateElementSize: (elementId) => {
    const { elements, parentChildConnections } = get();
    const element = elements.find(e => e.id === elementId);
    if (!element) return BASE_SIZE;

    const children = parentChildConnections
      .filter(conn => conn.parent_element_id === elementId)
      .map(conn => elements.find(e => e.id === conn.child_element_id))
      .filter(Boolean); // Remove any undefined children if not found in elements array
    
    if (children.length === 0) {
      return BASE_SIZE;
    }

    // Вычисляем размеры всех детей рекурсивно
    const childSizes = children.map(child => get().calculateElementSize(child.id) * CHILD_SCALE);
    
    // Располагаем детей в сетке
    const cols = Math.ceil(Math.sqrt(children.length));
    const rows = Math.ceil(children.length / cols);
    
    const maxChildSize = Math.max(...childSizes);
    const totalWidth = cols * maxChildSize + (cols + 1) * PADDING;
    const totalHeight = rows * maxChildSize + (rows + 1) * PADDING + 30;
    
    return Math.max(BASE_SIZE, Math.max(totalWidth, totalHeight));
  },

  // Initialize Socket.IO event listeners
  initSocketListeners: () => {
    if (get().socketInitialized) return;

    // Element events from other clients
    socketService.on('flowchart:element:created', ({ element }) => {
      set((state) => {
        // Only add if not already exists
        if (state.elements.find(e => e.id === element.id)) return state;
        // Ensure element_type is used and old type/parentId/depth are not directly set on element
        const newElement = { ...element };
        if (newElement.type) { // Remove old 'type' if present
          newElement.element_type = newElement.type;
          delete newElement.type;
        }
        delete newElement.parentId; // ParentId is now in parentChildConnections
        delete newElement.depth; // Depth is now derived or handled by client logic
        
        return { elements: [...state.elements, newElement] };
      });
    });

    // Parent-child connection events
    socketService.on('flowchart:element:parent_child_connection_created', ({ parent_element_id, child_element_id }) => {
      set((state) => {
        // Only add if not already exists
        if (state.parentChildConnections.some(conn => 
          conn.parent_element_id === parent_element_id && conn.child_element_id === child_element_id
        )) return state;
        return { 
          parentChildConnections: [...state.parentChildConnections, { parent_element_id, child_element_id }]
        };
      });
    });

    socketService.on('flowchart:element:updated', ({ id, updates }) => {
      set((state) => {
        // Ensure element_type is used and old type/parentId/depth are not directly set on element
        const newUpdates = { ...updates };
        if (newUpdates.type) {
          newUpdates.element_type = newUpdates.type;
          delete newUpdates.type;
        }
        delete newUpdates.parentId;
        delete newUpdates.depth;

        return {
          elements: state.elements.map(el =>
            el.id === id ? { ...el, ...newUpdates } : el
          )
        };
      });
    });

    socketService.on('flowchart:element:parent_child_connection_updated', ({ old_parent_id, old_child_id, new_parent_id, new_child_id }) => {
      set((state) => ({
        parentChildConnections: state.parentChildConnections.map(conn =>
          conn.parent_element_id === old_parent_id && conn.child_element_id === old_child_id
            ? { ...conn, parent_element_id: new_parent_id, child_element_id: new_child_id }
            : conn
        )
      }));
    });

    socketService.on('flowchart:element:parent_child_connection_deleted', ({ parent_element_id, child_element_id }) => {
      set((state) => ({
        parentChildConnections: state.parentChildConnections.filter(conn =>
          !(conn.parent_element_id === parent_element_id && conn.child_element_id === child_element_id)
        )
      }));
    });

    socketService.on('flowchart:element:moved', ({ id, position }) => {
      set((state) => ({
        elements: state.elements.map(el =>
          el.id === id ? { ...el, position } : el
        )
      }));
    });

    socketService.on('flowchart:element:deleted', ({ id }) => {
      const { elements, parentChildConnections } = get(); // Get parentChildConnections
      
      const collectChildren = (elementId) => {
        const children = parentChildConnections // Use parentChildConnections
          .filter(conn => conn.parent_element_id === elementId)
          .map(conn => conn.child_element_id);
        return [elementId, ...children.flatMap(c => collectChildren(c))];
      };
      const idsToDelete = collectChildren(id);

      set((state) => ({
        elements: state.elements.filter(el => !idsToDelete.includes(el.id)),
        connections: state.connections.filter(
          conn => !idsToDelete.includes(conn.from) && !idsToDelete.includes(conn.to)
        ),
        parentChildConnections: state.parentChildConnections.filter(conn => // Filter out deleted parent-child connections
          !idsToDelete.includes(conn.parent_element_id) && !idsToDelete.includes(conn.child_element_id)
        ),
        selectedElementId: idsToDelete.includes(state.selectedElementId) ? null : state.selectedElementId
      }));
    });

    // Navigation events
    socketService.on('flowchart:connection:created', ({ connection }) => {
      set((state) => {
        if (state.connections.find(c => c.id === connection.id)) return state;
        return { connections: [...state.connections, connection] };
      });
    });

    socketService.on('flowchart:connection:updated', ({ id, updates }) => {
      set((state) => ({
        connections: state.connections.map(conn => 
          conn.id === id ? { ...conn, ...updates } : conn
        )
      }));
    });

    socketService.on('flowchart:connection:deleted', ({ id }) => {
      set((state) => ({
        connections: state.connections.filter(conn => conn.id !== id),
        selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId
      }));
    });

    // Navigation events
    socketService.on('flowchart:navigated:into', ({ elementId }) => {
      const { elements, currentViewId } = get();
      const element = elements.find(e => e.id === elementId);
      if (!element) return;

      set((state) => ({
        currentViewId: elementId,
        viewHistory: currentViewId ? [...state.viewHistory, currentViewId] : [],
        pan: { x: 0, y: 0 },
        zoom: 1,
        selectedElementId: null,
        selectedConnectionId: null
      }));
    });

    socketService.on('flowchart:navigated:up', () => {
      const { currentViewId, elements } = get();
      if (!currentViewId) return;

      const currentElement = elements.find(e => e.id === currentViewId);
      const parentId = currentElement?.parentId || null;

      set((state) => ({
        currentViewId: parentId,
        viewHistory: parentId ? state.viewHistory.slice(0, -1) : [],
        pan: { x: 0, y: 0 },
        zoom: 1,
        selectedElementId: null,
        selectedConnectionId: null
      }));
    });

    socketService.on('flowchart:navigated:root', () => {
      set({
        currentViewId: null,
        viewHistory: [],
        pan: { x: 0, y: 0 },
        zoom: 1,
        selectedElementId: null,
        selectedConnectionId: null
      });
    });

    // Save confirmation
    socketService.on('flowchart:saved', ({ id, updatedAt }) => {
      set({ lastSaved: new Date(updatedAt), hasUnsavedChanges: false, isSaving: false });
    });

    set({ socketInitialized: true });
    console.log('🔌 Flowchart socket listeners initialized');
  },

  // Trigger debounced auto-save
  triggerAutoSave: () => {
    set({ hasUnsavedChanges: true });

    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }

    saveDebounceTimer = setTimeout(() => {
      get().saveFlowchart();
    }, SAVE_DEBOUNCE_MS);
  },

  // Save immediately (call when drag ends, etc.)
  saveNow: () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    
    if (get().hasUnsavedChanges) {
      get().saveFlowchart();
    }
  },

  // === ДЕЙСТВИЯ С ЭЛЕМЕНТАМИ ===

  addElement: (type, position, parentId = null) => {
    const elementType = ELEMENT_TYPES[type];
    if (!elementType) return;

    const { elements } = get();

    const newElement = {
      id: `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      element_type: type,
      name: elementType.name,
      description: '',
      position: position || { x: 0, y: 0 },
      position3d: null, // 3D position will be set when moved in 3D view
      color: elementType.color,
      properties: Object.fromEntries(
        Object.entries(elementType.properties).map(([key, prop]) => [key, prop.default])
      )
    };


    set((state) => ({
      elements: [...state.elements, newElement],
      selectedElementId: newElement.id
    }));

    // Send to server
    socketService.createElement(newElement);
    get().triggerAutoSave();

    return newElement;
  },

  // Добавление дочернего элемента
  addChildElement: (parentId, type) => {
    const { elements } = get();
    const parent = elements.find(el => el.id === parentId);
    if (!parent) return null;

    const elementType = ELEMENT_TYPES[type];
    if (!elementType) return null;

    const newElement = {
      id: `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type,
      name: elementType.name,
      description: '',
      position: { x: 0, y: 0 },
      color: elementType.color,
      parentId: parentId,
      depth: (parent.depth || 0) + 1,
      properties: Object.fromEntries(
        Object.entries(elementType.properties).map(([key, prop]) => [key, prop.default])
      )
    };

    set((state) => ({
      elements: [...state.elements, newElement],
      selectedElementId: newElement.id
    }));

    // Send to server
    socketService.createElement(newElement);
    get().triggerAutoSave();

    return newElement;
  },

  updateElement: (id, updates) => {
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...updates } : el
      )
    }));

    // Send to server
    socketService.updateElement(id, updates);
    get().triggerAutoSave();
  },

  // Update element 3D position
  updateElement3DPosition: (id, position3d) => {
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, position3d } : el
      )
    }));

    // Send to server
    socketService.updateElement(id, { position3d });
    get().triggerAutoSave();
  },

  deleteElement: (id) => {
    const { elements } = get();
    
    // Собираем все дочерние элементы рекурсивно
    const collectChildren = (elementId) => {
      const children = elements.filter(e => e.parentId === elementId);
      return [elementId, ...children.flatMap(c => collectChildren(c.id))];
    };
    
    const idsToDelete = collectChildren(id);
    
    set((state) => ({
      elements: state.elements.filter((el) => !idsToDelete.includes(el.id)),
      connections: state.connections.filter(
        (conn) => !idsToDelete.includes(conn.from) && !idsToDelete.includes(conn.to)
      ),
      selectedElementId: idsToDelete.includes(state.selectedElementId) ? null : state.selectedElementId
    }));

    // Send to server
    socketService.deleteElement(id);
    get().triggerAutoSave();
  },

  selectElement: (id) => {
    set({ selectedElementId: id, selectedConnectionId: null });
  },

  // Вложение элемента в другой
  nestElement: (childId, parentId) => {
    const { elements } = get();
    const child = elements.find(el => el.id === childId);
    const parent = elements.find(el => el.id === parentId);
    
    if (!child || !parent) return;
    if (childId === parentId) return;
    
    // Проверяем, что не пытаемся вложить элемент в своего потомка
    const isDescendant = (elementId, ancestorId) => {
      const el = elements.find(e => e.id === elementId);
      if (!el) return false;
      if (el.parentId === ancestorId) return true;
      if (el.parentId) return isDescendant(el.parentId, ancestorId);
      return false;
    };
    
    if (isDescendant(parentId, childId)) return;

    set((state) => ({
      elements: state.elements.map(el => {
        if (el.id === childId) {
          return {
            ...el,
            parentId: parentId,
            depth: (parent.depth || 0) + 1
          };
        }
        return el;
      })
    }));
    
    // Обновляем глубину всех потомков
    const updateChildDepths = (elementId, parentDepth) => {
      const children = get().elements.filter(e => e.parentId === elementId);
      children.forEach(c => {
        set((state) => ({
          elements: state.elements.map(el => 
            el.id === c.id ? { ...el, depth: parentDepth + 1 } : el
          )
        }));
        updateChildDepths(c.id, parentDepth + 1);
      });
    };
    
    updateChildDepths(childId, (parent.depth || 0) + 1);

    // Send to server
    socketService.nestElement(childId, parentId);
    get().triggerAutoSave();
  },

  // Извлечение элемента из родителя
  unnestElement: (elementId) => {
    const { elements, currentViewId } = get();
    const element = elements.find(el => el.id === elementId);
    
    if (!element || !element.parentId) return;
    
    const parent = elements.find(el => el.id === element.parentId);
    
    // Определяем новую позицию
    let newPosition = { x: 0, y: 0 };
    if (!currentViewId && parent) {
      newPosition = {
        x: (parent.position.x || 0) + 150,
        y: parent.position.y || 0
      };
    }
    
    // Определяем нового родителя
    const newParentId = parent?.parentId || null;
    const newParent = newParentId ? elements.find(e => e.id === newParentId) : null;
    const newDepth = newParent ? (newParent.depth || 0) + 1 : 0;
    
    set((state) => ({
      elements: state.elements.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            parentId: newParentId,
            depth: newDepth,
            position: newPosition
          };
        }
        return el;
      })
    }));
    
    // Обновляем глубину всех потомков
    const updateChildDepths = (elId, parentDepth) => {
      const children = get().elements.filter(e => e.parentId === elId);
      children.forEach(c => {
        set((state) => ({
          elements: state.elements.map(el => 
            el.id === c.id ? { ...el, depth: parentDepth + 1 } : el
          )
        }));
        updateChildDepths(c.id, parentDepth + 1);
      });
    };
    
    updateChildDepths(elementId, newDepth);

    // Send to server
    socketService.unnestElement(elementId, newPosition);
    get().triggerAutoSave();
  },

  // Получить дочерние элементы
  getChildren: (parentId) => {
    return get().elements.filter(el => el.parentId === parentId);
  },
  
  // Получить корневые элементы
  getRootElements: () => {
    return get().elements.filter(el => !el.parentId);
  },

  // Получить все потомки рекурсивно
  getAllDescendants: (elementId) => {
    const { elements } = get();
    const collectDescendants = (id) => {
      const children = elements.filter(e => e.parentId === id);
      return [...children, ...children.flatMap(c => collectDescendants(c.id))];
    };
    return collectDescendants(elementId);
  },

  // Получить путь к элементу (для breadcrumbs)
  getElementPath: (elementId) => {
    const { elements } = get();
    const path = [];
    let current = elements.find(e => e.id === elementId);
    
    while (current) {
      path.unshift(current);
      current = current.parentId ? elements.find(e => e.id === current.parentId) : null;
    }
    
    return path;
  },

  setDropTarget: (elementId) => {
    set({ dropTargetId: elementId });
  },

  // === НАВИГАЦИЯ ПО ИЕРАРХИИ ===

  navigateInto: (elementId) => {
    const { elements, currentViewId } = get();
    const element = elements.find(e => e.id === elementId);
    
    if (!element) return;
    
    // Только элементы с canContain могут быть "открыты" (например, департаменты)
    const elementType = ELEMENT_TYPES[element.type];
    if (!elementType?.canContain) return;
    
    set((state) => ({
      currentViewId: elementId,
      viewHistory: currentViewId 
        ? [...state.viewHistory, currentViewId] 
        : [],
      pan: { x: 0, y: 0 },
      zoom: 1,
      selectedElementId: null,
      selectedConnectionId: null
    }));

    // Send to server
    socketService.navigateInto(elementId);
  },

  navigateUp: () => {
    const { viewHistory, currentViewId, elements } = get();
    
    if (!currentViewId) return;
    
    const currentElement = elements.find(e => e.id === currentViewId);
    const parentId = currentElement?.parentId || null;
    
    set((state) => ({
      currentViewId: parentId,
      viewHistory: parentId ? state.viewHistory.slice(0, -1) : [],
      pan: { x: 0, y: 0 },
      zoom: 1,
      selectedElementId: null,
      selectedConnectionId: null
    }));

    // Send to server
    socketService.navigateUp();
  },

  navigateToRoot: () => {
    set({
      currentViewId: null,
      viewHistory: [],
      pan: { x: 0, y: 0 },
      zoom: 1,
      selectedElementId: null,
      selectedConnectionId: null
    });

    // Send to server
    socketService.navigateToRoot();
  },

  // Получить элементы текущего уровня просмотра
  getVisibleElements: () => {
    const { elements, currentViewId } = get();
    
    if (currentViewId === null) {
      return elements.filter(e => !e.parentId);
    } else {
      return elements.filter(e => e.parentId === currentViewId);
    }
  },

  // === ДЕЙСТВИЯ С СОЕДИНЕНИЯМИ ===

  addConnection: (fromId, toId, direction = 'outgoing', type = 'collaborates') => {
    const { connections } = get();
    
    const exists = connections.some(
      (c) => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );
    
    if (exists || fromId === toId) return null;

    const connType = CONNECTION_TYPES[type] || CONNECTION_TYPES.collaborates;

    const newConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from: fromId,
      to: toId,
      direction: direction,
      type: type,
      description: '',
      label: ''
    };

    set((state) => ({
      connections: [...state.connections, newConnection],
      selectedConnectionId: newConnection.id
    }));

    // Send to server
    socketService.createConnection(newConnection);
    get().triggerAutoSave();

    return newConnection;
  },

  updateConnection: (id, updates) => {
    set((state) => ({
      connections: state.connections.map((conn) =>
        conn.id === id ? { ...conn, ...updates } : conn
      )
    }));

    // Send to server
    socketService.updateConnection(id, updates);
    get().triggerAutoSave();
  },

  deleteConnection: (id) => {
    set((state) => ({
      connections: state.connections.filter((conn) => conn.id !== id),
      selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId
    }));

    // Send to server
    socketService.deleteConnection(id);
    get().triggerAutoSave();
  },

  selectConnection: (id) => {
    set({ selectedConnectionId: id, selectedElementId: null });
  },

  // Получить все связи элемента
  getElementConnections: (elementId) => {
    const { connections, elements } = get();
    
    const incoming = connections.filter(c => c.to === elementId || (c.from === elementId && c.direction === 'incoming'));
    const outgoing = connections.filter(c => c.from === elementId && c.direction === 'outgoing');
    const bidirectional = connections.filter(c => 
      (c.from === elementId || c.to === elementId) && c.direction === 'bidirectional'
    );
    
    return { incoming, outgoing, bidirectional, all: connections.filter(c => c.from === elementId || c.to === elementId) };
  },

  startConnecting: (elementId) => {
    set({ isConnecting: true, connectingFrom: elementId });
  },

  finishConnecting: (elementId, direction = 'outgoing', type = 'collaborates') => {
    const { connectingFrom } = get();
    if (connectingFrom && elementId && connectingFrom !== elementId) {
      get().addConnection(connectingFrom, elementId, direction, type);
    }
    set({ isConnecting: false, connectingFrom: null });
  },

  cancelConnecting: () => {
    set({ isConnecting: false, connectingFrom: null });
  },

  // === VIEWPORT ===

  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(3, zoom)) }),

  // Auto-fit all visible elements to viewport
  fitToView: (viewportWidth, viewportHeight) => {
    const { elements, currentViewId } = get();
    
    // Get visible elements for current level
    const visibleElements = currentViewId === null
      ? elements.filter(e => !e.parentId)
      : elements.filter(e => e.parentId === currentViewId);
    
    if (visibleElements.length === 0) {
      set({ pan: { x: 0, y: 0 }, zoom: 1 });
      return;
    }
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    visibleElements.forEach(el => {
      const x = el.position?.x || 0;
      const y = el.position?.y || 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + ELEMENT_SIZE);
      maxY = Math.max(maxY, y + ELEMENT_SIZE);
    });
    
    // Calculate bounds dimensions
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    
    // Calculate center of bounds
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calculate zoom to fit with padding
    const availableWidth = viewportWidth - VIEW_PADDING * 2;
    const availableHeight = viewportHeight - VIEW_PADDING * 2;
    
    const scaleX = boundsWidth > 0 ? availableWidth / boundsWidth : 1;
    const scaleY = boundsHeight > 0 ? availableHeight / boundsHeight : 1;
    
    // Use the smaller scale to fit everything, but cap between 0.3 and 1.5
    const newZoom = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));
    
    // Pan to center the content
    const newPan = {
      x: -centerX,
      y: -centerY
    };
    
    set({ pan: newPan, zoom: newZoom });
  },

  // Auto-layout elements in a grid pattern to prevent overlaps
  autoLayoutElements: (viewportWidth, viewportHeight) => {
    const { elements, currentViewId, updateElement } = get();
    
    // Get visible elements for current level
    const visibleElements = currentViewId === null
      ? elements.filter(e => !e.parentId)
      : elements.filter(e => e.parentId === currentViewId);
    
    if (visibleElements.length === 0) return;
    
    // Calculate grid layout
    const count = visibleElements.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    
    // Calculate cell size
    const cellWidth = ELEMENT_SIZE + ELEMENT_GAP;
    const cellHeight = ELEMENT_SIZE + ELEMENT_GAP;
    
    // Calculate total grid size
    const gridWidth = cols * cellWidth - ELEMENT_GAP;
    const gridHeight = rows * cellHeight - ELEMENT_GAP;
    
    // Starting position (centered around origin)
    const startX = -gridWidth / 2;
    const startY = -gridHeight / 2;
    
    // Position each element
    visibleElements.forEach((el, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const newPosition = {
        x: startX + col * cellWidth,
        y: startY + row * cellHeight
      };
      
      // Only update if position changed significantly
      const dx = Math.abs((el.position?.x || 0) - newPosition.x);
      const dy = Math.abs((el.position?.y || 0) - newPosition.y);
      
      if (dx > 5 || dy > 5) {
        set((state) => ({
          elements: state.elements.map(e =>
            e.id === el.id ? { ...e, position: newPosition } : e
          )
        }));
      }
    });
    
    // Fit to view after layout
    get().fitToView(viewportWidth, viewportHeight);
    get().triggerAutoSave();
  },

  // Check if elements need auto-layout (overlapping or out of bounds)
  needsAutoLayout: () => {
    const { elements, currentViewId } = get();
    
    const visibleElements = currentViewId === null
      ? elements.filter(e => !e.parentId)
      : elements.filter(e => e.parentId === currentViewId);
    
    if (visibleElements.length <= 1) return false;
    
    // Check for overlaps
    for (let i = 0; i < visibleElements.length; i++) {
      for (let j = i + 1; j < visibleElements.length; j++) {
        const el1 = visibleElements[i];
        const el2 = visibleElements[j];
        
        const x1 = el1.position?.x || 0;
        const y1 = el1.position?.y || 0;
        const x2 = el2.position?.x || 0;
        const y2 = el2.position?.y || 0;
        
        // Check if elements overlap
        if (Math.abs(x1 - x2) < ELEMENT_SIZE && Math.abs(y1 - y2) < ELEMENT_SIZE) {
          return true;
        }
      }
    }
    
    // Check if all elements are at origin (new elements)
    const allAtOrigin = visibleElements.every(el => 
      (el.position?.x || 0) === 0 && (el.position?.y || 0) === 0
    );
    
    return allAtOrigin && visibleElements.length > 1;
  },

  clearSelection: () => {
    set({ selectedElementId: null, selectedConnectionId: null });
  },

  // Switch between 2D and 3D view
  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  clearAll: () => {
    set({
      elements: [],
      connections: [],
      selectedElementId: null,
      selectedConnectionId: null,
      currentViewId: null,
      viewHistory: [],
      isSaving: false,
      isLoading: false,
      lastSaved: null,
      hasUnsavedChanges: false
    });
  },

  // Set elements (for AI generation, import, etc.)
  setElements: (elements) => {
    set({ elements, selectedElementId: null });
  },

  // Set connections (for AI generation, import, etc.)
  setConnections: (connections) => {
    set({ connections, selectedConnectionId: null });
  },

  // === СОХРАНЕНИЕ / ЗАГРУЗКА через Socket.IO ===

  // Пометить, что есть несохраненные изменения
  markUnsaved: () => {
    set({ hasUnsavedChanges: true });
  },

  // Сохранить блок-схему через Socket.IO
  saveFlowchart: async () => {
    const { elements, connections, currentViewId, viewHistory, pan, zoom } = get();
    
    set({ isSaving: true });
    
    try {
      const result = await socketService.saveFlowchart({
        elements,
        connections,
        viewState: {
          currentViewId,
          viewHistory,
          pan,
          zoom
        }
      });
      
      if (result.success) {
        set({ 
          isSaving: false, 
          lastSaved: result.flowchart?.updatedAt ? new Date(result.flowchart.updatedAt) : new Date(),
          hasUnsavedChanges: false
        });
        return { success: true };
      } else {
        set({ isSaving: false });
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      set({ isSaving: false });
      return { success: false, error: error.message };
    }
  },

  // Загрузить блок-схему через Socket.IO
  loadFlowchart: async () => {
    set({ isLoading: true });
    
    try {
      const result = await socketService.loadFlowchart();
      
      if (result.success && result.hasData && result.flowchart) {
        const { elements, connections, viewState, updatedAt } = result.flowchart;
        
        set({
          elements: elements || [],
          connections: connections || [],
          currentViewId: viewState?.currentViewId || null,
          viewHistory: viewState?.viewHistory || [],
          pan: viewState?.pan || { x: 0, y: 0 },
          zoom: viewState?.zoom || 1,
          isLoading: false,
          lastSaved: updatedAt ? new Date(updatedAt) : null,
          hasUnsavedChanges: false,
          selectedElementId: null,
          selectedConnectionId: null
        });
        
        return { success: true, hasData: true };
      } else {
        set({ isLoading: false });
        return { success: true, hasData: false };
      }
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      set({ isLoading: false });
      return { success: false, error: error.message };
    }
  }
}));
