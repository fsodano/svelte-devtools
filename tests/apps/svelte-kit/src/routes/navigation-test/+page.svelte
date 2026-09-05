<script lang="ts">
	import { afterNavigate, beforeNavigate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data } = $props();

	// Navigation guard: when armed, cancel every navigation attempt.
	let guardArmed = $state(false);
	let cancellations = $state(0);
	let navigations = $state(0);

	beforeNavigate(({ cancel }) => {
		if (guardArmed) {
			cancel();
			cancellations += 1;
		}
	});

	afterNavigate(() => {
		navigations += 1;
	});
</script>

<h1>Navigation Test</h1>

<p data-testid="load-count">load count: {data.loadCount}</p>

<button data-testid="refresh" onclick={() => invalidateAll()}>Refresh data</button>

<button data-testid="arm-guard" onclick={() => (guardArmed = !guardArmed)}>
	{guardArmed ? 'Guard: armed (click to disarm)' : 'Guard: disarmed (click to arm)'}
</button>

<p data-testid="cancellations">cancellations: {cancellations}</p>
<p data-testid="navigations">navigations: {navigations}</p>

<a data-testid="nav-link" href={resolve('/about')}>Go to /about</a>

<style>
	h1 {
		margin-bottom: 1rem;
	}

	p {
		margin: 0.5rem 0;
	}

	button {
		margin-right: 0.5rem;
		padding: 0.4rem 0.8rem;
	}
</style>
