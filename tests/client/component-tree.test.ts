import { describe, expect, it } from 'vitest';
import { indexComponentTree, flattenComponentTree } from '../../packages/client/src/lib/component-tree';

describe('component tree indexing', () => {
  it('keeps root and sibling order while honoring collapsed branches', () => {
    const components = [{ id: 'root' }, { id: 'a', parentId: 'root' }, { id: 'leaf', parentId: 'a' }, { id: 'b', parentId: 'root' }, { id: 'other' }];
    const index = indexComponentTree(components);
    expect(flattenComponentTree(index, {}).map(row => [row.component.id, row.depth])).toEqual([
      ['root', 0], ['a', 1], ['leaf', 2], ['b', 1], ['other', 0],
    ]);
    expect(flattenComponentTree(index, { a: false }).map(row => row.component.id)).toEqual(['root', 'a', 'b', 'other']);
  });

  it('keeps a surviving child visible when its parent is removed', () => {
    const child = { id: 'child', parentId: 'removed' };
    expect(flattenComponentTree(indexComponentTree([child]), {})).toEqual([{ component: child, depth: 0 }]);
  });

  it('handles deeply nested trees without overflowing the call stack', () => {
    const components = Array.from({ length: 10000 }, (_, index) => ({ id: String(index), parentId: index ? String(index - 1) : undefined }));
    const rows = flattenComponentTree(indexComponentTree(components), {});
    expect(rows).toHaveLength(10000);
    expect(rows.at(-1)?.depth).toBe(9999);
  });
});
