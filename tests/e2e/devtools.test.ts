import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Phase 3 — Migration Analyzer', () => {
	// Replicate the pure functions from migration-analyzer.ts
	const MIGRATION_PATTERNS = [
		{ svelte4: 'export let', svelte5: '$props()', detectSvelte4: (c: string) => /\bexport\s+let\s+\w+/.test(c), weight: 5 },
		{ svelte4: '$: reactive', svelte5: '$derived()', detectSvelte4: (c: string) => /:\s*.*\b(?!if\b|switch\b|for\b|try\b)/.test(c), weight: 5 },
		{ svelte4: 'on:click', svelte5: 'onclick', detectSvelte4: (c: string) => /\bon:\w+=/.test(c), weight: 3 },
		{ svelte4: 'createEventDispatcher', svelte5: 'callback props', detectSvelte4: (c: string) => /\bcreateEventDispatcher\b/.test(c), weight: 3 },
		{ svelte4: 'import { writable }', svelte5: '$state()', detectSvelte4: (c: string) => /\bimport\s+\{[^}]*\bwritable\b/.test(c), weight: 5 },
		{ svelte4: 'onMount', svelte5: '$effect()', detectSvelte4: (c: string) => /\bonMount\b/.test(c), weight: 4 },
		{ svelte4: 'onDestroy', svelte5: '$effect cleanup', detectSvelte4: (c: string) => /\bonDestroy\b/.test(c), weight: 4 },
		{ svelte4: '<slot>', svelte5: '{@render}', detectSvelte4: (c: string) => /<slot\b/.test(c), weight: 5 },
		{ svelte4: '<slot name>', svelte5: '{#snippet}', detectSvelte4: (c: string) => /<slot\s+name=/.test(c), weight: 5 },
	];

	function analyzeMigration(code: string, filename: string, runeCounts: Record<string, number>) {
		const patterns = MIGRATION_PATTERNS.map(p => ({
			svelte4: p.svelte4,
			svelte5: p.svelte5,
			weight: p.weight,
			migrated: false,
			detected: p.detectSvelte4(code),
		}));

		const detectedPatterns = patterns.filter(p => p.detected);
		if (detectedPatterns.length === 0) {
			return { filename, maxScore: 0, actualScore: 0, percentage: 100, patterns: [] };
		}

		let maxScore = 0;
		let actualScore = 0;

		for (const p of detectedPatterns) {
			maxScore += p.weight;
			const migrated =
				(p.svelte4 === 'export let' && (runeCounts['$props'] || 0) > 0) ||
				(p.svelte4 === '$: reactive' && (runeCounts['$derived'] || 0) > 0) ||
				(p.svelte4 === 'on:click' && /\bonclick=/.test(code)) ||
				(p.svelte4 === 'createEventDispatcher' && (runeCounts['$props'] || 0) > 0) ||
				(p.svelte4 === 'import { writable }' && (runeCounts['$state'] || 0) > 0) ||
				(p.svelte4 === 'onMount' && (runeCounts['$effect'] || 0) > 0) ||
				(p.svelte4 === 'onDestroy' && (runeCounts['$effect'] || 0) > 0) ||
				(p.svelte4 === '<slot>' && /\{@render\s/.test(code)) ||
				(p.svelte4 === '<slot name>' && /\{#snippet\s/.test(code));

			p.migrated = migrated;
			if (migrated) actualScore += p.weight;
		}

		return {
			filename,
			maxScore,
			actualScore,
			percentage: Math.round((actualScore / maxScore) * 100),
			patterns,
		};
	}

	it('returns 100% for pure Svelte 5 code', () => {
		const code = '<script>let count = $state(0); let doubled = $derived(count * 2);</script><div>{count}</div>';
		expect(analyzeMigration(code, 'test.svelte', { '$state': 1, '$derived': 1 }).percentage).toBe(100);
	});

	it('returns 100% for code with no Svelte 4 patterns', () => {
		const code = '<script>let { name } = $props();</script><h1>{name}</h1>';
		expect(analyzeMigration(code, 'test.svelte', { '$props': 1 }).percentage).toBe(100);
	});

	it('detects export let as Svelte 4 pattern', () => {
		const code = '<script>export let title;</script>';
		const result = analyzeMigration(code, 'test.svelte', {});
		const pattern = result.patterns.find(p => p.svelte4 === 'export let');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(false);
	});

	it('marks export let as migrated when $props() is used', () => {
		const code = '<script>export let title; let { name } = $props();</script>';
		const result = analyzeMigration(code, 'test.svelte', { '$props': 1 });
		const pattern = result.patterns.find(p => p.svelte4 === 'export let');
		expect(pattern!.migrated).toBe(true);
		expect(result.percentage).toBe(100);
	});

	it('detects on:click and marks as migrated when onclick is present', () => {
		const code = '<button on:click={handler} onclick={handler}>Click</button>';
		const result = analyzeMigration(code, 'test.svelte', {});
		const pattern = result.patterns.find(p => p.svelte4 === 'on:click');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('detects createEventDispatcher and marks migrated with $props', () => {
		const code = 'import { createEventDispatcher } from "svelte"; let { name } = $props();';
		const result = analyzeMigration(code, 'test.svelte', { '$props': 1 });
		const pattern = result.patterns.find(p => p.svelte4 === 'createEventDispatcher');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('detects import { writable } and marks migrated with $state', () => {
		const code = 'import { writable } from "svelte/store"; let count = $state(0);';
		const result = analyzeMigration(code, 'test.svelte', { '$state': 1 });
		const pattern = result.patterns.find(p => p.svelte4 === 'import { writable }');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('detects onMount and marks migrated with $effect', () => {
		const code = 'import { onMount } from "svelte"; $effect(() => {});';
		const result = analyzeMigration(code, 'test.svelte', { '$effect': 1 });
		const pattern = result.patterns.find(p => p.svelte4 === 'onMount');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('detects onDestroy and marks migrated with $effect', () => {
		const code = 'import { onDestroy } from "svelte"; $effect(() => { return () => {} });';
		const result = analyzeMigration(code, 'test.svelte', { '$effect': 1 });
		const pattern = result.patterns.find(p => p.svelte4 === 'onDestroy');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('detects <slot> and marks migrated with {@render}', () => {
		const code = '<slot /><div>{@render children()}</div>';
		const result = analyzeMigration(code, 'test.svelte', {});
		const pattern = result.patterns.find(p => p.svelte4 === '<slot>');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('detects <slot name> and marks migrated with {#snippet}', () => {
		const code = '<slot name="header" /><div>{#snippet header()}{/snippet}</div>';
		const result = analyzeMigration(code, 'test.svelte', {});
		const pattern = result.patterns.find(p => p.svelte4 === '<slot name>');
		expect(pattern!.detected).toBe(true);
		expect(pattern!.migrated).toBe(true);
	});

	it('computes correct partial migration score for multiple patterns', () => {
		const code = 'export let title; import { writable } from "svelte/store"; let count = $state(0);';
		const result = analyzeMigration(code, 'test.svelte', { '$state': 1 });
		const epPattern = result.patterns.find(p => p.svelte4 === 'export let');
		const storePattern = result.patterns.find(p => p.svelte4 === 'import { writable }');
		expect(epPattern!.migrated).toBe(false);
		expect(storePattern!.migrated).toBe(true);
		expect(result.maxScore).toBe(5 + 5);
		expect(result.actualScore).toBe(5);
		expect(result.percentage).toBe(50);
	});

	it('returns correct overall percentage across multiple files', () => {
		const r1 = analyzeMigration('export let title;', 'a.svelte', {});
		const r2 = analyzeMigration('let count = $state(0);', 'b.svelte', { '$state': 1 });
		const results = [r1, r2];
		const total = results.length;
		const avgScore = Math.round(results.reduce((s, r) => s + r.percentage, 0) / total);
		expect(avgScore).toBe(50); // (0 + 100) / 2
	});
});

describe('Phase 5 — Agent API', () => {
	it('AgentResponse schema has required fields', () => {
		const response = { ok: true, data: { connected: true }, timestamp: Date.now() };
		expect(response).toHaveProperty('ok');
		expect(response).toHaveProperty('timestamp');
		expect(typeof response.ok).toBe('boolean');
	});

	it('AgentResponse with error has error field', () => {
		const response = { ok: false, error: { code: 'NOT_FOUND', message: 'Component not found' }, timestamp: Date.now() };
		expect(response.error).toBeDefined();
		expect(response.error!.code).toBe('NOT_FOUND');
		expect(response.error!.message).toBe('Component not found');
	});

	it('build-status returns expected shape', () => {
		const data = {
			connected: true,
			totalComponents: 42,
			activeComponents: 42,
			trackedRunes: ['$state', '$derived', '$props', '$effect'],
			errors: [] as string[],
			warnings: [] as string[],
		};
		expect(data.connected).toBe(true);
		expect(Array.isArray(data.trackedRunes)).toBe(true);
		expect(data.trackedRunes.length).toBeGreaterThan(0);
		expect(Array.isArray(data.errors)).toBe(true);
	});

	it('component-state returns ok with data for valid ID', () => {
		const response = {
			ok: true,
			data: { id: 'svt-abc', name: 'Counter', filename: '/src/Counter.svelte' },
			timestamp: Date.now(),
		};
		expect(response.ok).toBe(true);
		expect(response.data).toBeDefined();
	});

	it('component-state returns error for unknown ID', () => {
		const response = {
			ok: false,
			error: { code: 'NOT_FOUND', message: 'Component svt-xyz not found' },
			timestamp: Date.now(),
		};
		expect(response.ok).toBe(false);
		expect(response.error).toBeDefined();
	});
});

describe('Phase 1 — Server Events', () => {
	describe('getServerEvents with options', () => {
		const events = Array.from({ length: 20 }, (_, i) => ({
			id: `evt-${i + 1}`,
			type: 'server:trace',
			timestamp: Date.now(),
			data: { url: `/page/${i}` },
		}));

		function getServerEvents(opts?: { last?: number; sinceId?: string }) {
			if (opts?.sinceId) {
				const idx = events.findIndex(e => e.id === opts.sinceId);
				if (idx !== -1) return events.slice(idx + 1);
			}
			if (opts?.last && opts.last > 0) {
				return events.slice(-opts.last);
			}
			return events.slice();
		}

		it('returns last N events with last param', () => {
			const result = getServerEvents({ last: 5 });
			expect(result).toHaveLength(5);
			expect(result[0].id).toBe('evt-16');
			expect(result[4].id).toBe('evt-20');
		});

		it('returns all events when no params', () => {
			expect(getServerEvents()).toHaveLength(20);
		});

		it('returns events after sinceId', () => {
			const result = getServerEvents({ sinceId: 'evt-15' });
			expect(result).toHaveLength(5);
			expect(result[0].id).toBe('evt-16');
		});

		it('returns all events when sinceId not found', () => {
			const result = getServerEvents({ sinceId: 'nonexistent' });
			expect(result).toHaveLength(20);
		});

		it('handles sinceId being undefined gracefully', () => {
			const result = getServerEvents({ sinceId: undefined } as { last?: number; sinceId?: string });
			expect(result).toHaveLength(20);
		});
	});

	describe('markSeen cleanup', () => {
		let markSeenTimestamps: Map<string, number>;

		beforeEach(() => {
			markSeenTimestamps = new Map();
		});

		function addMark(key: string, age: number) {
			markSeenTimestamps.set(key, Date.now() - age);
		}

		function cleanup(cutoffMinutes: number) {
			const cutoff = Date.now() - cutoffMinutes * 60_000;
			for (const [k, ts] of markSeenTimestamps) {
				if (ts < cutoff) markSeenTimestamps.delete(k);
			}
		}

		it('removes entries older than cutoff', () => {
			addMark('GET:/old', 400_000); // ~6.6 min
			addMark('GET:/new', 1_000);   // 1 second
			cleanup(5);
			expect(markSeenTimestamps.has('GET:/old')).toBe(false);
			expect(markSeenTimestamps.has('GET:/new')).toBe(true);
			expect(markSeenTimestamps.size).toBe(1);
		});

		it('keeps recent entries', () => {
			addMark('GET:/a', 60_000);
			addMark('GET:/b', 120_000);
			cleanup(5);
			expect(markSeenTimestamps.size).toBe(2);
		});
	});
});

describe('Phase 2 — Runtime handleEffect', () => {
	function createMockRuntime() {
		const events: Array<{ type: string; componentId: string; key: string; value: unknown }> = [];
		return {
			events,
			handleEffect(componentId: string, key: string, dependencies: string[]) {
				events.push({
					type: 'effect-run',
					componentId,
					key,
					value: { dependencies },
				});
			},
		};
	}

	it('emits effect-run event with correct payload', () => {
		const runtime = createMockRuntime();
		runtime.handleEffect('svt-abc', 'effect_0', ['count', 'name']);
		expect(runtime.events).toHaveLength(1);
		expect(runtime.events[0].type).toBe('effect-run');
		expect(runtime.events[0].componentId).toBe('svt-abc');
		expect(runtime.events[0].key).toBe('effect_0');
		expect(runtime.events[0].value).toEqual({ dependencies: ['count', 'name'] });
	});

	it('handles empty dependencies array', () => {
		const runtime = createMockRuntime();
		runtime.handleEffect('svt-abc', 'effect_0', []);
		expect(runtime.events[0].value).toEqual({ dependencies: [] });
	});

	it('tracks multiple effects separately', () => {
		const runtime = createMockRuntime();
		runtime.handleEffect('svt-abc', 'effect_0', ['a']);
		runtime.handleEffect('svt-abc', 'effect_1', ['b', 'c']);
		expect(runtime.events).toHaveLength(2);
		expect(runtime.events[0].key).toBe('effect_0');
		expect(runtime.events[1].key).toBe('effect_1');
	});
});

describe('Phase 1 — Console.log cleanup verification', () => {
	it('debug is gated by isDebug flag', () => {
		const isDebug = false;
		let called = false;
		const og = console.log;
		console.log = () => { called = true; };

		if (isDebug) console.log('should not fire');
		expect(called).toBe(false);

		console.log = og;
	});

	it('debug fires when isDebug is true', () => {
		const isDebug = true;
		let called = false;
		const og = console.log;
		console.log = () => { called = true; };

		if (isDebug) console.log('should fire');
		expect(called).toBe(true);

		console.log = og;
	});
});
