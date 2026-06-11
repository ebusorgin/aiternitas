import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';

// Мокаем fetch
global.fetch = vi.fn();

// Мокаем socketService
vi.mock('../services/socket', () => ({
  default: {
    connect: vi.fn(() => Promise.resolve()),
    checkAuth: vi.fn(() => Promise.resolve({ authenticated: false })),
    on: vi.fn(() => vi.fn()),
    disconnect: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    isConnected: false,
    isAuthenticated: false
  }
}));

// Тестовый компонент
const TestComponent = () => {
  const { user, loading, login, logout, checkAuth } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <button onClick={() => login('test@example.com', 'password')}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={checkAuth}>Check Auth</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetch.mockClear();
  });

  describe('Initial state', () => {
    it('should start with loading state', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });

    it('should check auth on mount', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
      });
    });
  });

  describe('Login', () => {
    it('should login successfully', async () => {
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test' };
      
      fetch
        .mockResolvedValueOnce({ ok: false, status: 401 }) // initial check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, user: mockUser })
        }); // login

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('not-loading'));

      await act(async () => {
        await userEvent.click(screen.getByText('Login'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });
    });

    it('should handle login failure', async () => {
      fetch
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Invalid credentials' })
        });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('not-loading'));

      await act(async () => {
        await userEvent.click(screen.getByText('Login'));
      });

      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });
  });

  describe('Logout', () => {
    it('should logout successfully', async () => {
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test' };
      
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: mockUser })
        })
        .mockResolvedValueOnce({ ok: true }); // logout

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      await act(async () => {
        await userEvent.click(screen.getByText('Logout'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      });
    });
  });

  describe('Session persistence', () => {
    it('should restore session on page reload', async () => {
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser })
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      // Проверяем что запрос был с credentials
      expect(fetch).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
    });

    it('should handle 401 on session check', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      });
    });
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      const ConsoleError = console.error;
      console.error = vi.fn();

      const InvalidComponent = () => {
        useAuth();
        return null;
      };

      expect(() => render(<InvalidComponent />)).toThrow('useAuth must be used within AuthProvider');

      console.error = ConsoleError;
    });
  });
});
