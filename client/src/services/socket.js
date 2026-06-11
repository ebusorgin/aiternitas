// Socket.IO client singleton
// Manages connection, authentication, and event handling

import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.userId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.eventHandlers = new Map();
    this.pendingCallbacks = new Map();
    this.connectPromise = null;
    this._listenersAttached = false; // Защита от дублирования слушателей
    this._forwardingAttached = false; // Защита от повторной регистрации forwarding
  }

  // Connect to server
  connect() {
    if (this.socket?.connected) {
      return Promise.resolve(true);
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        if (!this.socket) {
          // Determine the correct URL for connecting
          let socketUrl;
          const isDev = window.location.hostname === 'localhost';
          
          // In development (Vite dev server on 3000): connect to Gateway on 3001
          // In production: use same origin
          if (isDev && window.location.port === '3000') {
            // Development: Gateway is on port 3001
            socketUrl = 'http://localhost:3001';
            console.log('[Socket] Dev mode: connecting to Gateway on 3001');
          } else {
            // Production: use current origin
            socketUrl = window.location.origin;
            console.log('[Socket] Production mode: using origin', socketUrl);
          }

          console.log('[Socket] Connecting to:', socketUrl);

          this.socket = io(socketUrl, {
            path: '/socket.io/',
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000
          });

          this.socket.on('connect', () => {
            console.log('🔌 Socket.IO connected');
            this.connected = true;
            this.reconnectAttempts = 0;
            this.connectPromise = null;
            resolve(true);
          });

          this.socket.on('disconnect', (reason) => {
            console.log('🔌 Socket.IO disconnected:', reason);
            this.connected = false;
            this.authenticated = false;
            this.connectPromise = null;
            this.emitLocal('disconnected', { reason });
          });

          this.socket.on('connect_error', (error) => {
            console.error('🔌 Socket.IO connection error:', error.message);
            this.reconnectAttempts++;
            this.connectPromise = null;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              reject(error);
            }
          });

          this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔌 Socket.IO reconnected after', attemptNumber, 'attempts');
            this.connected = true;

            this.checkAuth().then(result => {
              if (result.authenticated) {
                this.emitLocal('reconnected:authenticated', result.user);
              } else {
                this.emitLocal('reconnected:anonymous', {});
              }
            });
          });

          // Обработка ситуации, когда все попытки переподключения провалились
          this.socket.on('reconnect_failed', () => {
            console.warn('🔌 Socket.IO reconnect_failed — все попытки исчерпаны, пересоздаём подключение');
            this.connected = false;
            this.connectPromise = null;
            // Пересоздаём сокет заново
            this.socket?.removeAllListeners();
            this.socket = null;
            this._listenersAttached = false;
            this._forwardingAttached = false;
            // Пытаемся подключиться снова
            this.connect().catch(err => {
              console.error('🔌 Socket.IO full reconnect failed:', err.message);
            });
          });

          this.setupEventForwarding();
        } else {
          this.socket.connect();
        }

      } catch (error) {
        console.error('Socket.IO init error:', error);
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.userId = null;
    this._forwardingAttached = false;
    this._listenersAttached = false;
  }

  // Emit event with promise-based callback
  emit(event, data = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const performEmit = () => {
        if (!this.socket?.connected) {
          return reject(new Error('Socket not connected'));
        }

        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for response to ${event}`));
        }, timeoutMs);

        this.socket.emit(event, data, (response) => {
          clearTimeout(timeout);
          if (response?.error && !response?.success) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      };

      if (!this.socket?.connected) {
        this.connect()
          .then(() => performEmit())
          .catch(reject);
        return;
      }

      performEmit();
    });
  }

  // Listen for event
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);

    // Also register with socket if connected
    if (this.socket) {
      this.socket.on(event, handler);
    }

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  // Remove event listener
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).delete(handler);
    }
    if (this.socket) {
      this.socket.off(event, handler);
    }
  }

  // Emit local event (for internal use)
  emitLocal(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => handler(data));
    }
  }

  // Setup event forwarding for common events
  setupEventForwarding() {
    if (this._forwardingAttached) return; // Защита от повторной регистрации
    this._forwardingAttached = true;

    // Flowchart events
    const flowchartEvents = [
      'flowchart:element:created',
      'flowchart:element:updated',
      'flowchart:element:moved',
      'flowchart:element:deleted',
      'flowchart:element:nested',
      'flowchart:element:unnested',
      'flowchart:connection:created',
      'flowchart:connection:updated',
      'flowchart:connection:deleted',
      'flowchart:view:updated',
      'flowchart:navigated:into',
      'flowchart:navigated:up',
      'flowchart:navigated:root',
      'flowchart:saved',
      'flowchart:generated',
      'flowchart:generate-progress',
      'flowchart:clarification-needed',
      'flowchart:generate-steps-plan'
    ];

    flowchartEvents.forEach(event => {
      this.socket.on(event, (data) => {
        // Forward to registered handlers
        if (this.eventHandlers.has(event)) {
          this.eventHandlers.get(event).forEach(handler => handler(data));
        }
      });
    });
  }

  // === AUTH METHODS ===

  // Check auth status
  async checkAuth() {
    try {
      const response = await this.emit('auth:check', {}, 3000);
      
      if (response && response.authenticated) {
        this.authenticated = true;
        this.userId = response.user.id;
      } else {
        this.authenticated = false;
        this.userId = null;
      }
      
      return response;
    } catch (error) {
      console.warn('Auth check failed (possibly timeout):', error.message);
      this.authenticated = false;
      this.userId = null;
      return { authenticated: false, error: error.message };
    }
  }

  // Login/register: use HTTP only (fetch /api/auth/login, /api/auth/register). Socket only restores session from cookie.

  // Logout
  async logout() {
    try {
      await this.emit('auth:logout', {});
      this.authenticated = false;
      this.userId = null;
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local state anyway
      this.authenticated = false;
      this.userId = null;
      return { success: false, error: error.message };
    }
  }

  // Update name
  async updateName(name) {
    try {
      return await this.emit('auth:update-name', { name });
    } catch (error) {
      console.error('Update name error:', error);
      return { success: false, error: error.message };
    }
  }

  // === FLOWCHART METHODS ===

  // Load flowchart
  async loadFlowchart() {
    try {
      return await this.emit('flowchart:load', {});
    } catch (error) {
      console.error('Load flowchart error:', error);
      return { success: false, error: error.message };
    }
  }

  // Save flowchart
  async saveFlowchart(data) {
    try {
      return await this.emit('flowchart:save', data);
    } catch (error) {
      console.error('Save flowchart error:', error);
      return { success: false, error: error.message };
    }
  }

  // Element operations
  async createElement(element) {
    try {
      return await this.emit('flowchart:element:create', { element });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateElement(id, updates) {
    try {
      return await this.emit('flowchart:element:update', { id, updates });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async moveElement(id, position) {
    try {
      return await this.emit('flowchart:element:move', { id, position });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteElement(id) {
    try {
      return await this.emit('flowchart:element:delete', { id });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async nestElement(childId, parentId) {
    try {
      return await this.emit('flowchart:element:nest', { childId, parentId });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async unnestElement(id, newPosition) {
    try {
      return await this.emit('flowchart:element:unnest', { id, newPosition });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Connection operations
  async createConnection(connection) {
    try {
      return await this.emit('flowchart:connection:create', { connection });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateConnection(id, updates) {
    try {
      return await this.emit('flowchart:connection:update', { id, updates });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteConnection(id) {
    try {
      return await this.emit('flowchart:connection:delete', { id });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Navigation
  async navigateInto(elementId) {
    try {
      return await this.emit('flowchart:navigate:into', { elementId });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async navigateUp() {
    try {
      return await this.emit('flowchart:navigate:up', {});
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async navigateToRoot() {
    try {
      return await this.emit('flowchart:navigate:root', {});
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Generate company using AI (longer timeout for multi-step GPT)
  async generateCompany(name, description) {
    try {
      // 5 minute timeout for 7-step AI generation
      return await this.emit('flowchart:generate-company', { name, description }, 300000);
    } catch (error) {
      console.error('Generate company error:', error);
      return { success: false, error: error.message };
    }
  }

  // Ответ на уточнение по ходу генерации (всплывающее окно)
  sendClarificationResponse(clarificationId, choice, customText = '') {
    if (this.socket?.connected) {
      this.socket.emit('flowchart:clarification-response', { clarificationId, choice, customText: customText || '' });
    }
  }

  // Остановить процесс генерации компании
  sendAbortGeneration() {
    if (this.socket?.connected) {
      this.socket.emit('flowchart:generate-abort');
    }
  }

  // Sync
  async requestSync() {
    try {
      return await this.emit('flowchart:sync:request', {});
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Fire-and-forget emit (no ACK expected, for pub/sub style events like sandbox:*)
  send(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data || {});
    } else {
      console.warn('[socket] send() called but not connected:', event);
    }
  }

  // Getters
  get isConnected() {
    return this.connected && this.socket?.connected;
  }

  get isAuthenticated() {
    return this.authenticated;
  }

  get currentUserId() {
    return this.userId;
  }
}

// Singleton instance
const socketService = new SocketService();

export default socketService;
