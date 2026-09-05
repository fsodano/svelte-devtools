/**
 * Shared build-time component registry and migration scoring (ADR-0010).
 *
 * COMPONENT_REGISTRY is populated by the transform hook and is the single
 * source of truth read by /api/migration, the legacy /migration-score
 * endpoint, and the svelte-devtools:migration-score RPC. Migration scores
 * are computed honestly from this registry: an unscored codebase reports
 * overall: null, never a synthesized 100.
 */

import type { ComponentMeta } from '@fsodano/svelte-devtools-types';
import type { MigrationResult } from './migration-analyzer.js';

export const COMPONENT_REGISTRY = new Map<string, ComponentMeta>();

export interface MigrationScores {
    overall: number | null;
    totalFiles: number;
    perFile: MigrationResult[];
}

function isScored(m: ComponentMeta): m is ComponentMeta & { migrationResult: MigrationResult } {
    return Boolean(m.migrationResult);
}

/** Honest migration scores from the live component registry. */
export function computeMigrationScores(): MigrationScores {
    const perFile = Array.from(COMPONENT_REGISTRY.values())
        .filter(isScored)
        .map(m => m.migrationResult);
    const total = perFile.length;
    const overall = total > 0
        ? Math.round(perFile.reduce((sum, r) => sum + r.percentage, 0) / total)
        : null;
    return { overall, totalFiles: total, perFile };
}
