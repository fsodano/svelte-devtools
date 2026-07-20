/**
 * Shared types for Svelte DevTools
 * 
 * These types are used across packages:
 * - vite-plugin: builds the transform metadata
 * - instrumentation: stores component instances
 * - client: displays the UI
 */

// ============================================================================
// Component Types
// ============================================================================

/**
 * Metadata about a component stored in the build-time registry.
 * Injected into each .svelte file by the Vite plugin.
 */
export interface ComponentMeta {
  id: string;
  name: string;
  filename: string;
  runeCounts?: Record<string, number>;
  migrationResult?: {
    filename: string;
    maxScore: number;
    actualScore: number;
    percentage: number;
    patterns: Array<{
      svelte4: string;
      svelte5: string;
      weight: number;
      migrated: boolean;
      detected: boolean;
    }>;
  };
}

/**
 * Complete component instance tracked at runtime.
 * Used by the instrumentation and exposed via __SVELTE_DEVTOOLS__ API.
 * 
 * In flat mode (getAllComponents): children are string IDs.
 * In tree mode (getComponentTree): children are nested ComponentInstance objects.
 */
export interface ComponentInstance {
  id: string;
  name: string;
  filename?: string;
  el: Element | null;
  parentId?: string;
  children: string[] | ComponentInstance[];
  state: Map<string, unknown>;
  props: Record<string, unknown>;
  effects: string[];
  mountTime: number;
  isPlaceholder?: boolean;
}

/**
 * Component data sent to the UI client.
 * Serializable version of ComponentInstance for iframe communication.
 */
export interface ComponentNode {
  id: string;
  name: string;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  children: string[];
  parentId?: string;
  filename?: string;
  renderDuration?: number;
  sourceLocation?: SourceLocation;
}

/**
 * Source code location for "open in editor" functionality.
 */
export interface SourceLocation {
  filename: string;
  line: number;
  column: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Types of events that flow through the system.
 */
export type EventType = 
  | 'component:mount'
  | 'component:unmount'
  | 'state:change'
  | 'effect:run'
  | 'trace:trigger';

/**
 * Base event structure.
 */
export interface BaseEvent {
  id: string;
  timestamp: number;
}

/**
 * Component mount event.
 */
export interface ComponentMountEvent extends BaseEvent {
  type: 'component:mount';
  data: ComponentNode;
  duration?: number;
}

/**
 * Component unmount event.
 */
export interface ComponentUnmountEvent extends BaseEvent {
  type: 'component:unmount';
  data: { id: string; name?: string };
}

/**
 * State change event.
 */
export interface StateChangeEvent extends BaseEvent {
  type: 'state:change';
  data: {
    componentId: string;
    key: string;
    value: unknown;
  };
}

/**
 * Effect run event.
 */
export interface EffectRunEvent extends BaseEvent {
  type: 'effect:run';
  data: {
    effectName?: string;
    dependencies?: string[];
    duration?: number;
  };
  duration?: number;
}

/**
 * Trace trigger event.
 */
export interface TraceTriggerEvent extends BaseEvent {
  type: 'trace:trigger';
  data: {
    componentId: string;
    componentName: string;
    stateKey: string;
    trigger: string;
  };
}

/**
 * Timeline entry in the UI.
 */
export interface TimelineEntry {
  id: string;
  type: EventType;
  timestamp: number;
  data: unknown;
  duration?: number;
}

// ============================================================================
// Event Payload Types (for bridge communication)
// ============================================================================

/** Payload for component:mount event */
export interface ComponentMountPayload {
  id: string;
  name: string;
  props?: Record<string, unknown>;
  state?: Record<string, unknown>;
  children?: string[];
  parentId?: string;
  filename?: string;
  renderDuration?: number;
}

/** Payload for component:unmount event */
export interface ComponentUnmountPayload {
  id: string;
  name?: string;
}

/** Payload for state:change event */
export interface StateChangePayload {
  componentId: string;
  key: string;
  value: unknown;
  prevValue?: unknown;
}

/** Payload for effect:run event */
export interface EffectRunPayload {
  effectName?: string;
  dependencies?: string[];
  duration?: number;
}

// ============================================================================
// Bridge Types
// ============================================================================

/**
 * Message sent via postMessage between main window and iframe.
 */
export interface BridgeMessage<T = unknown> {
  source: 'svelte-devtools';
  type: EventType | string;
  payload: T;
  timestamp: number;
}

/**
 * Bridge event handler function.
 */
export type BridgeHandler<T = unknown> = (payload: T) => void;

// ============================================================================
// API Types
// ============================================================================

/**
 * Public API exposed on window.__SVELTE_DEVTOOLS__
 */
export interface SvelteDevToolsAPI {
  version: string;
  enabled: boolean;
  getComponentTree(): ComponentInstance[];
  getAllComponents(): ComponentInstance[];
  getComponentById(id: string): ComponentInstance | undefined;
  getTimeline(): TimelineEntry[];
  subscribe(callback: (event: unknown) => void): () => void;
  trace(name: string, dependencies: string[]): void;
}

/**
 * State change handler type.
 */
export type StateChangeHandler = (
  componentId: string,
  variable: string,
  type: 'init' | 'update',
  value: unknown
) => void;

// ============================================================================
// Agent API Types
// ============================================================================

export interface AgentResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  timestamp: number;
}

/**
 * Options for the Vite plugin.
 */
export interface SvelteDevToolsPluginOptions {
  /** Enable state inspection via $inspect injection (default: true) */
  enableStateInspection?: boolean;
  /** File patterns to include (default: [/\.svelte$/]) */
  include?: RegExp[];
  /** File patterns to exclude (default: [/node_modules/]) */
  exclude?: RegExp[];
}

/**
 * State declaration found during AST traversal.
 */
export interface StateDeclaration {
  key: string;
  injectPos: number;
  isClassInstance: boolean;
}

// ============================================================================
// Runtime Package Types (v3.0)
// ============================================================================

/**
 * Rune call event from runtime package.
 */
export interface RuneCall {
  type: 'state' | 'derived' | 'effect' | 'effect.pre' | 'props' | 'bindable' | 'inspect' | 'snapshot' | 'untrack' | 'raw' | 'trace:trigger';
  componentId: string;
  componentName: string;
  key?: string;
  value?: unknown;
  prevValue?: unknown;
  dependencies?: string[];
  duration?: number;
  timestamp: number;
  stack?: string;
  stateKey?: string;
  trigger?: string;
}

/**
 * Component info from runtime package.
 * Note: Different from ComponentInstance (instrumentation package).
 */
export interface ComponentInfo {
  id: string;
  name: string;
  props: Record<string, unknown>;
  timestamp: number;
  parentId?: string;
  children: string[];
  renderDuration?: number;
  domElement?: Element;
  filename?: string;
  sourceLocation?: SourceLocation;
}


// ============================================================================
// Re-export constants
// ============================================================================

export * from './constants.js';