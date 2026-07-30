import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWindowBridge } from '../../packages/client/src/lib/bridge/window-bridge.js';

describe('createWindowBridge', () => {
  let messageHandlers: Set<(event: MessageEvent) => void>;
  let mockParent: Record<string, any>;
  let bridge: ReturnType<typeof createWindowBridge>;
  let originalParent: any;

  beforeEach(() => {
    vi.useFakeTimers();
    messageHandlers = new Set();

    // Save and override window.parent so the bridge's iframe path is active
    originalParent = window.parent;

    // Create a mock parent that captures addEventListener calls for message routing
    mockParent = {
      addEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.add(handler);
      }),
      removeEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.delete(handler);
      }),
    };

    Object.defineProperty(window, 'parent', {
      value: mockParent,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    // Restore original window.parent
    Object.defineProperty(window, 'parent', {
      value: originalParent,
      configurable: true,
      writable: true,
    });
    delete (window as any).__SVELTE_DEVTOOLS__;
  });

  /** Helper: simulate a postMessage event from the runtime */
  function simulateMessage(data: Record<string, unknown>) {
    const event = new MessageEvent('message', { data });
    messageHandlers.forEach((h) => h(event));
  }

  // ─── Basic API ──────────────────────────────────────────────────────────────

  describe('basic API', () => {
    beforeEach(() => {
      bridge = createWindowBridge();
    });

    it('returns an object with on() and refresh() methods', () => {
      expect(bridge).toHaveProperty('on');
      expect(bridge).toHaveProperty('refresh');
      expect(typeof bridge.on).toBe('function');
      expect(typeof bridge.refresh).toBe('function');
    });

    it('on() registers a handler and returns an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = bridge.on('state:change', handler);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  // ─── Message Handling ──────────────────────────────────────────────────────

  describe('message handling', () => {
    beforeEach(() => {
      bridge = createWindowBridge();
    });

    it('fires registered handler when a postMessage with source svelte-devtools is received', () => {
      const handler = vi.fn();
      bridge.on('state:change', handler);

      simulateMessage({ source: 'svelte-devtools', type: 'state', payload: { value: 42 } });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('ignores messages with other sources', () => {
      const handler = vi.fn();
      bridge.on('state:change', handler);

      simulateMessage({ source: 'other-extension', type: 'state', payload: { value: 42 } });

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores messages with null data', () => {
      const handler = vi.fn();
      bridge.on('state:change', handler);

      const event = new MessageEvent('message', { data: null });
      messageHandlers.forEach((h) => h(event));

      expect(handler).not.toHaveBeenCalled();
    });

    it('multiple handlers for the same type all fire', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bridge.on('state:change', handler1);
      bridge.on('state:change', handler2);

      simulateMessage({ source: 'svelte-devtools', type: 'state', payload: { value: 42 } });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('handler errors do not affect other handlers', () => {
      const throwingHandler = vi.fn(() => {
        throw new Error('handler error');
      });
      const normalHandler = vi.fn();
      bridge.on('state:change', throwingHandler);
      bridge.on('state:change', normalHandler);

      expect(() => {
        simulateMessage({ source: 'svelte-devtools', type: 'state', payload: { value: 42 } });
      }).not.toThrow();

      expect(throwingHandler).toHaveBeenCalledTimes(1);
      expect(normalHandler).toHaveBeenCalledTimes(1);
    });

    it('after unsubscribing, the handler no longer fires', () => {
      const handler = vi.fn();
      const unsubscribe = bridge.on('state:change', handler);
      unsubscribe();

      simulateMessage({ source: 'svelte-devtools', type: 'state', payload: { value: 42 } });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── refresh() ──────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    beforeEach(() => {
      mockParent.__SVELTE_DEVTOOLS__ = {
        refresh: vi.fn(),
        getAllComponents: vi.fn().mockReturnValue([]),
      };
      bridge = createWindowBridge();
    });

    it('calls parent window __SVELTE_DEVTOOLS__.refresh() if available', () => {
      bridge.refresh();
      expect(mockParent.__SVELTE_DEVTOOLS__.refresh).toHaveBeenCalledTimes(1);
    });

    it('does nothing when parent window has no __SVELTE_DEVTOOLS__', () => {
      delete mockParent.__SVELTE_DEVTOOLS__;
      const bridgeWithoutApi = createWindowBridge();

      expect(() => bridgeWithoutApi.refresh()).not.toThrow();
    });

    it('fires mount events for components returned by getAllComponents', () => {
      const mountHandler = vi.fn();
      bridge.on('component:mount', mountHandler);

      mockParent.__SVELTE_DEVTOOLS__.getAllComponents = vi.fn().mockReturnValue([
        {
          id: 'svt-001',
          name: 'App',
          el: null,
          children: [],
          state: new Map([['count', 0]]),
          props: {},
          effects: [],
          mountTime: Date.now(),
        },
      ]);

      bridge.refresh();

      expect(mountHandler).toHaveBeenCalledTimes(1);
      expect(mountHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svt-001', name: 'App' }),
      );
    });

    it('does not fire duplicate mount events for the same component on subsequent calls', () => {
      const mountHandler = vi.fn();
      bridge.on('component:mount', mountHandler);

      const component = {
        id: 'svt-001',
        name: 'App',
        el: null,
        children: [],
        state: new Map(),
        props: {},
        effects: [],
        mountTime: Date.now(),
      };

      mockParent.__SVELTE_DEVTOOLS__.getAllComponents = vi.fn().mockReturnValue([component]);

      bridge.refresh();
      expect(mountHandler).toHaveBeenCalledTimes(1);

      // Second call with the same component set should not fire again
      bridge.refresh();
      expect(mountHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Polling ────────────────────────────────────────────────────────────────

  describe('polling', () => {
    it('polls for parent __SVELTE_DEVTOOLS__ every 100ms via connect interval', () => {
      mockParent.__SVELTE_DEVTOOLS__ = {
        getAllComponents: vi.fn().mockReturnValue([]),
        refresh: vi.fn(),
      };

      bridge = createWindowBridge();

      // First interval tick at 100ms should find __SVELTE_DEVTOOLS__
      vi.advanceTimersByTime(100);

      expect(mockParent.__SVELTE_DEVTOOLS__.getAllComponents).toHaveBeenCalled();
    });

    it('fires mount events when __SVELTE_DEVTOOLS__ becomes available during polling', () => {
      bridge = createWindowBridge();
      const mountHandler = vi.fn();
      bridge.on('component:mount', mountHandler);

      // Advance past a few ticks without __SVELTE_DEVTOOLS__
      vi.advanceTimersByTime(250);

      // Now make the API available
      mockParent.__SVELTE_DEVTOOLS__ = {
        getAllComponents: vi.fn().mockReturnValue([
          {
            id: 'svt-001',
            name: 'Counter',
            el: null,
            children: [],
            state: new Map([['count', 0]]),
            props: {},
            effects: [],
            mountTime: Date.now(),
          },
        ]),
        refresh: vi.fn(),
      };

      // Next connect interval tick at 300ms picks it up
      vi.advanceTimersByTime(100);

      expect(mockParent.__SVELTE_DEVTOOLS__.getAllComponents).toHaveBeenCalled();
      expect(mountHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svt-001', name: 'Counter' }),
      );
    });

    it('stops connect polling after 5000ms timeout', () => {
      bridge = createWindowBridge();
      const mountHandler = vi.fn();
      bridge.on('component:mount', mountHandler);

      // Let the connect interval run for 5000ms — no __SVELTE_DEVTOOLS__ found
      vi.advanceTimersByTime(5000);

      // After the timeout, the connect interval should be cleared.
      // Make __SVELTE_DEVTOOLS__ available now.
      mockParent.__SVELTE_DEVTOOLS__ = {
        getAllComponents: vi.fn().mockReturnValue([
          {
            id: 'svt-001',
            name: 'LateComponent',
            el: null,
            children: [],
            state: new Map(),
            props: {},
            effects: [],
            mountTime: Date.now(),
          },
        ]),
        refresh: vi.fn(),
      };

      // The 500ms syncComponents interval is still active, so it should pick
      // up the newly available API within 500ms.
      vi.advanceTimersByTime(500);

      // getAllComponents should have been called by syncComponents
      expect(mockParent.__SVELTE_DEVTOOLS__.getAllComponents).toHaveBeenCalled();
      expect(mountHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svt-001', name: 'LateComponent' }),
      );
    });

    it('periodically re-syncs components via the 500ms interval after connection', () => {
      mockParent.__SVELTE_DEVTOOLS__ = {
        getAllComponents: vi.fn().mockReturnValue([]),
        refresh: vi.fn(),
      };

      bridge = createWindowBridge();

      // Connect interval fires at 100ms and calls syncComponents (1st call)
      vi.advanceTimersByTime(100);
      expect(mockParent.__SVELTE_DEVTOOLS__.getAllComponents).toHaveBeenCalledTimes(1);

      // Advance to the first 500ms syncComponents tick (at 500ms total)
      vi.advanceTimersByTime(400);
      expect(mockParent.__SVELTE_DEVTOOLS__.getAllComponents).toHaveBeenCalledTimes(2);

      // Advance to the second 500ms tick (at 1000ms total)
      vi.advanceTimersByTime(500);
      expect(mockParent.__SVELTE_DEVTOOLS__.getAllComponents).toHaveBeenCalledTimes(3);
    });
  });
});
