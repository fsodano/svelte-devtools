const API_BASE = 'https://pokeapi.co/api/v2';
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const CRY_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';

export function getIdFromUrl(url) {
	return parseInt(url.replace(/\/$/, '').split('/').pop(), 10);
}

export function formatName(name) {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export function formatId(id) {
	return '#' + String(id).padStart(3, '0');
}

export function artworkUrl(id) {
	return SPRITE_BASE + '/other/official-artwork/' + id + '.png';
}

export function spriteUrl(id) {
	return SPRITE_BASE + '/' + id + '.png';
}

export function shinySpriteUrl(id) {
	return SPRITE_BASE + '/shiny/' + id + '.png';
}

export function cryUrl(id) {
	return CRY_BASE + '/' + id + '.ogg';
}

export function formatHeight(heightInDm) {
	return (heightInDm / 10).toFixed(1) + ' m';
}

export function formatWeight(weightInHg) {
	return (weightInHg / 10).toFixed(1) + ' kg';
}

export const TYPE_COLORS = {
	normal: '#A8A878',
	fire: '#F08030',
	water: '#6890F0',
	electric: '#F8D030',
	grass: '#78C850',
	ice: '#98D8D8',
	fighting: '#C03028',
	poison: '#A040A0',
	ground: '#E0C068',
	flying: '#A890F0',
	psychic: '#F85888',
	bug: '#A8B820',
	rock: '#B8A038',
	ghost: '#705898',
	dragon: '#7038F8',
	dark: '#705848',
	steel: '#B8B8D0',
	fairy: '#EE99AC'
};

export const STAT_LABELS = {
	hp: 'HP',
	attack: 'Attack',
	defense: 'Defense',
	'special-attack': 'Sp. Atk',
	'special-defense': 'Sp. Def',
	speed: 'Speed'
};

export function typeColor(type) {
	return TYPE_COLORS[type] || '#A8A878';
}

export async function fetchPokemonDetail(id) {
	const res = await fetch(API_BASE + '/pokemon/' + id);
	if (!res.ok) throw new Error('Failed to fetch Pokemon #' + id);
	return res.json();
}

export async function fetchPokemonBatch(ids, opts = {}) {
	const { concurrency = 6, onItem } = opts;
	const results = [];
	const queue = [...ids];

	async function worker() {
		while (queue.length > 0) {
			const id = queue.shift();
			if (id === undefined) break;
			try {
				const res = await fetch(API_BASE + '/pokemon/' + id);
				if (!res.ok) throw new Error('HTTP ' + res.status);
				const data = await res.json();
				results.push({ status: 'fulfilled', value: data });
				if (onItem) onItem(id, data);
			} catch (err) {
				results.push({ status: 'rejected', reason: err });
				if (onItem) onItem(id, null);
			}
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
	await Promise.all(workers);
	return results;
}
