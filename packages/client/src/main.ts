import { mount } from 'svelte';
import App from './App.svelte';
import { devtoolsStore } from './lib/stores/devtools-store.svelte';

console.log('[Svelte DevTools] Starting...');

function init() {
  const target = document.getElementById('app');
  if (!target) {
    console.error('[Svelte DevTools] #app element not found!');
    return;
  }
  
  console.log('[Svelte DevTools] Initializing store...');
  devtoolsStore.init();
  
  console.log('[Svelte DevTools] Mounting app...');
  mount(App, { target });
  console.log('[Svelte DevTools] Mounted successfully');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
