import { mount } from 'svelte';
import Counter from '../../svelte-kit/src/routes/Counter.svelte';

// Use the actual SvelteKit welcome counter, including its Spring and derived offset.
mount(Counter, { target: document.getElementById('app')! });
