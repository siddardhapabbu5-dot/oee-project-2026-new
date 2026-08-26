const UI_KEY = 'pms_ui';

export type UiMode = 'phone' | 'desktop';

export function getUiMode(): UiMode | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(UI_KEY);
  return value === 'phone' || value === 'desktop' ? value : null;
}

export function setUiMode(mode: UiMode) {
  localStorage.setItem(UI_KEY, mode);
}

export function isPhoneViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

export function shouldOpenPhoneApp() {
  const saved = getUiMode();
  if (saved) return saved === 'phone';
  return isPhoneViewport();
}

export function postLoginPath(search = typeof window !== 'undefined' ? window.location.search : '') {
  const next = new URLSearchParams(search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return shouldOpenPhoneApp() ? '/m' : '/home';
}
