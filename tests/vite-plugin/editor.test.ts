import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveEditorLocation } from '../../packages/vite-plugin/src/editor.js';
const root = mkdtempSync(join(tmpdir(), 'svelte-editor-'));
const outside = mkdtempSync(join(tmpdir(), 'svelte-outside-'));
writeFileSync(join(root, 'Counter.svelte'), '<div/>');
writeFileSync(join(outside, 'secret.txt'), 'test');
symlinkSync(join(outside, 'secret.txt'), join(root, 'link.svelte'));
afterAll(() => { rmSync(root, { recursive: true }); rmSync(outside, { recursive: true }); });
describe('editor source boundary', () => {
  it('resolves a filename fallback to line one', () => {
    expect(resolveEditorLocation(root, 'Counter.svelte')).toMatch(/Counter\.svelte:1:1$/);
  });
  it('rejects paths outside the project, including symlinks', () => {
    expect(() => resolveEditorLocation(root, join(outside, 'secret.txt'))).toThrow('inside');
    expect(() => resolveEditorLocation(root, 'link.svelte')).toThrow('inside');
  });
  it('rejects missing files, directories, and invalid positions', () => {
    expect(() => resolveEditorLocation(root, 'missing')).toThrow();
    expect(() => resolveEditorLocation(root, '.')).toThrow();
    expect(() => resolveEditorLocation(root, 'Counter.svelte', -1)).toThrow();
  });
});
