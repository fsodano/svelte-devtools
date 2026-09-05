import { defineConfig } from 'vitest/config';
import { svelteRunesPlugin } from './tests/helpers/svelte-runes-plugin.js';

export default defineConfig({
  plugins: [svelteRunesPlugin()],
  resolve: { conditions: ['browser'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'happy-dom',
    globals: true,
  },
});
