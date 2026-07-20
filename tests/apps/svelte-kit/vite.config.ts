import {defineConfig} from 'vite';
import {DevTools} from '@vitejs/devtools';
import {svelteDevTools} from '@svelte-devtools/vite-plugin';
import {sveltekit} from "@sveltejs/kit/vite";

export default defineConfig({
    plugins: [
        DevTools(),
        sveltekit(),
        svelteDevTools({
            enableStateInspection: true
        })
    ],
    build: {
        rolldownOptions: {
            devtools: {}, // enable devtools mode
        },
    }
});
