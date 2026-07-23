<script lang="ts">
	import PokemonCard from '$lib/components/PokemonCard.svelte';
	import PokemonDetail from '$lib/components/PokemonDetail.svelte';
	import { fetchPokemonDetail, typeColor, getIdFromUrl } from '$lib/pokemon.js';

	interface PokemonListEntry { id: number; name: string; }

	interface PokemonDetailData {
		id: number; name: string; height: number; weight: number;
		types: Array<{ slot: number; type: { name: string; url: string } }>;
		stats: Array<{ base_stat: number; stat: { name: string } }>;
		abilities: Array<{ ability: { name: string }; is_hidden: boolean }>;
		sprites: { front_default: string; front_shiny: string; other: { 'official-artwork': { front_default: string } } };
		cries: { latest: string; legacy: string };
	}

	interface PageData { types: string[]; }

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let selectedType = $state<string | null>(null);
	let currentPage = $state(1);
	let currentOffset = $state(0);
	let allNames = $state<PokemonListEntry[]>([]);
	let pageNames = $state<PokemonListEntry[]>([]);
	let detailsMap = $state<Record<number, PokemonDetailData>>({});
	let selectedPokemon = $state<PokemonDetailData | null>(null);
	let typeNames = $state<Set<string> | null>(null);
	let isLoadingPage = $state(false);
	let isLoadingType = $state(false);
	let totalCount = $state(150);
	let isLoadingAllNames = $state(true);

	const PAGE_SIZE = 20;

	// Derived: search/type filter over the full all-names list
	let searchFiltered = $derived.by(() => {
		if (!searchQuery) return allNames;
		const q = searchQuery.toLowerCase().trim();
		return allNames.filter((p) => p.id.toString() === q || p.name.includes(q));
	});

	let typeFiltered = $derived.by(() => {
		if (!selectedType || !typeNames) return searchFiltered;
		return searchFiltered.filter((p) => typeNames.has(p.name));
	});

	let totalPages = $derived(Math.max(1, Math.ceil(typeFiltered.length / PAGE_SIZE)));
	let maxOffset = $derived(Math.max(0, typeFiltered.length - PAGE_SIZE));

	let paginatedIds = $derived.by(() => {
		// If search or type filter is active, use the filtered list with client-side pagination
		if (searchQuery || selectedType) {
			return typeFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
		}
		// Otherwise use the API-paginated pageNames list
		return pageNames;
	});

	let hasActiveTypeFilter = $derived(selectedType !== null);

	// Reset page on filter change
	$effect(() => {
		searchQuery;
		selectedType;
		currentPage = 1;
	});

	// Fetch all 150 names once for search/filter
	$effect(() => {
		let cancelled = false;
		fetch('https://pokeapi.co/api/v2/pokemon?limit=150')
			.then((r) => r.json())
			.then((d) => {
				if (cancelled) return;
				const list = d.results.map((p: { name: string; url: string }) => ({
					name: p.name,
					id: getIdFromUrl(p.url)
				}));
				allNames = list;
				totalCount = list.length;
				isLoadingAllNames = false;
			});
		return () => { cancelled = true; };
	});

	// Fetch page names from API when page or offset changes
	// Only fires when no search/filter is active
	$effect(() => {
		if (searchQuery || selectedType) return;
		const offset = (currentPage - 1) * PAGE_SIZE;
		if (offset === currentOffset && currentPage > 1) return; // already loaded
		isLoadingPage = true;
		currentOffset = offset;
		fetch(`https://pokeapi.co/api/v2/pokemon?limit=${PAGE_SIZE}&offset=${offset}`)
			.then((r) => r.json())
			.then((d) => {
				const list = d.results.map((p: { name: string; url: string }) => ({
					name: p.name,
					id: getIdFromUrl(p.url)
				}));
				pageNames = list;
				isLoadingPage = false;
			});
	});

	// Fetch type data when filter changes
	$effect(() => {
		if (!selectedType) { typeNames = null; return; }
		isLoadingType = true;
		fetch(`https://pokeapi.co/api/v2/type/${selectedType}`)
			.then((r) => r.json())
			.then((typeData) => {
				const names = new Set<string>(
					typeData.pokemon
						.map((p: { pokemon: { name: string } }) => p.pokemon.name)
						.filter((name: string) => allNames.some((l) => l.name === name))
				);
				typeNames = names;
			})
			.catch(() => { typeNames = null; })
			.finally(() => { isLoadingType = false; });
	});

	function selectPokemon(id: number) {
		const detail = detailsMap[id];
		if (detail) { selectedPokemon = detail; return; }
		fetchPokemonDetail(id).then((d) => { detailsMap[id] = d; selectedPokemon = d; });
	}

	function closeDetail() { selectedPokemon = null; }
	function selectType(type: string) { selectedType = type === selectedType ? null : type; }
	function clearFilters() { searchQuery = ''; selectedType = null; }
</script>

<svelte:head>
	<title>Pokédex — Gen I</title>
	<meta name="description" content="Browse all 151 Kanto Pokémon" />
</svelte:head>

<main class="container" style="padding-top: 2rem;">
	<header style="text-align: center; margin-bottom: 1.5rem;">
		<h1 style="margin-bottom: 0;">Pokédex</h1>
		<small style="opacity: 0.5;">Kanto region · {totalCount} Pokémon</small>
	</header>

	<!-- search -->
	<div style="margin-bottom: 0.75rem;">
		<input type="search" bind:value={searchQuery} placeholder="Search by name or ID…" aria-label="Search" class="search-input" />
	</div>

	<!-- type filter -->
	<div style="display: flex; gap: 0.25rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.75rem;">
		<button class="filter-all-btn {!hasActiveTypeFilter ? 'active' : 'outline'}" onclick={() => clearFilters()} style="width: auto; margin: 0; padding: 0.25rem 0.75rem; font-size: 0.75rem;">
			All
		</button>
		{#each data.types as type}
			<button
				class="filter-type-btn {selectedType === type ? 'active' : ''}"
				onclick={() => selectType(type)}
				disabled={isLoadingType}
				style="width: auto; margin: 0; padding: 0.25rem 0.75rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: {typeColor(type)}; border-color: {typeColor(type)}; color: #fff; opacity: {selectedType === type ? 1 : 0.75};">
				{type}
			</button>
		{/each}
	</div>

	<div style="display: grid; grid-template-columns: 1fr 360px; gap: 1rem; align-items: start;">
		<!-- Left: pokemon list -->
		<div>
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
				<small style="opacity: 0.5;">
					{typeFiltered.length} result{typeFiltered.length !== 1 ? 's' : ''}{searchQuery || selectedType ? ' found' : ''}
				</small>
				<div style="display: flex; gap: 0.75rem; align-items: center;">
					{#if isLoadingType}<small style="color: var(--pico-del-color);">Loading type…</small>{/if}
					{#if totalPages > 1}<small style="opacity: 0.5;">Page {currentPage} of {totalPages}</small>{/if}
				</div>
			</div>

			{#if isLoadingAllNames && allNames.length === 0}
				<article style="text-align: center; padding: 3rem;">
					<p style="opacity: 0.5;">Loading Pokémon…</p>
				</article>
			{:else if paginatedIds.length === 0}
				<article style="text-align: center; padding: 3rem;">
					<p style="opacity: 0.5;">No Pokémon match your search.</p>
					<button class="outline" onclick={clearFilters}>Clear filters</button>
				</article>
			{:else}
				<div class="pokemon-list">
					{#each paginatedIds as p (p.id)}
						<PokemonCard id={p.id} name={p.name} types={detailsMap[p.id]?.types} onClick={() => selectPokemon(p.id)} />
					{/each}
				</div>

				{#if isLoadingPage}
					<div style="text-align: center; margin-top: 0.75rem;"><small style="opacity: 0.5;">Loading…</small></div>
				{/if}

				{#if totalPages > 1}
					<nav style="display: flex; justify-content: center; gap: 0.25rem; margin-top: 1.5rem; margin-bottom: 1.5rem;">
						<button class="outline" onclick={() => currentPage = Math.max(1, currentPage - 1)} disabled={currentPage <= 1} style="width: auto; margin: 0; font-size: 0.75rem; padding: 0.25rem 0.75rem;">
							← Prev
						</button>
						{#each { length: Math.min(totalPages, 7) } as _, i}
							{@const pageNum = totalPages <= 7 ? i + 1 : (
								i === 0 ? 1 : i === 6 ? totalPages : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i
							)}
							<button class={currentPage === pageNum ? '' : 'outline'} onclick={() => currentPage = pageNum} style="width: auto; margin: 0; padding: 0.25rem 0.6rem; font-size: 0.75rem;">
								{pageNum}
							</button>
						{/each}
						<button class="outline" onclick={() => currentPage = Math.min(totalPages, currentPage + 1)} disabled={currentPage >= totalPages} style="width: auto; margin: 0; font-size: 0.75rem; padding: 0.75rem;">
							Next →
						</button>
					</nav>
				{/if}
			{/if}
		</div>

		<!-- Right (360px, sticky): detail panel -->
		<aside style="position: sticky; top: 1.5rem; max-height: calc(100vh - 4rem); overflow-y: auto;">
			{#if selectedPokemon}
				{#key selectedPokemon.id}
					<PokemonDetail pokemon={selectedPokemon} onClose={closeDetail} />
				{/key}
			{:else}
				<article style="padding: 2rem; text-align: center;">
					<div style="font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.3;">?</div>
					<p style="opacity: 0.4; font-size: 0.85rem;">Select a Pokémon to see its details</p>
				</article>
			{/if}
		</aside>
	</div>
</main>
