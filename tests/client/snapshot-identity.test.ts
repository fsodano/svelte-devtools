import { describe, expect, it } from 'vitest';
import { resolveSnapshotInstances } from '../../packages/client/src/lib/stores/snapshot-identity.js';
import type { ComponentNode } from '@fsodano/svelte-devtools-types';
const component = (id: string, filename = 'Counter.svelte') => ({ id, filename, name: 'Counter', children: [], props: {}, state: {} }) as ComponentNode;

describe('snapshot instance resolution', () => {
  it('keeps two mounted instances separate', () => {
    const instances = [component('a'), component('b')];
    expect(resolveSnapshotInstances(instances, instances).map(c => c.id)).toEqual(['a', 'b']);
  });
  it('remaps a unique component after route navigation', () => {
    expect(resolveSnapshotInstances([component('old')], [component('new')])[0].id).toBe('new');
  });
  it('refuses to target a different repeated instance after unmount', () => {
    expect(() => resolveSnapshotInstances([component('a'), component('b')], [component('b')])).toThrow('unique instance');
  });
  it('refuses ambiguous remounted lists', () => {
    expect(() => resolveSnapshotInstances([component('old')], [component('a'), component('b')])).toThrow('unique instance');
  });
});
