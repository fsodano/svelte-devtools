import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { runtime } from '../../packages/runtime/src/index.js';

// Unit tests for the production runtime `handleEffect` method.
// They import the real module from packages/runtime/src/index.js.
// They replace the handleEffect replica that lived in tests/e2e/devtools.test.ts.

interface EffectValue {
  runeName: string;
  filename: string;
  runCount: number;
  observedState?: Record<string, unknown>;
}

interface EffectPayload {
  componentId: string;
  componentName: string;
  key: string;
  value: EffectValue;
  timestamp: number;
}

interface EffectMessage {
  source: string;
  type: 'effect';
  payload: EffectPayload;
}

// Type guard: does the posted message describe an effect run?
function isEffectMessage(message: unknown): message is EffectMessage {
  if (typeof message !== 'object' || message === null) return false;
  return (message as { type?: unknown }).type === 'effect';
}

let postSpy: MockInstance;

beforeEach(() => {
  postSpy = vi.spyOn(window, 'postMessage');
  runtime.getState().components.clear();
});

afterEach(() => {
  postSpy.mockRestore();
});

// Extract the payloads of all 'effect' messages posted so far.
function effectPayloads(): EffectPayload[] {
  return postSpy.mock.calls
    .map((call) => call[0])
    .filter(isEffectMessage)
    .map((message) => message.payload);
}

describe('runtime handleEffect', () => {
  it('emits an effect event for a registered component', () => {
    runtime.registerComponent('svt-counter', 'Counter', '/src/Counter.svelte');

    runtime.handleEffect('svt-counter', 'effect_0', '$effect', '/src/Counter.svelte');

    const payloads = effectPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].componentId).toBe('svt-counter');
    expect(payloads[0].componentName).toBe('Counter');
    expect(payloads[0].key).toBe('effect_0');
    expect(payloads[0].value.runeName).toBe('$effect');
    expect(payloads[0].value.filename).toBe('/src/Counter.svelte');
    expect(payloads[0].value.runCount).toBeGreaterThanOrEqual(1);
    expect(payloads[0].value.observedState).toBeUndefined();
    expect(typeof payloads[0].timestamp).toBe('number');
  });

  it('emits one effect event per run and reports the production run count', () => {
    runtime.registerComponent('svt-counter', 'Counter', '/src/Counter.svelte');

    runtime.handleEffect('svt-counter', 'effect_0', '$effect', '/src/Counter.svelte');
    runtime.handleEffect('svt-counter', 'effect_0', '$effect', '/src/Counter.svelte');
    runtime.handleEffect('svt-counter', 'effect_0', '$effect', '/src/Counter.svelte');

    const payloads = effectPayloads();
    expect(payloads).toHaveLength(3);

    // The runtime stores each effect key once and reports
    // count of matching entries plus one. Lock the observed value.
    expect(payloads.every((p) => p.value.runCount === 2)).toBe(true);

    const component = runtime.getAllComponents().find((c) => c.id === 'svt-counter');
    expect(component?.effects).toEqual(['effect_0']);
  });

  it('tracks distinct effect keys separately', () => {
    runtime.registerComponent('svt-multi', 'Multi', '/src/Multi.svelte');

    runtime.handleEffect('svt-multi', 'effect_0', '$effect', '/src/Multi.svelte');
    runtime.handleEffect('svt-multi', 'effect_1', '$effect.pre', '/src/Multi.svelte');

    expect(effectPayloads()).toHaveLength(2);
    const component = runtime.getAllComponents().find((c) => c.id === 'svt-multi');
    expect(component?.effects).toEqual(['effect_0', 'effect_1']);
  });

  it('includes the component state snapshot as observedState', () => {
    runtime.registerComponent('svt-stateful', 'Stateful', '/src/Stateful.svelte');
    runtime.handleState('svt-stateful', 'count', 'state', 5);

    runtime.handleEffect('svt-stateful', 'effect_0', '$effect', '/src/Stateful.svelte');

    const payloads = effectPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].value.observedState).toEqual({ count: 5 });
  });

  it('ignores effect runs for an unknown component', () => {
    runtime.handleEffect('svt-ghost', 'effect_0', '$effect', '/src/Ghost.svelte');

    expect(effectPayloads()).toHaveLength(0);
    expect(runtime.getAllComponents()).toHaveLength(0);
  });
});
