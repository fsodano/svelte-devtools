/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
	const typesRes = await fetch('https://pokeapi.co/api/v2/type');
	if (!typesRes.ok) throw new Error('Failed to load Pokemon types');

	const typesData = await typesRes.json();
	const types = typesData.results
		.filter((t) => !['shadow', 'unknown'].includes(t.name))
		.map((t) => t.name);

	return { types };
}
