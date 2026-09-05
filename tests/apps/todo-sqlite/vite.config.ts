import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@fsodano/vite-plugin-svelte-devtools';

export default defineConfig({
	plugins: [DevTools(), sveltekit(), svelteDevTools()]
});
