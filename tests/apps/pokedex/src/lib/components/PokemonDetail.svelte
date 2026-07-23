<script lang="ts">
	import {
		formatName,
		formatId,
		formatHeight,
		formatWeight,
		spriteUrl,
		shinySpriteUrl,
		cryUrl,
		typeColor,
		STAT_LABELS
	} from '$lib/pokemon.js';

	interface Props {
		pokemon: {
			id: number;
			name: string;
			height: number;
			weight: number;
			types: Array<{ slot: number; type: { name: string; url: string } }>;
			stats: Array<{ base_stat: number; stat: { name: string } }>;
			abilities: Array<{ ability: { name: string }; is_hidden: boolean }>;
			sprites: { front_default: string; front_shiny: string; };
		};
		onClose: () => void;
	}

	let { pokemon, onClose }: Props = $props();

	let showShiny = $state(false);
	let isPlaying = $state(false);
	let audioRef: HTMLAudioElement | undefined = $state();

	let displayedSprite = $derived(
		showShiny
			? (pokemon.sprites.front_shiny || shinySpriteUrl(pokemon.id))
			: (pokemon.sprites.front_default || spriteUrl(pokemon.id))
	);

	let mainType = $derived(pokemon.types[0]?.type.name ?? 'normal');
	let accentColor = $derived(typeColor(mainType));

	function playCry() {
		if (!audioRef) return;
		audioRef.currentTime = 0;
		audioRef.play().then(() => { isPlaying = true; }).catch(() => {});
	}

	function maxStat(baseStat: number): number {
		return Math.min(100, Math.round((baseStat / 255) * 100));
	}

	function statColor(baseStat: number): string {
		if (baseStat >= 120) return '#44cf6c';
		if (baseStat >= 80) return '#a4d64e';
		if (baseStat >= 50) return '#f0c040';
		return '#f45858';
	}
</script>

<article style="padding: 0; margin: 0; animation: fade-in 0.2s ease-out;">
	<div style="display: flex; flex-direction: column; align-items: center; padding: 1.5rem 1.25rem 1.25rem; position: relative; background: linear-gradient(180deg, {accentColor}33 0%, {accentColor}11 60%, transparent 100%);">
		<button class="outline secondary" onclick={onClose} aria-label="Close" style="position: absolute; top: 0.5rem; right: 0.5rem; width: 1.75rem; height: 1.75rem; padding: 0; display: flex; align-items: center; justify-content: center; border: none;">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>

		<small style="opacity: 0.4; font-family: monospace; margin-bottom: 0.25rem;">{formatId(pokemon.id)}</small>
		<h3 style="margin: 0 0 0.5rem; font-size: 1.25rem;">{formatName(pokemon.name)}</h3>

		<div style="display: flex; gap: 0.375rem; margin-bottom: 0.75rem;">
			{#each pokemon.types as t}
				<span class="type-pill" style="background: {typeColor(t.type.name)}">{t.type.name}</span>
			{/each}
		</div>

		<div style="position: relative;">
			<img src={displayedSprite} alt={showShiny ? 'Shiny ' + pokemon.name : pokemon.name} width={140} height={140} style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));" />
			<button class="outline" onclick={() => showShiny = !showShiny} style="position: absolute; bottom: -0.25rem; right: -0.5rem; padding: 0.2rem 0.5rem; font-size: 0.6rem; border-radius: 999px; {showShiny ? 'background: #f0c040; color: #332b00; border-color: #f0c040;' : ''}">
				<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 2px;">
					<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
				</svg>
				{showShiny ? 'Shiny' : 'Normal'}
			</button>
		</div>

		<button class="outline" onclick={playCry} disabled={isPlaying} style="margin-top: 0.75rem; padding: 0.2rem 0.75rem; font-size: 0.7rem; border-radius: 999px;">
			{isPlaying ? 'Playing...' : 'Play Cry'}
		</button>
		<audio src={cryUrl(pokemon.id)} preload="none" bind:this={audioRef} onended={() => isPlaying = false}></audio>
	</div>

	<div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
		<div class="grid" style="grid-template-columns: 1fr 1fr; gap: 0.5rem;">
			<div style="text-align: center;">
				<small style="opacity: 0.5;">Height</small>
				<div style="font-size: 0.9rem;">{formatHeight(pokemon.height)}</div>
			</div>
			<div style="text-align: center;">
				<small style="opacity: 0.5;">Weight</small>
				<div style="font-size: 0.9rem;">{formatWeight(pokemon.weight)}</div>
			</div>
		</div>

		<div>
			<small style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.5;">Base Stats</small>
			<div style="display: flex; flex-direction: column; gap: 0.375rem; margin-top: 0.5rem;">
				{#each pokemon.stats as stat}
					<div style="display: flex; align-items: center; gap: 0.375rem;">
						<small style="width: 3.5rem; text-align: right; opacity: 0.6; flex-shrink: 0; font-size: 0.65rem;">{STAT_LABELS[stat.stat.name] || stat.stat.name}</small>
						<small style="width: 1.5rem; text-align: right; font-family: monospace; flex-shrink: 0; font-size: 0.65rem;">{stat.base_stat}</small>
						<div class="stat-bar" style="flex: 1;">
							<div class="stat-bar-fill" style="width: {maxStat(stat.base_stat)}%; background: {statColor(stat.base_stat)};"></div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div>
			<small style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.5;">Abilities</small>
			<div style="display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.375rem;">
				{#each pokemon.abilities as ability}
					<span style="padding: 0.2rem 0.625rem; border-radius: 0.5rem; font-size: 0.75rem; {ability.is_hidden ? 'border: 1px dashed var(--pico-contrast-fade);' : 'background: var(--pico-card-background-color);'}">
						{ability.ability.name.replace('-', ' ')}
						{#if ability.is_hidden}<small style="opacity: 0.5;"> (Hidden)</small>{/if}
					</span>
				{/each}
			</div>
		</div>
	</div>
</article>
