import {mount} from 'svelte';
import App from './App.svelte';

// Manual initialization of Svelte DOM operations
// This fixes the "Cannot read properties of undefined (reading 'call')" error
// Svelte's init_operations() isn't being called due to tree-shaking
if (typeof window !== 'undefined') {
    // Access Svelte's internal runtime to initialize DOM helpers
    // These are defined as module-level variables that need initialization
    const nodeProto = Node.prototype;
    const firstChildDesc = Object.getOwnPropertyDescriptor(nodeProto, 'firstChild');
    const nextSiblingDesc = Object.getOwnPropertyDescriptor(nodeProto, 'nextSibling');

    // Force execution of property getters to trigger Svelte's lazy initialization
    if (firstChildDesc?.get && nextSiblingDesc?.get) {
        const tempDiv = document.createElement('div');
        tempDiv.firstChild; // Triggers getter
        tempDiv.nextSibling; // Triggers getter
    }
}

const debugEl = document.getElementById('debug');

function log(msg: string) {
    console.log('[Svelte DevTools Panel]', msg);
    if (debugEl) {
        debugEl.style.display = 'block';
        debugEl.innerHTML += msg + '<br>';
    }
}

log('Panel script starting...');

if (typeof chrome === 'undefined' || !chrome.devtools) {
    log('ERROR: chrome.devtools not available');
} else {
    log('chrome.devtools available, tabId: ' + (chrome.devtools.inspectedWindow?.tabId || 'unknown'));
}

// Wait for DOM to be ready before mounting
function initializeApp() {
    const appElement = document.getElementById('app');
    if (!appElement) {
        log('ERROR: #app element not found');
        return;
    }

    const app = mount(App, {
        target: appElement
    });

    log('App mounted');

    return app;
}

// Execute immediately if DOM is already loaded, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
