// Central Socket.IO handler
// Combines auth and flowchart handlers with session middleware

import { setupAuthHandlers, activeSessions, userRooms } from './auth.mjs';
import { setupFlowchartHandlers } from './flowchart.mjs';
import { setupTaskHandlers } from './tasks.mjs';
import { setupSandboxHandlers } from './sandbox.mjs';
import pool from '../db.mjs';

export function setupSocketHandlers(io, sessionStore) {
  console.log('🔌 Initializing Socket.IO handlers...');

  // Middleware: try to restore HTTP session on connection
  io.use(async (socket, next) => {
    try {
      // Try to restore session from HTTP cookie
      const cookieHeader = socket.request?.headers?.cookie;
      
      if (cookieHeader) {
        const cookies = {};
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const value = parts.slice(1).join('=');
            cookies[name] = decodeURIComponent(value);
          }
        });

        let sessionId = cookies['aiternitas.sid'];
        
        if (sessionId) {
          // Clean session ID
          try {
            sessionId = decodeURIComponent(sessionId);
          } catch (e) {}
          
          if (sessionId.startsWith('s:')) {
            sessionId = sessionId.substring(2);
          }
          
          if (sessionId.includes('.')) {
            sessionId = sessionId.split('.')[0];
          }

          // Try to get session from store
          const session = await getSessionFromStore(sessionStore, sessionId);
          
          if (session && session.userId) {
            // Verify user exists
            const result = await pool.query(
              'SELECT id, name, email FROM users WHERE id = $1',
              [session.userId]
            );

            if (result.rows.length > 0) {
              const user = result.rows[0];
              socket.userId = user.id;
              socket.userName = user.name;
              socket.userEmail = user.email;
              socket.httpSessionId = sessionId;
              console.log(`✅ Socket.IO: restored HTTP session for user ${user.email} (id: ${user.id})`);
            }
          }
        }
      }

      next();
    } catch (error) {
      console.error('Socket.IO middleware error:', error);
      next();
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`🔌 Socket.IO connected: ${socket.id} (user: ${socket.userId || 'anonymous'})`);

    // Join user room if authenticated
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      
      if (!userRooms.has(socket.userId)) {
        userRooms.set(socket.userId, new Set());
      }
      userRooms.get(socket.userId).add(socket.id);

      // Store session
      activeSessions.set(socket.id, {
        sessionId: socket.httpSessionId || `socket_${socket.id}`,
        userId: socket.userId,
        userName: socket.userName,
        userEmail: socket.userEmail
      });
    }

    // Setup handlers
    setupAuthHandlers(io, socket, sessionStore);
    setupFlowchartHandlers(io, socket);
    setupTaskHandlers(io, socket);
    setupSandboxHandlers(io, socket);

    // Ping/pong for connection health
    socket.on('ping', (data, callback) => {
      const responder = typeof data === 'function' ? data : callback;
      responder?.({ pong: true, timestamp: Date.now() });
    });

    // Get connection status
    socket.on('status', (data, callback) => {
      const responder = typeof data === 'function' ? data : callback;
      responder?.({
        connected: true,
        authenticated: !!socket.userId,
        userId: socket.userId || null,
        userName: socket.userName || null,
        socketId: socket.id
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket.IO disconnected: ${socket.id} (user: ${socket.userId || 'anonymous'}, reason: ${reason})`);
      
      // Cleanup is handled in auth.mjs
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket.IO error for ${socket.id}:`, error);
    });
  });

  console.log('✅ Socket.IO handlers initialized');
}

// Helper: get session from session store
function getSessionFromStore(sessionStore, sessionId) {
  return new Promise((resolve) => {
    if (!sessionStore || !sessionStore.get) {
      // Fallback: direct DB query
      pool.query(
        'SELECT sess FROM session WHERE sid = $1 AND expire > NOW()',
        [sessionId]
      ).then(result => {
        if (result.rows.length === 0) {
          return resolve(null);
        }
        const sessionData = result.rows[0].sess;
        const session = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
        resolve(session);
      }).catch(() => resolve(null));
      return;
    }

    sessionStore.get(sessionId, (err, session) => {
      if (err || !session) {
        resolve(null);
      } else {
        resolve(session);
      }
    });
  });
}

export default { setupSocketHandlers };


