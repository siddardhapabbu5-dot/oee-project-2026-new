import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store';

const TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours aligned with JWT default
const WARN_MS = TIMEOUT_MS - 5 * 60 * 1000;

/** Client-side session timeout aligned with backend JWT session policy */
export function useSessionTimeout() {
  const clearSession = useAuthStore((s) => s.clearSession);
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const warned = useRef(false);

  useEffect(() => {
    if (!token) return;

    const loginAt = Number(localStorage.getItem('pms_login_at') || Date.now());
    if (!localStorage.getItem('pms_login_at')) {
      localStorage.setItem('pms_login_at', String(loginAt));
    }

    const tick = () => {
      const age = Date.now() - loginAt;
      if (age >= TIMEOUT_MS) {
        clearSession();
        localStorage.removeItem('pms_login_at');
        toast.error('Session expired. Please sign in again.');
        navigate('/login');
        return;
      }
      if (!warned.current && age >= WARN_MS) {
        warned.current = true;
        toast('Session will expire in 5 minutes', { icon: '⏳' });
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [token, clearSession, navigate]);
}
