/* ============================================================
   mhzaly — theme (Light / Dark / System), shared by shell & settings
   ============================================================ */

const KEY = 'mhzaly_theme';
const VALID = new Set(['light', 'dark', 'system']);

export function getThemeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return VALID.has(v) ? v : 'light';
  } catch { return 'light'; }
}

export function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

export function resolvedTheme(choice = getThemeChoice()) {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
}

export function applyTheme(choice = getThemeChoice()) {
  const resolved = resolvedTheme(choice);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = choice;
  return resolved;
}

export function setThemeChoice(choice) {
  const next = VALID.has(choice) ? choice : 'light';
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  return applyTheme(next);
}

/** Topbar button: flip between light and dark (system resolves to its opposite). */
export function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  return setThemeChoice(next);
}

/** Keep the app in sync when the OS theme changes while "System" is selected. */
export function watchSystemTheme(onChange) {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getThemeChoice() !== 'system') return;
      const resolved = applyTheme('system');
      if (typeof onChange === 'function') onChange(resolved);
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  } catch { /* ignore */ }
}
