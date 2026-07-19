/**
 * Centralized constants for Svelte DevTools
 * Eliminates magic strings throughout the codebase
 */

// ============================================================================
// Event Types
// ============================================================================

export const EVENT_TYPES = {
  COMPONENT_MOUNT: 'component:mount',
  COMPONENT_UNMOUNT: 'component:unmount',
  STATE_CHANGE: 'state:change',
  EFFECT_RUN: 'effect:run',
  TRACE_TRIGGER: 'trace:trigger',
  RUNTIME_READY: 'runtime:ready',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// ============================================================================
// Rune Types
// ============================================================================

export const RUNE_TYPES = {
  STATE: 'state',
  DERIVED: 'derived',
  EFFECT: 'effect',
  EFFECT_PRE: 'effect.pre',
  PROPS: 'props',
  BINDABLE: 'bindable',
  INSPECT: 'inspect',
  SNAPSHOT: 'snapshot',
  UNTRACK: 'untrack',
  RAW: 'raw',
  TRACE_TRIGGER: 'trace:trigger',
  COMPONENT_REGISTER: 'component-register',
  RUNTIME_READY: 'runtime-ready',
} as const;

export type RuneType = typeof RUNE_TYPES[keyof typeof RUNE_TYPES];

// ============================================================================
// RPC Method Names
// ============================================================================

export const RPC_METHODS = {
  GET_COMPONENTS: 'svelte-devtools:get-components',
  OPEN_IN_EDITOR: 'svelte-devtools:open-in-editor',
  GET_TIMELINE: 'svelte-devtools:get-timeline',
  GET_STATE: 'svelte-devtools:get-state',
  MIGRATION_SCORE: 'svelte-devtools:migration-score',
  BUILD_STATUS: 'svelte-devtools:build-status',
  COMPONENT_STATE: 'svelte-devtools:component-state',
  RESCAN: 'svelte-devtools:rescan',
} as const;

export type RpcMethod = typeof RPC_METHODS[keyof typeof RPC_METHODS];

// ============================================================================
// RPC Method Types
// ============================================================================

export const RPC_TYPES = {
  QUERY: 'query',
  MUTATION: 'mutation',
} as const;

export type RpcType = typeof RPC_TYPES[keyof typeof RPC_TYPES];

// ============================================================================
// Data Attributes
// ============================================================================

export const DATA_ATTRIBUTES = {
  COMPONENT_ID: 'data-svelte-devtools-id',
  COMPONENT_NAME: 'data-svelte-component',
} as const;

// ============================================================================
// DevTools Dock Configuration
// ============================================================================

export const DOCK_CONFIG = {
  ID: 'svelte-devtools',
  TITLE: 'Svelte',
  ICON: 'simple-icons:svelte',
  TYPE: 'iframe' as const,
  URL: '/__svelte-devtools/',
};

// ============================================================================
// Component ID Prefix
// ============================================================================

export const COMPONENT_ID_PREFIX = 'svt-';

// ============================================================================
// Limits
// ============================================================================

export const LIMITS = {
  MAX_TIMELINE_EVENTS: 1000,
  MAX_STATE_SNAPSHOTS: 50,
  VIRTUAL_SCROLL_THRESHOLD: 100,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map runtime event types to bridge event types
 */
export function mapRuntimeEventTypeToBridge(type: RuneType | string): EventType | string {
  switch (type) {
    case RUNE_TYPES.STATE:
    case RUNE_TYPES.DERIVED:
    case RUNE_TYPES.INSPECT:
      return EVENT_TYPES.STATE_CHANGE;
    case RUNE_TYPES.EFFECT:
    case RUNE_TYPES.EFFECT_PRE:
      return EVENT_TYPES.EFFECT_RUN;
    case RUNE_TYPES.PROPS:
    case RUNE_TYPES.BINDABLE:
    case RUNE_TYPES.COMPONENT_REGISTER:
      return EVENT_TYPES.COMPONENT_MOUNT;
    case RUNE_TYPES.TRACE_TRIGGER:
      return EVENT_TYPES.TRACE_TRIGGER;
    case RUNE_TYPES.RUNTIME_READY:
      return EVENT_TYPES.RUNTIME_READY;
    default:
      return type;
  }
}
