import { describe, it, expect } from 'vitest';
import { SvelteProxyInspector, mutateRuntimeState } from '../../packages/runtime/src/proxy-inspector.js';

// ─── SvelteProxyInspector ─────────────────────────────────────────────────────

describe('SvelteProxyInspector', () => {
  describe('primitives', () => {
    it('inspect(null) returns null', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(null)).toBeNull();
    });

    it('inspect(undefined) returns undefined', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(undefined)).toBeUndefined();
    });

    it('inspect(42) returns 42', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(42)).toBe(42);
    });

    it("inspect('hello') returns 'hello'", () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect('hello')).toBe('hello');
    });

    it('inspect(true) returns true', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(true)).toBe(true);
    });
  });

  describe('functions', () => {
    it('converts a function to "[Function]"', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(() => {})).toBe('[Function]');
    });
  });

  describe('DOM nodes', () => {
    it('converts an Element to "[DOM Node]"', () => {
      const inspector = new SvelteProxyInspector();
      const div = document.createElement('div');
      expect(inspector.inspect(div)).toBe('[DOM Node]');
    });
  });

  describe('arrays', () => {
    it('inspects each element recursively', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect([1, 'two', () => {}])).toEqual([1, 'two', '[Function]']);
    });

    it('handles nested arrays', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect([1, [2, [3]]])).toEqual([1, [2, [3]]]);
    });
  });

  describe('Map', () => {
    it('converts Map to a plain object', () => {
      const inspector = new SvelteProxyInspector();
      const m = new Map([['a', 1]]);
      expect(inspector.inspect(m)).toEqual({ a: 1 });
    });
  });

  describe('Set', () => {
    it('converts Set to an array', () => {
      const inspector = new SvelteProxyInspector();
      const s = new Set([1, 2, 3]);
      expect(inspector.inspect(s)).toEqual([1, 2, 3]);
    });
  });

  describe('Date', () => {
    it('converts Date to an ISO string', () => {
      const inspector = new SvelteProxyInspector();
      const d = new Date('2024-01-01');
      expect(inspector.inspect(d)).toBe(d.toISOString());
    });
  });

  describe('RegExp', () => {
    it('converts RegExp to its string representation', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(/test/gi)).toBe('/test/gi');
    });
  });

  describe('Error', () => {
    it('converts Error to { message, name, stack }', () => {
      const inspector = new SvelteProxyInspector();
      const err = new Error('boom');
      const result = inspector.inspect(err) as Record<string, unknown>;
      expect(result).toEqual({
        message: 'boom',
        name: 'Error',
        stack: expect.any(String),
      });
    });
  });

  describe('Promise', () => {
    it('converts Promise to "[Promise]"', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(Promise.resolve(1))).toBe('[Promise]');
    });
  });

  describe('plain objects', () => {
    it('passes through simple key/value pairs', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect({ a: 1, b: 'hello' })).toEqual({ a: 1, b: 'hello' });
    });

    it('handles nested objects', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect({ outer: { inner: { x: 1 } } })).toEqual({
        outer: { inner: { x: 1 } },
      });
    });
  });

  describe('circular references', () => {
    it('returns "[Circular]" for a self-referencing object', () => {
      const inspector = new SvelteProxyInspector();
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj;
      const result = inspector.inspect(obj) as Record<string, unknown>;
      expect(result.name).toBe('test');
      expect(result.self).toBe('[Circular]');
    });
  });

  describe('depth limit', () => {
    it('returns "[Max Depth]" when exceeding max depth', () => {
      const inspector = new SvelteProxyInspector();
      // Build a chain 12 levels deep (MAX_DEPTH is 10)
      let obj: Record<string, unknown> = { value: 0 };
      let root = obj;
      for (let i = 1; i <= 12; i++) {
        obj.next = { value: i };
        obj = obj.next as Record<string, unknown>;
      }
      const result = inspector.inspect(root) as Record<string, unknown>;
      // Walk the result until we hit Max Depth
      let current = result;
      let depth = 0;
      while (current && typeof current === 'object' && !Array.isArray(current)) {
        if ((current as Record<string, unknown>).next === '[Max Depth]') {
          depth++;
          break;
        }
        if ((current as Record<string, unknown>).next) {
          depth++;
          current = (current as Record<string, unknown>).next as Record<string, unknown>;
        } else {
          break;
        }
      }
      // Should have stopped before reaching the full depth
      expect(depth).toBeLessThan(12);
    });
  });

  describe('getters', () => {
    it('resolves getter values', () => {
      const inspector = new SvelteProxyInspector();
      const obj = {
        _value: 42,
        get value() {
          return this._value;
        },
      };
      const result = inspector.inspect(obj) as Record<string, unknown>;
      expect(result.value).toBe(42);
    });

    it('returns "[Unavailable]" for getters that throw', () => {
      const inspector = new SvelteProxyInspector();
      const obj = {
        get bad() {
          throw new Error('nope');
        },
      };
      const result = inspector.inspect(obj) as Record<string, unknown>;
      expect(result.bad).toBe('[Unavailable]');
    });
  });

  describe('Svelte internal keys', () => {
    it('skips $$-prefixed keys', () => {
      const inspector = new SvelteProxyInspector();
      const obj = { name: 'visible', $$internal: 'hidden' };
      const result = inspector.inspect(obj) as Record<string, unknown>;
      expect(result).toEqual({ name: 'visible' });
      expect(result).not.toHaveProperty('$$internal');
    });

    it('skips __svelte_meta key', () => {
      const inspector = new SvelteProxyInspector();
      const obj = { name: 'visible', __svelte_meta: { some: 'meta' } };
      const result = inspector.inspect(obj) as Record<string, unknown>;
      expect(result).toEqual({ name: 'visible' });
      expect(result).not.toHaveProperty('__svelte_meta');
    });
  });

  describe('objects with no own properties', () => {
    it('falls back to string representation', () => {
      const inspector = new SvelteProxyInspector();
      class Empty {}
      const obj = new Empty();
      const result = inspector.inspect(obj);
      expect(typeof result).toBe('string');
    });
  });

  describe('reusability', () => {
    it('can be used for multiple inspections', () => {
      const inspector = new SvelteProxyInspector();
      expect(inspector.inspect(42)).toBe(42);
      expect(inspector.inspect('hello')).toBe('hello');
      expect(inspector.inspect({ a: 1 })).toEqual({ a: 1 });
      expect(inspector.inspect([1, 2])).toEqual([1, 2]);
    });
  });
});

// ─── mutateRuntimeState ───────────────────────────────────────────────────────

describe('mutateRuntimeState', () => {
  it('sets a value at a top-level key', () => {
    const map = new Map<string, unknown>();
    mutateRuntimeState(map, 'key', 'value');
    expect(map.get('key')).toBe('value');
  });

  it('creates nested Maps for dot-notated paths', () => {
    const map = new Map<string, unknown>();
    mutateRuntimeState(map, 'a.b.c', 42);
    const a = map.get('a') as Map<string, unknown>;
    expect(a).toBeInstanceOf(Map);
    const b = a.get('b') as Map<string, unknown>;
    expect(b).toBeInstanceOf(Map);
    expect(b.get('c')).toBe(42);
  });

  it('does NOT throw when an intermediate is a non-Map value', () => {
    const map = new Map<string, unknown>();
    map.set('a', 'not-a-map');
    expect(() => {
      mutateRuntimeState(map, 'a.b.c', 42);
    }).not.toThrow();
    // The non-Map value at 'a' is replaced with a new Map to continue navigation
    expect(map.get('a')).toBeInstanceOf(Map);
    expect(((map.get('a') as Map<string, unknown>).get('b') as Map<string, unknown>).get('c')).toBe(42);
  });

  it('overwrites existing leaf values', () => {
    const map = new Map<string, unknown>();
    mutateRuntimeState(map, 'x', 1);
    expect(map.get('x')).toBe(1);
    mutateRuntimeState(map, 'x', 999);
    expect(map.get('x')).toBe(999);
  });

  it('overwrites nested leaf values', () => {
    const map = new Map<string, unknown>();
    mutateRuntimeState(map, 'a.b', 'first');
    expect((map.get('a') as Map<string, unknown>).get('b')).toBe('first');
    mutateRuntimeState(map, 'a.b', 'second');
    expect((map.get('a') as Map<string, unknown>).get('b')).toBe('second');
  });

  it('handles single-segment path same as direct set', () => {
    const map = new Map<string, unknown>();
    mutateRuntimeState(map, 'single', 99);
    expect(map.size).toBe(1);
    expect(map.get('single')).toBe(99);
  });
});
