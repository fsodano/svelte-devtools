import { describe, it, expect } from 'vitest';
import {
  filterEntriesByQuery,
  matchesComponentQuery,
  type SearchableComponent,
} from '../../packages/client/src/lib/component-search.js';

const counter: SearchableComponent = {
  id: 'svt-1',
  name: 'Counter',
  filename: '/src/lib/Counter.svelte',
  state: { count: 3, label: 'Clicks', enabled: true },
};

describe('matchesComponentQuery', () => {
  it('matches every component for an empty query', () => {
    expect(matchesComponentQuery(counter, '')).toBe(true);
    expect(matchesComponentQuery(counter, '   ')).toBe(true);
  });

  it('matches the component name case-insensitively', () => {
    expect(matchesComponentQuery(counter, 'count')).toBe(true);
    expect(matchesComponentQuery(counter, 'COUNTER')).toBe(true);
  });

  it('matches the file name', () => {
    expect(matchesComponentQuery(counter, 'counter.svelte')).toBe(true);
  });

  it('matches a state key', () => {
    expect(matchesComponentQuery(counter, 'lab')).toBe(true);
  });

  it('matches a state value', () => {
    expect(matchesComponentQuery(counter, 'clicks')).toBe(true);
    expect(matchesComponentQuery(counter, '3')).toBe(true);
  });

  it('does not match an unrelated component', () => {
    expect(matchesComponentQuery(counter, 'sidebar')).toBe(false);
  });

  it('does not match a missing field', () => {
    expect(matchesComponentQuery({ id: 'x', name: 'Bare' }, 'anything')).toBe(false);
  });

  it('matches a nested state value', () => {
    const nested: SearchableComponent = { id: 'n', name: 'Nested', state: { user: { name: 'Ada' } } };
    expect(matchesComponentQuery(nested, 'ada')).toBe(true);
  });

  it('stops searching below the depth limit', () => {
    const deep: SearchableComponent = {
      id: 'd',
      name: 'Deep',
      state: { a: { b: { c: 'needle' } } },
    };
    expect(matchesComponentQuery(deep, 'needle')).toBe(false);
  });

  it('ignores null and undefined state values', () => {
    const sparse: SearchableComponent = { id: 's', name: 'Sparse', state: { a: null, b: undefined } };
    expect(matchesComponentQuery(sparse, 'null')).toBe(false);
  });

  it('matches a value in an object with a null prototype', () => {
    // toDisplayValue returns objects with a null prototype. String() throws on
    // them, so the filter must not stringify a state value directly.
    const nested = Object.create(null) as Record<string, unknown>;
    nested.id = 1;
    nested.name = 'Alice';
    const component: SearchableComponent = { id: 'n', name: 'Nested', state: { user: nested } };
    expect(matchesComponentQuery(component, 'alice')).toBe(true);
    expect(matchesComponentQuery(component, 'nobody')).toBe(false);
  });

  it('matches when the whole state record has a null prototype', () => {
    const state = Object.create(null) as Record<string, unknown>;
    state.label = 'Clicks';
    const component: SearchableComponent = { id: 'p', name: 'Bare', state };
    expect(matchesComponentQuery(component, 'clicks')).toBe(true);
    expect(matchesComponentQuery(component, 'nothing')).toBe(false);
  });
});

describe('filterEntriesByQuery', () => {
  const entries = [
    { component: counter, depth: 0 },
    { component: { id: 'svt-2', name: 'Sidebar', filename: '/src/lib/Sidebar.svelte', state: { open: false } }, depth: 1 },
    { component: { id: 'svt-3', name: 'Layout' }, depth: 1 },
  ];

  it('keeps every entry for an empty query', () => {
    expect(filterEntriesByQuery(entries, '')).toHaveLength(3);
  });

  it('keeps only the matching entries', () => {
    expect(filterEntriesByQuery(entries, 'sidebar').map(entry => entry.component.id)).toEqual(['svt-2']);
  });

  it('preserves the entry depth', () => {
    expect(filterEntriesByQuery(entries, 'sidebar')[0].depth).toBe(1);
  });

  it('returns nothing when no component matches', () => {
    expect(filterEntriesByQuery(entries, 'nothing-here')).toEqual([]);
  });
});
