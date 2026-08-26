import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Monitor, Moon, Smartphone, Sun, UserRound } from 'lucide-react';
import { useAuthStore, useThemeStore } from '../../store';
import { setUiMode } from '../lib/preferPhone';

export default function MobileMorePage() {
  const { user, clearSession } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallEvent(null);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function openDesktop() {
    setUiMode('desktop');
    navigate('/home');
  }

  function logout() {
    clearSession();
    navigate('/login');
  }

  const role = user?.role.replaceAll('_', ' ').toLowerCase();

  return (
    <div>
      <div className="phone-hello">
        <h2>More</h2>
        <p>Account, theme, and desktop site</p>
      </div>

      <div className="panel overflow-hidden">
        <div className="phone-more-row" style={{ cursor: 'default' }}>
          <span
            className="grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7367f0, #9e95f5)' }}
          >
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || 'U'}
          </span>
          <span className="grow">
            <strong className="block">
              {user?.firstName} {user?.lastName}
            </strong>
            <span className="text-xs capitalize" style={{ color: 'var(--muted)' }}>
              {role} · {user?.email}
            </span>
          </span>
        </div>
        <button type="button" className="phone-more-row" onClick={() => navigate('/profile')}>
          <UserRound size={18} />
          <span className="grow">Profile</span>
        </button>
        <button type="button" className="phone-more-row" onClick={toggle}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span className="grow">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button type="button" className="phone-more-row" onClick={openDesktop}>
          <Monitor size={18} />
          <span className="grow">Open desktop site</span>
        </button>
        <button type="button" className="phone-more-row" onClick={logout}>
          <LogOut size={18} />
          <span className="grow">Log out</span>
        </button>
      </div>

      <div className="panel phone-install">
        <div className="flex items-start gap-3">
          <Smartphone size={18} className="mt-0.5" />
          <div>
            <div className="font-semibold">Install on this phone</div>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {installed
                ? 'This app is already installed on your home screen.'
                : installEvent
                  ? 'Add Nakshatra Shop Floor to your home screen for one-tap access on the line.'
                  : 'On iPhone: Share → Add to Home Screen. On Android, use the browser menu to install the app.'}
            </p>
            {installEvent && !installed ? (
              <button type="button" className="phone-btn mt-3" onClick={() => void install()}>
                Install app
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
