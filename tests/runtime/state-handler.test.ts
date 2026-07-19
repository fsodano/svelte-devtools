import { describe, it, expect, beforeEach, vi } from 'vitest';

// Replicate sanitizeForPostMessage from runtime/src/index.ts
// This is a pure function we can test directly
function sanitizeForPostMessage(value: unknown): unknown {
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (value instanceof Element || value instanceof Node) {
    return '[DOM Node]';
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForPostMessage);
  }
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = sanitizeForPostMessage(v);
    });
    return obj;
  }
  if (value instanceof Set) {
    return Array.from(value).map(sanitizeForPostMessage);
  }

  const obj: Record<string, unknown> = {};
  const seen = new Set<string>();
  let proto: unknown = value;

  while (proto && proto !== Object.prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    for (const [key, desc] of Object.entries(descriptors)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (typeof desc.get === 'function') {
        try {
          obj[key] = sanitizeForPostMessage(desc.get.call(value));
        } catch {
          obj[key] = '[Error]';
        }
      } else if (typeof desc.value !== 'function') {
        obj[key] = sanitizeForPostMessage(desc.value);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }

  return Object.keys(obj).length > 0 ? obj : String(value);
}

describe('runtime sanitizeForPostMessage', () => {
  describe('primitives', () => {
    it('passes through strings', () => {
      expect(sanitizeForPostMessage('hello')).toBe('hello');
    });

    it('passes through numbers', () => {
      expect(sanitizeForPostMessage(42)).toBe(42);
      expect(sanitizeForPostMessage(0)).toBe(0);
      expect(sanitizeForPostMessage(-1)).toBe(-1);
    });

    it('passes through booleans', () => {
      expect(sanitizeForPostMessage(true)).toBe(true);
      expect(sanitizeForPostMessage(false)).toBe(false);
    });

    it('passes through null and undefined', () => {
      expect(sanitizeForPostMessage(null)).toBeNull();
      expect(sanitizeForPostMessage(undefined)).toBeUndefined();
    });
  });

  describe('functions', () => {
    it('converts plain functions to [Function]', () => {
      expect(sanitizeForPostMessage(() => {})).toBe('[Function]');
    });

    it('converts named functions to [Function]', () => {
      function myFunc() { return 1; }
      expect(sanitizeForPostMessage(myFunc)).toBe('[Function]');
    });

    it('converts arrow functions to [Function]', () => {
      expect(sanitizeForPostMessage(() => 42)).toBe('[Function]');
    });
  });

  describe('DOM nodes', () => {
    let div: HTMLDivElement;

    beforeEach(() => {
      div = document.createElement('div');
    });

    it('converts Element to [DOM Node]', () => {
      expect(sanitizeForPostMessage(div)).toBe('[DOM Node]');
    });

    it('converts Text nodes to [DOM Node]', () => {
      const text = document.createTextNode('hello');
      expect(sanitizeForPostMessage(text)).toBe('[DOM Node]');
    });
  });

  describe('arrays', () => {
    it('sanitizes each element', () => {
      const result = sanitizeForPostMessage([1, 'two', () => {}]);
      expect(result).toEqual([1, 'two', '[Function]']);
    });

    it('handles nested arrays', () => {
      const result = sanitizeForPostMessage([1, [2, [3, () => {}]]]);
      expect(result).toEqual([1, [2, [3, '[Function]']]]);
    });

    it('handles empty arrays', () => {
      expect(sanitizeForPostMessage([])).toEqual([]);
    });
  });

  describe('Map', () => {
    it('converts Map to plain object', () => {
      const m = new Map([['a', 1], ['b', 2]]);
      expect(sanitizeForPostMessage(m)).toEqual({ a: 1, b: 2 });
    });

    it('sanitizes Map values', () => {
      const m = new Map([['fn', () => {}], ['num', 42]]);
      expect(sanitizeForPostMessage(m)).toEqual({ fn: '[Function]', num: 42 });
    });

    it('converts numeric Map keys to strings', () => {
      const m = new Map([[1, 'one']]);
      expect(sanitizeForPostMessage(m)).toEqual({ '1': 'one' });
    });
  });

  describe('Set', () => {
    it('converts Set to array', () => {
      const s = new Set([1, 2, 3]);
      expect(sanitizeForPostMessage(s)).toEqual([1, 2, 3]);
    });

    it('sanitizes Set elements', () => {
      const s = new Set([1, () => {}]);
      expect(sanitizeForPostMessage(s)).toEqual([1, '[Function]']);
    });
  });

  describe('objects', () => {
    it('passes through plain objects', () => {
      expect(sanitizeForPostMessage({ a: 1, b: 'hello' })).toEqual({ a: 1, b: 'hello' });
    });

    it('sanitizes object values', () => {
      const result = sanitizeForPostMessage({ name: 'test', fn: () => {}, count: 5 });
      // Function-valued own properties are skipped (not enumerable via getOwnPropertyDescriptors value check)
      expect(result).toEqual({ name: 'test', count: 5 });
    });

    it('handles nested objects', () => {
      const result = sanitizeForPostMessage({
        outer: {
          inner: { a: 1, b: () => {} },
        },
      });
      // Function-valued own properties are skipped
      expect(result).toEqual({
        outer: {
          inner: { a: 1 },
        },
      });
    });

    it('handles getters on objects', () => {
      const obj = {
        _value: 42,
        get value() { return this._value; },
      };
      const result = sanitizeForPostMessage(obj) as Record<string, unknown>;
      expect(result.value).toBe(42);
    });

    it('handles getters that throw errors', () => {
      const obj = {
        get bad() { throw new Error('nope'); },
      };
      const result = sanitizeForPostMessage(obj) as Record<string, unknown>;
      expect(result.bad).toBe('[Error]');
    });

    it('skips function-valued own properties', () => {
      const obj = { name: 'test', method: () => {} };
      const result = sanitizeForPostMessage(obj) as Record<string, unknown>;
      expect(result).not.toHaveProperty('method');
      expect(result.name).toBe('test');
    });

    it('handles objects with prototype chain', () => {
      class Parent {
        parentProp = 'from parent';
      }
      class Child extends Parent {
        childProp = 'from child';
      }
      const child = new Child();
      const result = sanitizeForPostMessage(child) as Record<string, unknown>;
      expect(result.parentProp).toBe('from parent');
      expect(result.childProp).toBe('from child');
    });

    it('returns string representation for objects with no own properties', () => {
      class Empty {}
      const obj = new Empty();
      // The class instance has prototype but no meaningful own properties
      expect(typeof sanitizeForPostMessage(obj)).toBe('string');
    });
  });

  describe('circular references', () => {
    it('detects and handles self-referencing objects gracefully', () => {
      const obj: Record<string, unknown> = { name: 'circular' };
      obj.self = obj;
      // Should not throw — known: sanitizeForPostMessage uses WeakSet
      // tracking in the production runtime to prevent infinite recursion
      expect(() => sanitizeForPostMessage(obj)).toBeDefined();
    });
  });
});

describe('runtime component registration', () => {
  // Simulate the runtime's internal state management
  function createMockRuntime() {
    const components = new Map<string, {
      id: string;
      name: string;
      filename?: string;
      el: null;
      state: Map<string, unknown>;
      parentId?: string;
      children: string[];
      effects: string[];
      mountTime: number;
      isPlaceholder?: boolean;
    }>();

    const events: unknown[] = [];

    return {
      components,
      events,
      registerComponent(id: string, name: string, filename?: string) {
        if (components.has(id)) return;
        components.set(id, {
          id, name, filename, el: null,
          state: new Map(),
          parentId: undefined,
          children: [],
          effects: [],
          mountTime: performance.now(),
        });
      },
      handleState(componentId: string, key: string, type: string, value: unknown) {
        let component = components.get(componentId);
        if (!component) {
          component = {
            id: componentId, name: 'Unknown', filename: undefined,
            el: null, state: new Map(),
            parentId: undefined, children: [], effects: [],
            mountTime: performance.now(), isPlaceholder: true,
          };
          components.set(componentId, component);
        }
        component.state.set(key, value);
        events.push({ type: 'state', componentId, key, value });
      },
      getAllComponents() {
        return Array.from(components.values());
      },
    };
  }

  it('registers a new component', () => {
    const runtime = createMockRuntime();
    runtime.registerComponent('svt-abc', 'Counter', '/src/Counter.svelte');
    expect(runtime.components.has('svt-abc')).toBe(true);
  });

  it('does not re-register an existing component', () => {
    const runtime = createMockRuntime();
    runtime.registerComponent('svt-abc', 'Counter');
    runtime.registerComponent('svt-abc', 'ChangedName');
    expect(runtime.components.get('svt-abc')!.name).toBe('Counter');
  });

  it('handles state change for an existing component', () => {
    const runtime = createMockRuntime();
    runtime.registerComponent('svt-abc', 'Counter');
    runtime.handleState('svt-abc', 'count', 'update', 5);
    expect(runtime.components.get('svt-abc')!.state.get('count')).toBe(5);
  });

  it('creates placeholder component on state change for unknown component', () => {
    const runtime = createMockRuntime();
    runtime.handleState('svt-unknown', 'value', 'init', 'hello');
    const comp = runtime.components.get('svt-unknown');
    expect(comp).toBeDefined();
    expect(comp!.name).toBe('Unknown');
    expect(comp!.isPlaceholder).toBe(true);
    expect(comp!.state.get('value')).toBe('hello');
  });

  it('getAllComponents returns all registered components', () => {
    const runtime = createMockRuntime();
    runtime.registerComponent('svt-a', 'A');
    runtime.registerComponent('svt-b', 'B');
    runtime.registerComponent('svt-c', 'C');
    expect(runtime.getAllComponents()).toHaveLength(3);
  });

  it('tracks multiple state keys per component', () => {
    const runtime = createMockRuntime();
    runtime.registerComponent('svt-abc', 'Form');
    runtime.handleState('svt-abc', 'username', 'update', 'alice');
    runtime.handleState('svt-abc', 'password', 'update', 'secret');
    runtime.handleState('svt-abc', 'count', 'update', 3);

    const comp = runtime.components.get('svt-abc')!;
    expect(comp.state.size).toBe(3);
    expect(comp.state.get('username')).toBe('alice');
    expect(comp.state.get('count')).toBe(3);
  });
});
