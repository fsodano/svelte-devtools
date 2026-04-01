import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { DevTools } from '@vitejs/devtools';
import { svelteDevTools } from '@svelte-devtools/vite-plugin';

export default defineConfig({
  plugins: [
    DevTools(),
    svelte(),
    svelteDevTools({
      enableStateInspection: true
    })
  ]
});
