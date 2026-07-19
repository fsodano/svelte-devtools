import {mount} from 'svelte';
import App from './App.svelte';

const debugEl = document.getElementById('debug');
const isDebug = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_DEBUG__;

function log(msg: string) {
	if (isDebug) console.log('[Svelte DevTools Panel]', msg);
	if (debugEl) {
		debugEl.style.display = 'block';
		debugEl.innerHTML += msg + '<br>';
	}
}

log('Panel script starting...');

function initializeApp() {
	const appElement = document.getElementById('app');
	if (!appElement) {
		log('ERROR: #app element not found');
		return;
	}

	mount(App, {
		target: appElement,
	});

	log('App mounted');
}

// Execute immediately if DOM is already loaded, otherwise wait
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeApp);
} else {
	initializeApp();
}
