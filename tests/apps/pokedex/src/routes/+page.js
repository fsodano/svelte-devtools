import { getIdFromUrl } from '$lib/pokemon.js';

export async function load({ fetch }) {
	const [listRes, typesRes] = await Promise.all([
		fetch('https://pokeapi.co/api/v2/pokemon?limit=150'),
		fetch('https://pokeapi.co/api/v2/type')
	]);

	if (!listRes.ok || !typesRes.ok) {
		throw new Error('Failed to load Pokemon data');
	}

	const listData = await listRes.json();
	const typesData = await typesRes.json();

	const list = listData.results.map((p) => ({
		name: p.name,
		id: getIdFromUrl(p.url)
	}));

	const types = typesData.results
		.filter((t) => !['shadow', 'unknown'].includes(t.name))
		.map((t) => t.name);

	return {
		list,
		types
	};
}
