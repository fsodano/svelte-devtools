import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWindowBridge } from '../../packages/client/src/lib/bridge/window-bridge.js';

const originalParent = window.parent;
let bridge: ReturnType<typeof createWindowBridge> | undefined;
afterEach(() => {
  bridge?.dispose();
  Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
  vi.useRealTimers();
});

it('releases parent listeners, polling timers, and subscribers when the panel closes', () => {
  vi.useFakeTimers();
  const handlers = new Set<EventListener>();
  const getAllComponents = vi.fn(() => []);
  const parent = {
    addEventListener: vi.fn((_type: string, listener: EventListener) => handlers.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: EventListener) => handlers.delete(listener)),
    __SVELTE_DEVTOOLS__: { getAllComponents },
  };
  Object.defineProperty(window, 'parent', { value: parent, configurable: true });
  bridge = createWindowBridge();
  const listener = vi.fn(); bridge.on('component:mount', listener);
  expect(handlers.size).toBe(2);
  vi.advanceTimersByTime(600);
  expect(getAllComponents).toHaveBeenCalled();
  const countBeforeClose = getAllComponents.mock.calls.length;
  window.dispatchEvent(new Event('pagehide'));
  expect(handlers.size).toBe(0);
  expect(parent.removeEventListener).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(10000);
  bridge.refresh();
  expect(getAllComponents).toHaveBeenCalledTimes(countBeforeClose);
  expect(listener).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  bridge.dispose(); expect(parent.removeEventListener).toHaveBeenCalledTimes(2);
});

it('retains the bridge when the page enters the back-forward cache', () => {
  vi.useFakeTimers();
  const removeEventListener = vi.fn();
  Object.defineProperty(window, 'parent', { value: { addEventListener: vi.fn(), removeEventListener }, configurable: true });
  bridge = createWindowBridge();
  const event = new Event('pagehide'); Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
  expect(removeEventListener).not.toHaveBeenCalled();
  bridge.dispose(); expect(removeEventListener).toHaveBeenCalledTimes(2);
});
