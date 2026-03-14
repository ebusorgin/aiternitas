import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import socketService from '../services/socket';

const MailContext = createContext(null);

export function MailProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/mail/folders', { credentials: 'include' });
      if (res.status === 401) {
        setUnreadCount(0);
        return;
      }
      const data = await res.json();
      if (data.success && data.folders) {
        const inbox = data.folders.find((f) => f.id === 'inbox');
        const spam = data.folders.find((f) => f.id === 'spam');
        const trash = data.folders.find((f) => f.id === 'trash');
        const total = (inbox?.unread || 0) + (spam?.unread || 0) + (trash?.unread || 0);
        setUnreadCount(total);
      } else {
        setUnreadCount(0);
      }
    } catch {
      setUnreadCount(0);
    }
  }, [user]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    const playSound = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } catch {}
    };
    const unsub = socketService.on('mail:new', () => {
      refreshUnread();
      playSound();
    });
    return unsub;
  }, [refreshUnread]);

  return (
    <MailContext.Provider value={{ unreadCount, refreshUnread }}>
      {children}
    </MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  return ctx || { unreadCount: 0, refreshUnread: () => {} };
}
