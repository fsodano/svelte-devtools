/**
 * Analyzes .svelte files for Svelte 4 patterns and computes a migration score
 * toward Svelte 5. Each detected Svelte 4 pattern has a weight; if the equivalent
 * Svelte 5 pattern is detected, that weight is counted as "migrated".
 */

export interface MigrationResult {
	filename: string;
	maxScore: number;
	actualScore: number;
	percentage: number;
	patterns: {
		svelte4: string;
		svelte5: string;
		weight: number;
		migrated: boolean;
		detected: boolean;
	}[];
}

const MIGRATION_PATTERNS = [
	{ svelte4: 'export let', svelte5: '$props()', detectSvelte4: (c: string) => /\bexport\s+let\s+\w+/.test(c), weight: 5 },
	{ svelte4: '$: reactive', svelte5: '$derived()', detectSvelte4: (c: string) => /\$:\s*(?!\s*(?:if|switch|for|try)\b)(?=[a-zA-Z_$])/.test(c), weight: 5 },
	{ svelte4: 'on:click', svelte5: 'onclick', detectSvelte4: (c: string) => /\bon:\w+=/.test(c), weight: 3 },
	{ svelte4: 'createEventDispatcher', svelte5: 'callback props', detectSvelte4: (c: string) => /\bcreateEventDispatcher\b/.test(c), weight: 3 },
	{ svelte4: 'import { writable }', svelte5: '$state()', detectSvelte4: (c: string) => /\bimport\s+\{[^}]*\b(writable|readable|derived|get)\b/.test(c), weight: 5 },
	{ svelte4: '$store', svelte5: '$state()', detectSvelte4: (c: string) => /\$(?!(?:state|derived|effect|props|bindable|host|inspect|snapshot)\b)\w+/.test(c) && /\bimport\s+\{[^}]*\b(writable|readable|derived|get)\b/.test(c), weight: 5 },
	{ svelte4: '<slot>', svelte5: '{@render}', detectSvelte4: (c: string) => /<slot\b/.test(c), weight: 5 },
	{ svelte4: '<slot name>', svelte5: '{#snippet}', detectSvelte4: (c: string) => /<slot\s+name=/.test(c), weight: 5 },
	{ svelte4: 'onMount', svelte5: '$effect()', detectSvelte4: (c: string) => /\bonMount\b/.test(c), weight: 4 },
	{ svelte4: 'onDestroy', svelte5: '$effect cleanup', detectSvelte4: (c: string) => /\bonDestroy\b/.test(c), weight: 4 },
	{ svelte4: 'beforeUpdate/afterUpdate', svelte5: '$effect.pre/$effect', detectSvelte4: (c: string) => /\b(beforeUpdate|afterUpdate)\b/.test(c), weight: 4 },
];

export function analyzeMigration(code: string, filename: string, runeCounts: Record<string, number>): MigrationResult {
	const patterns = MIGRATION_PATTERNS.map(p => ({
		svelte4: p.svelte4,
		svelte5: p.svelte5,
		weight: p.weight,
		migrated: false,
		detected: p.detectSvelte4(code),
	}));

	// Always return all patterns (detected or not) for complete migration analysis
	const detectedPatterns = patterns.filter(p => p.detected);
	if (detectedPatterns.length === 0) {
		return {
			filename,
			maxScore: 0,
			actualScore: 0,
			percentage: 100,
			patterns,
		};
	}

	let maxScore = 0;
	let actualScore = 0;

	for (const p of detectedPatterns) {
		maxScore += p.weight;

		// Check if the equivalent Svelte 5 pattern is in use
		const migrated =
			(p.svelte4 === 'export let' && (runeCounts['$props'] || 0) > 0) ||
			(p.svelte4 === '$: reactive' && (runeCounts['$derived'] || 0) > 0) ||
			(p.svelte4 === 'on:click' && /\bonclick=/.test(code)) ||
			(p.svelte4 === 'createEventDispatcher' && (runeCounts['$props'] || 0) > 0) ||
			(p.svelte4 === 'import { writable }' && (runeCounts['$state'] || 0) > 0) ||
			(p.svelte4 === '$store' && (runeCounts['$state'] || 0) > 0) ||
			(p.svelte4 === '<slot>' && /\{@render\s/.test(code) && (runeCounts['$props'] || 0) > 0) ||
			(p.svelte4 === '<slot name>' && /\{#snippet\s/.test(code)) ||
			(p.svelte4 === 'onMount' && (runeCounts['$effect'] || 0) > 0) ||
			(p.svelte4 === 'onDestroy' && (runeCounts['$effect'] || 0) > 0) ||
			(p.svelte4 === 'beforeUpdate/afterUpdate' && (runeCounts['$effect'] || 0) > 0);

		p.migrated = migrated;
		if (migrated) actualScore += p.weight;
	}

	const percentage = maxScore > 0 ? Math.round((actualScore / maxScore) * 100) : 100;

	return {
		filename,
		maxScore,
		actualScore,
		percentage,
		patterns,
	};
}
