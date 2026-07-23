<script lang="ts">
	import { formatName, formatId, artworkUrl, typeColor } from '$lib/pokemon.js';

	interface Props {
		id: number;
		name: string;
		types?: Array<{ slot: number; type: { name: string; url: string } }>;
		onClick?: () => void;
	}

	let { id, name, types, onClick }: Props = $props();

	let isLoaded = $state(false);
	let imgError = $state(false);
</script>

<article style="cursor: pointer; text-align: center; padding: 0.75rem; position: relative; transition: transform 0.15s, box-shadow 0.15s;"
	onclick={onClick}
	onmouseenter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
	onmouseleave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
>
	<small style="position: absolute; top: 0.5rem; right: 0.75rem; opacity: 0.4; font-family: monospace;">
		{formatId(id)}
	</small>

	<div style="width: 96px; height: 96px; margin: 0.5rem auto; display: flex; align-items: center; justify-content: center; position: relative;">
		{#if !isLoaded}
			<div style="width: 2rem; height: 2rem; border: 2px solid var(--pico-contrast-fade); border-top-color: var(--pico-primary); border-radius: 50%; animation: spin 0.6s linear infinite;"></div>
		{/if}
		<img
			src={artworkUrl(id)}
			alt={name}
			width={96}
			height={96}
			style="max-width: 100%; height: auto; transition: opacity 0.3s, transform 0.3s; {isLoaded ? 'opacity: 1; transform: scale(1);' : 'opacity: 0; transform: scale(0.75);'}"
			loading="lazy"
			onload={() => isLoaded = true}
			onerror={() => { imgError = true; isLoaded = true; }}
		/>
		{#if imgError}
			<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; opacity: 0.3;">?</div>
		{/if}
	</div>

	<hgroup style="margin: 0;">
		<h6 style="margin: 0; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
			{formatName(name)}
		</h6>
	</hgroup>

	{#if types && types.length > 0}
		<div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.5rem; justify-content: center;">
			{#each types as t}
				<span class="type-pill" style="background: {typeColor(t.type.name)}">
					{t.type.name}
				</span>
			{/each}
		</div>
	{:else}
		<div style="height: 1.25rem; margin-top: 0.5rem;"></div>
	{/if}
</article>

<style>
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
