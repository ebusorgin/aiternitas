import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import socketService from '../services/socket';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  // Initialize socket connection and check auth
  useEffect(() => {
    const initSocket = async () => {
      setLoading(true);
      
      try {
        // Connect to socket
        await socketService.connect();
        setSocketConnected(true);
        
        // Check authentication status
        const result = await socketService.checkAuth();
        
        if (result.authenticated && result.user) {
          setUser(result.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Socket init error:', error);
        setSocketConnected(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initSocket();

    // Handle reconnection
    const unsubReconnect = socketService.on('reconnected:authenticated', (user) => {
      setUser(user);
      setSocketConnected(true);
    });

    const unsubReconnectAnon = socketService.on('reconnected:anonymous', () => {
      setUser(null);
      setSocketConnected(true);
    });

    const unsubDisconnect = socketService.on('disconnected', () => {
      setSocketConnected(false);
    });

    return () => {
      unsubReconnect();
      unsubReconnectAnon();
      unsubDisconnect();
    };
  }, []);

  const checkAuth = useCallback(async () => {
    if (!socketService.isConnected) {
      try {
        await socketService.connect();
        setSocketConnected(true);
      } catch (error) {
        console.error('Socket connect error:', error);
        return;
      }
    }

    setLoading(true);
    try {
      const result = await socketService.checkAuth();
      
      if (result.authenticated && result.user) {
        setUser(result.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    if (!socketService.isConnected) {
      try {
        await socketService.connect();
        setSocketConnected(true);
      } catch (error) {
        return { success: false, error: 'Ошибка подключения к серверу' };
      }
    }

    try {
      const result = await socketService.login(email, password);
      
      if (result.success && result.user) {
        setUser(result.user);
        return { success: true };
      } else {
        return { 
          success: false, 
          error: result.error || 'Ошибка входа',
          emailVerificationRequired: result.emailVerificationRequired || false
        };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Ошибка подключения к серверу' };
    }
  }, []);

  const register = useCallback(async (name, email, password) => {
    if (!socketService.isConnected) {
      try {
        await socketService.connect();
        setSocketConnected(true);
      } catch (error) {
        return { success: false, error: 'Ошибка подключения к серверу' };
      }
    }

    try {
      const result = await socketService.register(name, email, password);
      
      if (result.success && result.user) {
        setUser(result.user);
        return { 
          success: true,
          emailVerificationRequired: result.emailVerificationRequired || false
        };
      } else {
        return { success: false, error: result.error || 'Ошибка регистрации' };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Ошибка подключения к серверу' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await socketService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      // Clear user anyway
      setUser(null);
    }
  }, []);

  // Google OAuth still uses HTTP redirect
  const loginWithGoogle = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/google', {
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.authUrl) {
        window.location.href = data.authUrl;
        return { success: true };
      } else {
        return { success: false, error: 'Ошибка получения URL авторизации Google' };
      }
    } catch (error) {
      return { success: false, error: 'Ошибка подключения к серверу' };
    }
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
  }, []);

  const updateName = useCallback(async (name) => {
    if (!socketService.isConnected) {
      return { success: false, error: 'Нет соединения с сервером' };
    }

    try {
      const result = await socketService.updateName(name);
      
      if (result.success && result.user) {
        setUser(result.user);
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message || 'Ошибка обновления имени' };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      socketConnected,
      login, 
      register, 
      logout, 
      updateUser, 
      updateName,
      checkAuth, 
      loginWithGoogle 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
