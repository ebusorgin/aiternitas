import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { apiCallJson } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  // Сессия установлена через HTTP (cookie) — сокет не может её сбросить
  const httpSessionRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
         // Сначала проверяем сессию по HTTP (cookie) — так надёжно и на проде, и после перезагрузки
         const meRes = await apiCallJson('/api/auth/me');
         if (meRes && meRes.user) {
           setUser(meRes.user);
           httpSessionRef.current = true;
         }

        await socketService.connect();
        setSocketConnected(true);

        const result = await socketService.checkAuth();
        if (result.authenticated && result.user) {
          setUser(result.user);
          httpSessionRef.current = true;
        } else if (!httpSessionRef.current) {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth init error:', error);
        setSocketConnected(false);
        if (!httpSessionRef.current) setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();

    const unsubReconnect = socketService.on('reconnected:authenticated', (user) => {
      setUser(user);
      httpSessionRef.current = true;
      setSocketConnected(true);
    });

    const unsubReconnectAnon = socketService.on('reconnected:anonymous', () => {
      if (!httpSessionRef.current) setUser(null);
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
    try {
      const data = await apiCallJson('/api/auth/me');
      if (data && data.user) {
        setUser(data.user);
        httpSessionRef.current = true;
        setLoading(false);
        return;
      }
    } catch (e) {
      console.error('Auth check (HTTP) error:', e);
    }

    if (!socketService.isConnected) {
      try {
        await socketService.connect();
        setSocketConnected(true);
      } catch (error) {
        console.error('Socket connect error:', error);
        if (!httpSessionRef.current) setUser(null);
        return;
      }
    }

    setLoading(true);
    try {
      const result = await socketService.checkAuth();
      if (result.authenticated && result.user) {
        setUser(result.user);
        httpSessionRef.current = true;
      } else if (!httpSessionRef.current) {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      if (!httpSessionRef.current) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const result = await apiCallJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      
      if (result.success && result.user) {
        setUser(result.user);
        httpSessionRef.current = true;
        socketService.disconnect();
        await new Promise((r) => setTimeout(r, 150));
        await socketService.connect();
        return { success: true };
      } else {
        return { 
          success: false, 
          error: result.error || 'Ошибка входа',
          emailVerificationRequired: result.emailVerificationRequired || false
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Ошибка подключения к серверу' };
    }
  }, []);

  const register = useCallback(async (name, email, password) => {
    try {
      const result = await apiCallJson('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      
      if (result.success && result.user) {
        setUser(result.user);
        httpSessionRef.current = true;
        socketService.disconnect();
        await new Promise((r) => setTimeout(r, 150));
        await socketService.connect();
        return { 
          success: true,
          emailVerificationRequired: result.emailVerificationRequired || false,
          message: result.message,
          emailSendFailed: result.emailSendFailed || false,
          emailSendError: result.emailSendError
        };
      } else {
        return { success: false, error: result.error || 'Ошибка регистрации' };
      }
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'Ошибка подключения к серверу' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiCallJson('/api/auth/logout', { method: 'POST' });
      httpSessionRef.current = false;
      await socketService.logout();
      setUser(null);
      socketService.disconnect();
      await socketService.connect();
    } catch (error) {
      console.error('Logout error:', error);
      httpSessionRef.current = false;
      setUser(null);
      socketService.disconnect();
    }
  }, []);

  // Google OAuth still uses HTTP redirect
  const loginWithGoogle = useCallback(async () => {
    try {
      const data = await apiCallJson('/api/auth/google');

      if (data && data.authUrl) {
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
