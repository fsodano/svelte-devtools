import './theme.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { devtoolsStore } from './lib/stores/devtools-store.svelte';

const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_DEBUG__;

if (isDebug) console.log('[Svelte DevTools] Starting...');

function init() {
  const target = document.getElementById('app');
  if (!target) {
    console.error('[Svelte DevTools] #app element not found!');
    return;
  }

  if (isDebug) console.log('[Svelte DevTools] Initializing store...');
  devtoolsStore.init();

  if (isDebug) console.log('[Svelte DevTools] Mounting app...');
  mount(App, { target });
  if (isDebug) console.log('[Svelte DevTools] Mounted successfully');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
