<script lang="ts">
	import { devtoolsStore } from '../lib/stores/devtools-store.svelte';

	let migrationData = $state<{
		overall: number;
		totalFiles: number;
		perFile: Array<{
			filename: string;
			percentage: number;
			maxScore: number;
			actualScore: number;
		}>;
	} | null>(null);
	let loading = $state(true);
	let sortKey = $state<'filename' | 'percentage'>('percentage');
	let sortAsc = $state(false);
	let expandedFile = $state<string | null>(null);

	async function fetchMigrationScore(): Promise<void> {
		loading = true;
		try {
			const res = await fetch('/__svelte-devtools/migration-score');
			if (res.ok) migrationData = await res.json();
		} catch {
			/* noop */
		}
		loading = false;
	}

	const sortedFiles = $derived(
		migrationData
			? [...migrationData.perFile].sort((a, b) => {
					const cmp = sortKey === 'percentage'
						? a.percentage - b.percentage
						: a.filename.localeCompare(b.filename);
					return sortAsc ? cmp : -cmp;
				})
			: []
	);

	fetchMigrationScore();

	function toggleSort(key: 'filename' | 'percentage'): void {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = false;
		}
	}

	function scoreColor(pct: number): string {
		if (pct >= 80) return 'var(--status-connected)';
		if (pct >= 50) return '#d4a017';
		return 'var(--status-disconnected)';
	}
</script>

<div class="migration-view">
	<header class="header">
		<span class="title">Migration Score</span>
		<button class="refresh-btn" onclick={fetchMigrationScore}>Refresh</button>
	</header>

	{#if loading && !migrationData}
		<div class="loading">Loading migration data...</div>
	{:else if migrationData}
		<div class="overall-score">
			<span class="score-badge" style="color: {scoreColor(migrationData.overall)}">
				{migrationData.overall}%
			</span>
			<span class="file-count">{migrationData.totalFiles} files</span>
		</div>

		<div class="file-list">
			<div class="file-header">
				<button class="sort-btn" onclick={() => toggleSort('filename')}>
					File {sortKey === 'filename' ? (sortAsc ? '▲' : '▼') : ''}
				</button>
				<button class="sort-btn" onclick={() => toggleSort('percentage')}>
					Score {sortKey === 'percentage' ? (sortAsc ? '▲' : '▼') : ''}
				</button>
			</div>
			{#each sortedFiles as file (file.filename)}
				<div class="file-row" class:expanded={expandedFile === file.filename}>
					<button class="file-info" onclick={() => expandedFile = expandedFile === file.filename ? null : file.filename}>
						<span class="file-name">{file.filename.split('/').pop() || file.filename}</span>
						<div class="score-bar-container">
							<div
								class="score-bar"
								style="width: {file.percentage}%; background: {scoreColor(file.percentage)}"
							></div>
						</div>
						<span class="file-score" style="color: {scoreColor(file.percentage)}">{file.percentage}%</span>
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty">No migration data available. Run a dev build with Svelte 5 components.</div>
	{/if}
</div>

<style>
	.migration-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-base);
		color: var(--text-primary);
		font-family: var(--font-ui);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-default);
		background: var(--bg-surface);
		flex-shrink: 0;
	}

	.title {
		font-size: 14px;
		font-weight: 600;
	}

	.refresh-btn {
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 3px 10px;
		font-size: 11px;
		cursor: pointer;
	}

	.refresh-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.loading, .empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted);
		font-size: 12px;
		padding: var(--space-6);
	}

	.overall-score {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-default);
	}

	.score-badge {
		font-size: 32px;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.file-count {
		font-size: 12px;
		color: var(--text-muted);
	}

	.file-list {
		flex: 1;
		overflow-y: auto;
	}

	.file-header {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-2);
		padding: 8px var(--space-4);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-default);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.sort-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		cursor: pointer;
		text-align: left;
	}

	.sort-btn:hover {
		color: var(--text-primary);
	}

	.file-row {
		border-bottom: 1px solid var(--border-default);
	}

	.file-info {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: var(--space-3);
		align-items: center;
		width: 100%;
		padding: 8px var(--space-4);
		background: transparent;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		text-align: left;
		font-size: 12px;
		transition: background var(--transition-fast);
	}

	.file-info:hover {
		background: var(--bg-hover);
	}

	.file-name {
		font-family: var(--font-mono);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.score-bar-container {
		height: 6px;
		background: var(--bg-tertiary);
		border-radius: 3px;
		overflow: hidden;
	}

	.score-bar {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.file-score {
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 600;
		min-width: 36px;
		text-align: right;
	}
</style>
