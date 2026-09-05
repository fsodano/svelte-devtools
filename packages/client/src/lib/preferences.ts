/** Appearance preferences apply before the panel mounts, including on reload. */
export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  scale: number;
  reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', scale: 1, reduceMotion: false };
export const UI_SCALES = [0.8, 0.9, 1, 1.15, 1.3];
const keys = { theme: 'svelte-devtools-theme', scale: 'svelte-devtools-scale', reduceMotion: 'svelte-devtools-reduce-motion' };

export function readPreferences(): Preferences {
  try {
    const theme = localStorage.getItem(keys.theme);
    const scale = Number(localStorage.getItem(keys.scale));
    return {
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      scale: UI_SCALES.includes(scale) ? scale : 1,
      reduceMotion: localStorage.getItem(keys.reduceMotion) === 'true',
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  if (preferences.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = preferences.theme;
  root.style.colorScheme = preferences.theme === 'system' ? 'light dark' : preferences.theme;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
  // The UI uses pixel dimensions. Zoom scales text and controls together without clipping them.
  root.style.setProperty('zoom', String(preferences.scale));
  root.style.setProperty('--devtools-ui-scale', String(preferences.scale));
  root.style.removeProperty('font-size');
}

/** Returns false when the browser blocks persistent storage. Changes still apply. */
export function savePreferences(preferences: Preferences): boolean {
  applyPreferences(preferences);
  try {
    localStorage.setItem(keys.theme, preferences.theme);
    localStorage.setItem(keys.scale, String(preferences.scale));
    localStorage.setItem(keys.reduceMotion, String(preferences.reduceMotion));
    return true;
  } catch {
    return false;
  }
}

export function resetPreferences(): boolean {
  applyPreferences(DEFAULT_PREFERENCES);
  try {
    for (const key of Object.values(keys)) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
