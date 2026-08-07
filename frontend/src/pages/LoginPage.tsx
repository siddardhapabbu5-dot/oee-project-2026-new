import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { type ApiResponse } from '../lib/api';
import { useAuthStore, type AuthUser } from '../store';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@pms.local');
  const [password, setPassword] = useState('Password@123');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<ApiResponse<{ token: string; user: AuthUser }>>('/auth/login', { email, password });
      setSession(res.data.data.token, res.data.data.user);
      toast.success('Welcome back');
      navigate('/home');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="login-screen__bg absolute inset-0"
        style={{
          backgroundImage: 'url(/login-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgba(12, 40, 58, 0.28) 0%, rgba(20, 55, 72, 0.12) 45%, rgba(8, 28, 42, 0.35) 100%)',
        }}
        aria-hidden
      />

      <form
        onSubmit={onSubmit}
        className="login-glass relative z-10 w-full max-w-[380px] px-9 py-10"
        style={{ animation: 'loginRise 700ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <div className="mb-8 text-center">
          <img
            src="/nakshatra-logo.png"
            alt="Nakshatra Beverages"
            className="login-logo mx-auto mb-5 h-16 w-auto object-contain sm:h-[4.5rem]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div
            className="login-brand text-[0.8rem] font-semibold uppercase tracking-[0.28em] sm:text-[0.88rem] sm:tracking-[0.32em]"
            style={{ fontFamily: '"Outfit", var(--font-sans)' }}
          >
            Nakshatra Beverages
          </div>
        </div>

        <label className="login-field mb-6 block">
          <span className="login-label mb-2 block text-sm">Username</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="login-underline"
            placeholder="email@company.com"
          />
        </label>

        <label className="login-field mb-5 block">
          <span className="login-label mb-2 block text-sm">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="login-underline"
            placeholder="••••••••"
          />
        </label>

        <div className="login-meta mb-7 flex items-center justify-between gap-3 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="login-check"
            />
            Remember me
          </label>
          <button
            type="button"
            className="login-link underline-offset-2 hover:underline"
            onClick={() => toast('Contact your admin to reset the password.')}
          >
            Forgot Password?
          </button>
        </div>

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Signing in…' : 'Login'}
        </button>

        <div className="login-footer mt-7 text-center text-sm">
          <button type="button" className="login-link" onClick={() => setShowDemo((v) => !v)}>
            {showDemo ? 'Hide demo users' : 'Need a demo account? Show users'}
          </button>
          {showDemo ? (
            <div className="login-demo mt-3 rounded-xl px-3 py-2 text-left text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              Password: Password@123
              <div className="mt-1 space-y-0.5">
                <div>admin@pms.local</div>
                <div>manager@pms.local</div>
                <div>haresh@pms.local</div>
                <div>bhalu@pms.local</div>
              </div>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
