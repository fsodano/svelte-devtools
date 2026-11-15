/**
 * The runtime object exposed on `window.__SVELTE_DEVTOOLS_RUNTIME__`.
 *
 * The Vite plugin injects the runtime module itself. Calls that happen before
 * the module loads are buffered by the injected code in
 * `window.__SVELTE_DEVTOOLS_QUEUE__`, not by a placeholder runtime.
 */

import type { ComponentInstance } from '@fsodano/svelte-devtools-types';

export interface GlobalRuntime {
  version: string;

  /** Initialize the runtime. Called once when the module loads. */
  init(): void;

  /** Track a component mount. Called by the injected code. */
  registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void;

  /** Track a component unmount. Called by the injected destroy hook. */
  unregisterComponent(id: string): void;

  /** Record a state change. Called by the injected `$inspect` hook. */
  handleState(componentId: string, key: string, type: string, value: unknown): void;

  /** Record an effect run. Called by the injected code. */
  handleEffect(componentId: string, key: string, runeName: string, filename: string): void;

  /** Register a per-key setter so the panel can restore a value into a live rune. */
  _registerState(componentId: string, key: string, setter: (v: unknown) => void): void;

  /** Apply a state value. Used by time travel restore and acknowledged live edits. */
  setComponentState(componentId: string, key: string, value: unknown): void;

  /** Report an error from the application. */
  reportError(componentId: string, error: unknown): void;

  /** Force a DOM re-scan for missed components. */
  refresh(): void;

  /** Batch markers used around a snapshot restore. */
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;

  /** Emit an event to the panel. */
  emit(event: Record<string, unknown>): void;

  /** Internal state and the tracked components. */
  getState(): { registry: unknown; connected: boolean; components: Map<string, unknown> };
  getAllComponents(): ComponentInstance[];

  /** Per-component setters, keyed by component ID and state key. */
  _registerStateStore: Map<string, Map<string, (v: unknown) => void>>;
}

declare global {
  interface Window {
    __SVELTE_DEVTOOLS_RUNTIME__: GlobalRuntime;
  }
}
