import { describe, it, expect } from 'vitest';
import { toRollupError } from '../../packages/vite-plugin/src/utils/error.js';

describe('toRollupError', () => {
  it('converts a simple error to RollupError format', () => {
    const error = new Error('Something went wrong');
    const result = toRollupError(error, { isBuild: false, isDebug: false });

    expect(result).toHaveProperty('message');
    expect(result.message).toContain('Something went wrong');
    expect(result).toHaveProperty('name', 'SvelteDevToolsError');
  });

  it('includes frame when present', () => {
    const error = new Error('Parse error') as Error & { frame?: string; start?: { line: number; column: number } };
    error.frame = '1: let x = \n      ^';
    error.start = { line: 1, column: 6 };

    const result = toRollupError(error, { isBuild: false, isDebug: false });

    expect(result).toHaveProperty('frame');
    expect(result.loc).toBeDefined();
  });

  it('includes filename in extended message', () => {
    const error = new Error('Cannot find name') as Error & { filename?: string; start?: { line: number; column: number } };
    error.filename = '/src/App.svelte';
    error.start = { line: 5, column: 10 };

    const result = toRollupError(error, { isBuild: false, isDebug: false });

    expect(result.message).toContain('/src/App.svelte');
    expect(result.message).toContain('5:10');
  });

  it('preserves stack in build/debug mode', () => {
    const error = new Error('Build error');
    error.stack = 'Error: Build error\n    at Object.transform';

    const result = toRollupError(error, { isBuild: true, isDebug: false });

    expect(result.stack).toBeTruthy();
    expect(result.stack).toContain('Error: Build error');
  });

  it('handles non-Error objects gracefully', () => {
    const result = toRollupError('string error', { isBuild: false, isDebug: false });
    expect(result).toHaveProperty('message');
  });
});
