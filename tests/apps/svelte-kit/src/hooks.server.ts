import {dev} from '$app/environment';
import {noopHandle, svelteDevToolsHandle} from '@svelte-devtools/vite-plugin/sveltekit';

export const handle = dev ? svelteDevToolsHandle() : noopHandle();
