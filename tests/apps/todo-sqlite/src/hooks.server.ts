import { dev } from '$app/environment';
import { noopHandle, svelteDevToolsHandle } from '@fsodano/vite-plugin-svelte-devtools/sveltekit';

export const handle = dev ? svelteDevToolsHandle() : noopHandle();
