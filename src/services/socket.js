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
    this.maxReconnectAttempts = 5;
    this.eventHandlers = new Map();
    this.pendingCallbacks = new Map();
  }

  // Connect to server
  connect() {
    if (this.socket?.connected) {
      return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
      try {
        // Get base URL for socket connection
        const baseUrl = window.location.origin;

        this.socket = io(baseUrl, {
          withCredentials: true,
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000
        });

        // Connection events
        this.socket.on('connect', () => {
          console.log('🔌 Socket.IO connected');
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve(true);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('🔌 Socket.IO disconnected:', reason);
          this.connected = false;
          this.authenticated = false;
          
          // Emit disconnect event to listeners
          this.emitLocal('disconnected', { reason });
        });

        this.socket.on('connect_error', (error) => {
          console.error('🔌 Socket.IO connection error:', error);
          this.reconnectAttempts++;
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(error);
          }
        });

        this.socket.on('reconnect', (attemptNumber) => {
          console.log('🔌 Socket.IO reconnected after', attemptNumber, 'attempts');
          this.connected = true;
          
          // Re-check auth after reconnect
          this.checkAuth().then(result => {
            if (result.authenticated) {
              this.emitLocal('reconnected:authenticated', result.user);
            } else {
              this.emitLocal('reconnected:anonymous', {});
            }
          });
        });

        // Setup global event forwarding
        this.setupEventForwarding();

      } catch (error) {
        console.error('Socket.IO init error:', error);
        reject(error);
      }
    });
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.userId = null;
  }

  // Emit event with promise-based callback
  emit(event, data = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
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
      'flowchart:generate-progress'
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
      const response = await this.emit('auth:check', {});
      
      if (response.authenticated) {
        this.authenticated = true;
        this.userId = response.user.id;
      } else {
        this.authenticated = false;
        this.userId = null;
      }
      
      return response;
    } catch (error) {
      console.error('Auth check error:', error);
      this.authenticated = false;
      this.userId = null;
      return { authenticated: false, error: error.message };
    }
  }

  // Login
  async login(email, password) {
    try {
      const response = await this.emit('auth:login', { email, password });
      
      if (response.success) {
        this.authenticated = true;
        this.userId = response.user.id;
      }
      
      return response;
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  // Register
  async register(name, email, password) {
    try {
      const response = await this.emit('auth:register', { name, email, password });
      
      if (response.success) {
        this.authenticated = true;
        this.userId = response.user.id;
      }
      
      return response;
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: error.message };
    }
  }

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

  // Sync
  async requestSync() {
    try {
      return await this.emit('flowchart:sync:request', {});
    } catch (error) {
      return { success: false, error: error.message };
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

