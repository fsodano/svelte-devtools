import { describe, it, expect } from 'vitest';
import { packResults } from '../../scripts/npm-pack-output.mjs';

/**
 * npm 11 returns an array from `npm pack --json`. npm 12 returns an object
 * keyed by package name. The release scripts run under both, so they normalize
 * the output before they read it.
 */
const npm11Output = JSON.stringify([
  { name: '@fsodano/svelte-devtools-types', filename: 'fsodano-svelte-devtools-types-0.4.0.tgz', files: [{ path: 'dist/index.js' }] },
  { name: '@fsodano/svelte-devtools-runtime', filename: 'fsodano-svelte-devtools-runtime-0.4.0.tgz', files: [{ path: 'dist/index.js' }] },
]);

const npm12Output = JSON.stringify({
  '@fsodano/svelte-devtools-types': { name: '@fsodano/svelte-devtools-types', filename: 'fsodano-svelte-devtools-types-0.4.0.tgz', files: [{ path: 'dist/index.js' }] },
  '@fsodano/svelte-devtools-runtime': { name: '@fsodano/svelte-devtools-runtime', filename: 'fsodano-svelte-devtools-runtime-0.4.0.tgz', files: [{ path: 'dist/index.js' }] },
});

describe('packResults', () => {
  it('reads the npm 11 array output', () => {
    const results = packResults(npm11Output);
    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe('fsodano-svelte-devtools-types-0.4.0.tgz');
  });

  it('reads the npm 12 object output', () => {
    const results = packResults(npm12Output);
    expect(results).toHaveLength(2);
    expect(results.map((result: { filename: string }) => result.filename)).toEqual([
      'fsodano-svelte-devtools-types-0.4.0.tgz',
      'fsodano-svelte-devtools-runtime-0.4.0.tgz',
    ]);
  });

  it('accepts an already parsed value', () => {
    expect(packResults([{ filename: 'a.tgz' }])).toEqual([{ filename: 'a.tgz' }]);
    expect(packResults({ a: { filename: 'a.tgz' } })).toEqual([{ filename: 'a.tgz' }]);
  });

  it('returns nothing for empty output', () => {
    expect(packResults('[]')).toEqual([]);
    expect(packResults('{}')).toEqual([]);
  });
});
