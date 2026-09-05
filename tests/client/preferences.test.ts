import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPreferences, DEFAULT_PREFERENCES, readPreferences, resetPreferences, savePreferences } from '../../packages/client/src/lib/preferences';

beforeEach(() => { vi.stubGlobal('localStorage', new Storage()); localStorage.clear(); document.documentElement.removeAttribute('style'); document.documentElement.removeAttribute('data-theme'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('panel appearance preferences', () => {
  it('restores saved appearance before the Settings panel is opened', () => {
    savePreferences({ theme: 'dark', scale: 1.3, reduceMotion: true });
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
    applyPreferences(readPreferences());
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.3');
    expect(document.documentElement.style.getPropertyValue('--devtools-ui-scale')).toBe('1.3');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('resets immediately without clearing unrelated DevTools data', () => {
    localStorage.setItem('svelte-devtools-snapshots', 'keep');
    savePreferences({ theme: 'light', scale: 0.8, reduceMotion: true });
    expect(resetPreferences()).toBe(true);
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.reduceMotion).toBe('false');
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1');
    expect(localStorage.getItem('svelte-devtools-snapshots')).toBe('keep');
  });

  it('recovers from invalid saved values', () => {
    localStorage.setItem('svelte-devtools-theme', 'invalid');
    localStorage.setItem('svelte-devtools-scale', '-20');
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    localStorage.setItem('svelte-devtools-scale', 'NaN');
    expect(readPreferences().scale).toBe(1);
  });

  it('still applies settings when persistent storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    expect(savePreferences({ theme: 'light', scale: 1.15, reduceMotion: true })).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.15');
  });
});
