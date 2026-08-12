/**
 * Opens a file in the user's editor via the Vite dev server.
 * Replaces the previous chrome.runtime.sendMessage pattern since
 * this extension runs as a Vite DevTools iframe, not a Chrome extension.
 */
import { apiFetch } from './api.js';

export async function openInEditor(
	filename: string,
	line?: number,
	column?: number,
): Promise<void> {
	try {
		const res = await apiFetch('/__svelte-devtools/open-in-editor', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({file: filename, line, column}),
		});
		if (!res.ok) {
			console.error('[Svelte DevTools] Failed to open editor:', res.status);
		}
	} catch (e) {
		console.error('[Svelte DevTools] Error opening editor:', e);
	}
}
