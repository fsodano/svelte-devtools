import { describe, it, expect } from 'vitest';
import {
  mapRuntimeEventTypeToBridge,
  RUNE_TYPES,
  EVENT_TYPES,
} from '../../packages/types/src/constants.js';

describe('mapRuntimeEventTypeToBridge', () => {
  describe('state change mappings', () => {
    it('maps RUNE_TYPES.STATE to EVENT_TYPES.STATE_CHANGE', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.STATE)).toBe(EVENT_TYPES.STATE_CHANGE);
    });

    it('maps RUNE_TYPES.DERIVED to EVENT_TYPES.STATE_CHANGE', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.DERIVED)).toBe(EVENT_TYPES.STATE_CHANGE);
    });

    it('maps RUNE_TYPES.INSPECT to EVENT_TYPES.STATE_CHANGE', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.INSPECT)).toBe(EVENT_TYPES.STATE_CHANGE);
    });
  });

  describe('effect run mappings', () => {
    it('maps RUNE_TYPES.EFFECT to EVENT_TYPES.EFFECT_RUN', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.EFFECT)).toBe(EVENT_TYPES.EFFECT_RUN);
    });

    it('maps RUNE_TYPES.EFFECT_PRE to EVENT_TYPES.EFFECT_RUN', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.EFFECT_PRE)).toBe(EVENT_TYPES.EFFECT_RUN);
    });
  });

  describe('component mount mappings', () => {
    it('maps RUNE_TYPES.PROPS to EVENT_TYPES.COMPONENT_MOUNT', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.PROPS)).toBe(EVENT_TYPES.COMPONENT_MOUNT);
    });

    it('maps RUNE_TYPES.BINDABLE to EVENT_TYPES.COMPONENT_MOUNT', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.BINDABLE)).toBe(EVENT_TYPES.COMPONENT_MOUNT);
    });

    it('maps RUNE_TYPES.COMPONENT_REGISTER to EVENT_TYPES.COMPONENT_MOUNT', () => {
      expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.COMPONENT_REGISTER)).toBe(EVENT_TYPES.COMPONENT_MOUNT);
    });
  });

  it('maps RUNE_TYPES.TRACE_TRIGGER to EVENT_TYPES.TRACE_TRIGGER', () => {
    expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.TRACE_TRIGGER)).toBe(EVENT_TYPES.TRACE_TRIGGER);
  });

  it('maps RUNE_TYPES.RUNTIME_READY to EVENT_TYPES.RUNTIME_READY', () => {
    expect(mapRuntimeEventTypeToBridge(RUNE_TYPES.RUNTIME_READY)).toBe(EVENT_TYPES.RUNTIME_READY);
  });

  it('passes unknown strings through unchanged', () => {
    expect(mapRuntimeEventTypeToBridge('unknown-event')).toBe('unknown-event');
    expect(mapRuntimeEventTypeToBridge('custom:event')).toBe('custom:event');
    expect(mapRuntimeEventTypeToBridge('')).toBe('');
  });
});
