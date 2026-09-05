import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPassiveRuntime,
  getInitScript,
} from '../../packages/runtime/src/init.js';
import type { GlobalRuntime } from '../../packages/runtime/src/init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock object that satisfies the _activate parameter shape.
 * vi.fn() returns Mock instances that are structurally incompatible with
 * the strict function-typed Pick<>, so callers cast at the call-site.
 */
function createMockRealRuntime() {
  return {
    registerComponent: vi.fn(),
    handleState: vi.fn(),
    handleEffect: vi.fn(),
    _registerState: vi.fn(),
    setComponentState: vi.fn(),
    reportError: vi.fn(),
    refresh: vi.fn(),
    startInspectBatch: vi.fn(),
    endInspectBatch: vi.fn(),
    flushAllEffects: vi.fn(),
  };
}

/**
 * Activate with a mock runtime, returning it for assertion.
 * Casts the mock to the expected Pick<> type to avoid TS incompatibility
 * between vi.fn()'s Mock and the strict function signatures.
 */
function activateWithMock(
  runtime: GlobalRuntime,
  mock?: ReturnType<typeof createMockRealRuntime>,
): ReturnType<typeof createMockRealRuntime> {
  const real = mock ?? createMockRealRuntime();
  runtime._activate(real as Parameters<GlobalRuntime['_activate']>[0]);
  return real;
}

/** Strip the surrounding <script> tags and eval just the JS body. */
function evalInitScript(): void {
  const js = getInitScript().replace(/<\/?script[^>]*>/g, '');
  (0, eval)(js);
}

/** Access a window property with a loose function type for the eval'd script. */
const loose = (rt: GlobalRuntime) =>
  rt as unknown as Record<string, (...args: unknown[]) => void>;

// ---------------------------------------------------------------------------
// Tests — createPassiveRuntime
// ---------------------------------------------------------------------------

describe('createPassiveRuntime', () => {
  let runtime: GlobalRuntime;

  beforeEach(() => {
    runtime = createPassiveRuntime();
  });

  describe('structure', () => {
    it('returns an object with _queue, _active, version, and all methods', () => {
      expect(runtime).toBeInstanceOf(Object);
      expect(runtime).toHaveProperty('_queue');
      expect(runtime).toHaveProperty('_active');
      expect(runtime).toHaveProperty('version');

      const methodNames = [
        'registerComponent',
        'handleState',
        'handleEffect',
        '_registerState',
        'setComponentState',
        'reportError',
        'refresh',
        'startInspectBatch',
        'endInspectBatch',
        'flushAllEffects',
        '_activate',
        'init',
        'emit',
        'getState',
        'getAllComponents',
      ] as const;

      for (const name of methodNames) {
        expect(typeof runtime[name]).toBe('function');
      }
    });

    it('starts with _active = false and _queue = []', () => {
      expect(runtime._active).toBe(false);
      expect(runtime._queue).toEqual([]);
    });

    it('has version "0.2.2"', () => {
      expect(runtime.version).toBe('0.2.2');
    });

    it('getAllComponents() returns []', () => {
      expect(runtime.getAllComponents()).toEqual([]);
    });

    it('getState() returns expected shape', () => {
      const state = runtime.getState();
      expect(state).toEqual({
        registry: null,
        connected: false,
        components: expect.any(Map),
      });
    });
  });

  describe('placeholder buffering', () => {
    it('registerComponent queues { method, args } before activation', () => {
      runtime.registerComponent('svt-1', 'Counter', '/src/Counter.svelte', 'loc');
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'registerComponent',
        args: ['svt-1', 'Counter', '/src/Counter.svelte', 'loc'],
      });
    });

    it('handleState queues { method, args } before activation', () => {
      runtime.handleState('svt-1', 'count', 'update', 5);
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'handleState',
        args: ['svt-1', 'count', 'update', 5],
      });
    });

    it('handleEffect queues { method, args } before activation', () => {
      runtime.handleEffect('svt-1', 'count', '$state', 'file.svelte');
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'handleEffect',
        args: ['svt-1', 'count', '$state', 'file.svelte'],
      });
    });

    it('_registerState queues { method, args } before activation', () => {
      const setter = vi.fn();
      runtime._registerState('svt-1', 'count', setter);
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: '_registerState',
        args: ['svt-1', 'count', setter],
      });
    });

    it('setComponentState queues { method, args } before activation', () => {
      runtime.setComponentState('svt-1', 'count', 10);
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'setComponentState',
        args: ['svt-1', 'count', 10],
      });
    });

    it('reportError queues { method, args } before activation', () => {
      const err = new Error('test');
      runtime.reportError('svt-1', err);
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'reportError',
        args: ['svt-1', err],
      });
    });

    it('refresh queues { method, args } before activation', () => {
      runtime.refresh();
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'refresh',
        args: [],
      });
    });

    it('startInspectBatch queues { method, args } before activation', () => {
      runtime.startInspectBatch();
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'startInspectBatch',
        args: [],
      });
    });

    it('endInspectBatch queues { method, args } before activation', () => {
      runtime.endInspectBatch();
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'endInspectBatch',
        args: [],
      });
    });

    it('flushAllEffects queues { method, args } before activation', () => {
      runtime.flushAllEffects();
      expect(runtime._queue).toHaveLength(1);
      expect(runtime._queue[0]).toEqual({
        method: 'flushAllEffects',
        args: [],
      });
    });
  });

  describe('_activate', () => {
    it('sets _active to true', () => {
      activateWithMock(runtime);
      expect(runtime._active).toBe(true);
    });

    it('overrides placeholder methods — calls forward to real runtime', () => {
      const real = activateWithMock(runtime);

      runtime.registerComponent('test-id', 'Test', '/src/Test.svelte');

      const calls = real.registerComponent.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('test-id');
      expect(calls[0][1]).toBe('Test');
    });

    it('clears _queue after drain', () => {
      runtime.registerComponent('a', 'A', 'a.svelte');
      runtime.handleState('a', 'count', 'init', 0);
      runtime.registerComponent('b', 'B', 'b.svelte');
      expect(runtime._queue).toHaveLength(3);

      activateWithMock(runtime);

      expect(runtime._queue).toEqual([]);
    });

    it('executes drained calls in FIFO order', () => {
      runtime.registerComponent('a', 'A', 'a.svelte');
      runtime.handleState('a', 'count', 'init', 0);
      runtime.registerComponent('b', 'B', 'b.svelte');

      const real = activateWithMock(runtime);

      expect(real.registerComponent.mock.calls).toHaveLength(2);
      expect(real.handleState.mock.calls).toHaveLength(1);
      expect(real.registerComponent.mock.calls[0][0]).toBe('a');
      expect(real.handleState.mock.calls[0][0]).toBe('a');
      expect(real.registerComponent.mock.calls[1][0]).toBe('b');
    });

    it('drains all method types via the switch', () => {
      const setter = vi.fn();
      const err = new Error('e');

      runtime.registerComponent('a', 'A', 'a.svelte');
      runtime.handleState('a', 'k', 'init', 1);
      runtime.handleEffect('a', 'k', '$state', 'f.svelte');
      runtime._registerState('a', 'k', setter);
      runtime.setComponentState('a', 'k', 99);
      runtime.reportError('a', err);
      runtime.refresh();
      runtime.startInspectBatch();
      runtime.endInspectBatch();
      runtime.flushAllEffects();

      const real = activateWithMock(runtime);

      expect(real.registerComponent.mock.calls).toHaveLength(1);
      expect(real.handleState.mock.calls).toHaveLength(1);
      expect(real.handleEffect.mock.calls).toHaveLength(1);
      expect(real._registerState.mock.calls).toHaveLength(1);
      expect(real.setComponentState.mock.calls).toHaveLength(1);
      expect(real.reportError.mock.calls).toHaveLength(1);
      expect(real.refresh.mock.calls).toHaveLength(1);
      expect(real.startInspectBatch.mock.calls).toHaveLength(1);
      expect(real.endInspectBatch.mock.calls).toHaveLength(1);
      expect(real.flushAllEffects.mock.calls).toHaveLength(1);
    });

    it('is idempotent — second call is a no-op', () => {
      runtime.registerComponent('a', 'A', 'a.svelte');

      const real = activateWithMock(runtime);
      const localReg = real.registerComponent;

      activateWithMock(runtime);

      expect(runtime._active).toBe(true);
      expect(localReg.mock.calls).toHaveLength(1);
      expect(runtime.registerComponent).not.toBe(
        createMockRealRuntime().registerComponent,
      );
    });

    it('post-activation calls go to real runtime without queueing', () => {
      const real = activateWithMock(runtime);

      runtime.handleState('x', 'y', 'update', 42);

      expect(runtime._queue).toEqual([]);
      expect(real.handleState.mock.calls).toHaveLength(1);
      expect(real.handleState.mock.calls[0][0]).toBe('x');
      expect(real.handleState.mock.calls[0][1]).toBe('y');
      expect(real.handleState.mock.calls[0][2]).toBe('update');
      expect(real.handleState.mock.calls[0][3]).toBe(42);
    });

    it('drain errors are caught without throwing', () => {
      const real = createMockRealRuntime();
      real.registerComponent = vi.fn(() => {
        throw new Error('drain fail');
      });

      runtime.registerComponent('a', 'A', 'a.svelte');
      runtime.registerComponent('b', 'B', 'b.svelte');

      expect(() => activateWithMock(runtime, real)).not.toThrow();
      expect(real.registerComponent.mock.calls).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — getInitScript string content
// ---------------------------------------------------------------------------

describe('getInitScript', () => {
  it('returns a non-empty string', () => {
    const script = getInitScript();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('contains __SVELTE_DEVTOOLS_RUNTIME__', () => {
    expect(getInitScript()).toContain('__SVELTE_DEVTOOLS_RUNTIME__');
  });

  it('contains a <script tag', () => {
    expect(getInitScript()).toContain('<script');
  });

  it('contains a </script> closing tag', () => {
    expect(getInitScript()).toContain('</script>');
  });

  it('contains registerComponent', () => {
    expect(getInitScript()).toContain('registerComponent');
  });

  it('contains handleState', () => {
    expect(getInitScript()).toContain('handleState');
  });

  it('contains _activate', () => {
    expect(getInitScript()).toContain('_activate');
  });

  it('contains the id __svelte-devtools-init', () => {
    expect(getInitScript()).toContain('__svelte-devtools-init');
  });
});

// ---------------------------------------------------------------------------
// Tests — init script runtime behavior (eval'd)
// ---------------------------------------------------------------------------

describe('init script runtime behavior', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__SVELTE_DEVTOOLS_RUNTIME__;
  });

  it('creates window.__SVELTE_DEVTOOLS_RUNTIME__ when evaluated', () => {
    evalInitScript();

    const rt = window.__SVELTE_DEVTOOLS_RUNTIME__;
    expect(rt).toBeDefined();
    expect(rt._active).toBe(false);
    expect(Array.isArray(rt._queue)).toBe(true);
    expect(rt._queue).toHaveLength(0);
    expect(rt.version).toBe('0.2.2');
  });

  it('before activation, method calls queue up', () => {
    evalInitScript();

    const rt = window.__SVELTE_DEVTOOLS_RUNTIME__;
    loose(rt).registerComponent('test', 'Test');
    loose(rt).handleState('test', 'x', 'init', 42);

    expect(rt._queue).toHaveLength(2);
    expect(rt._queue[0]).toEqual({
      method: 'registerComponent',
      args: ['test', 'Test'],
    });
    expect(rt._queue[1]).toEqual({
      method: 'handleState',
      args: ['test', 'x', 'init', 42],
    });
  });

  it('after activation, queued calls drain and execute', () => {
    evalInitScript();

    const rt = window.__SVELTE_DEVTOOLS_RUNTIME__;
    loose(rt).registerComponent('a', 'A');
    loose(rt).handleState('a', 'count', 'init', 0);

    const real = createMockRealRuntime();
    rt._activate(real as Parameters<GlobalRuntime['_activate']>[0]);

    expect(rt._active).toBe(true);
    // The eval'd script's drain loop correctly calls the real runtime
    expect(real.registerComponent.mock.calls[0][0]).toBe('a');
    expect(real.handleState.mock.calls[0][0]).toBe('a');
  });

  it('does NOT redefine __SVELTE_DEVTOOLS_RUNTIME__ if already present', () => {
    const sentinel = { __custom: true };
    (window as unknown as Record<string, unknown>).__SVELTE_DEVTOOLS_RUNTIME__ =
      sentinel as never;

    evalInitScript();

    expect(window.__SVELTE_DEVTOOLS_RUNTIME__).toBe(sentinel);
    expect(
      (window.__SVELTE_DEVTOOLS_RUNTIME__ as unknown as Record<string, boolean>)
        .__custom,
    ).toBe(true);
  });
});
