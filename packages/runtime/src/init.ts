/**
 * Runtime Init — Passive Buffer Queue
 *
 * Tiny inline script injected at the top of the HTML page (before any component code).
 * Creates a safe `__SVELTE_DEVTOOLS_RUNTIME__` global with a call buffer,
 * so injected $inspect hooks never crash — even if the full runtime hasn't loaded yet.
 *
 * Pattern inspired by __REACT_DEVTOOLS_GLOBAL_HOOK__:
 *   Phase 1 (init): Create dummy queue — zero logic, zero deps, instant.
 *   Phase 2 (buffer): Injected $inspect calls push into the queue safely.
 *   Phase 3 (activate): Full runtime loads, drains queue, overrides methods.
 */

import type {
  ComponentInstance,
  SvelteDevToolsAPI,
  RuneCall,
} from '@svelte-devtools/types';

export interface BufferedCall {
  method: string;
  args: unknown[];
}

export interface GlobalRuntime {
  /** Buffered calls from Phases 1-2, drained in Phase 3 */
  _queue: BufferedCall[];
  /** True once the full runtime has activated (Phase 3) */
  _active: boolean;

  // Phase 1-2 placeholders (queue if !_active, pass-through if _active)
  registerComponent(id: string, name: string, filename: string, sourceLocation?: string): void;
  handleState(
    componentId: string,
    key: string,
    type: string,
    value: unknown,
  ): void;
  handleEffect(
    componentId: string,
    key: string,
    runeName: string,
    filename: string,
  ): void;
  _registerState(
    componentId: string,
    key: string,
    setter: (v: unknown) => void,
  ): void;
  setComponentState(componentId: string, key: string, value: unknown): void;
  reportError(componentId: string, error: unknown): void;
  refresh(): void;
  startInspectBatch(): void;
  endInspectBatch(): void;
  flushAllEffects(): void;

  // Phase 3: called by the full runtime to drain buffered calls
  _activate(realRuntime: Pick<GlobalRuntime, 'registerComponent' | 'handleState' | 'handleEffect' | '_registerState' | 'setComponentState' | 'reportError' | 'refresh' | 'startInspectBatch' | 'endInspectBatch' | 'flushAllEffects'>): void;

  version: string;
  init(): void;
  emit(event: Record<string, unknown>): void;
  getState(): { registry: unknown; connected: boolean; components: Map<string, unknown> };
  getAllComponents(): ComponentInstance[];
  _registerStateStore: Map<string, Map<string, (v: unknown) => void>>;
}

declare global {
  interface Window {
    __SVELTE_DEVTOOLS_RUNTIME__: GlobalRuntime;
  }
}

function makePlaceholder(method: string): (...args: unknown[]) => void {
  return function (this: GlobalRuntime, ...args: unknown[]): void {
    if (this._active) {
      // Shouldn't happen — overridden by _activate — but safe no-op
      return;
    }
    this._queue.push({ method, args });
  };
}

export function createPassiveRuntime(): GlobalRuntime {
  const runtime: GlobalRuntime = {
    _queue: [],
    _active: false,

    // Placeholder methods — buffer all calls until _activate
    registerComponent: makePlaceholder('registerComponent') as GlobalRuntime['registerComponent'],
    handleState: makePlaceholder('handleState') as GlobalRuntime['handleState'],
    handleEffect: makePlaceholder('handleEffect') as GlobalRuntime['handleEffect'],
    _registerState: makePlaceholder('_registerState') as GlobalRuntime['_registerState'],
    setComponentState: makePlaceholder('setComponentState') as GlobalRuntime['setComponentState'],
    reportError: makePlaceholder('reportError') as GlobalRuntime['reportError'],
    refresh: makePlaceholder('refresh') as GlobalRuntime['refresh'],
    startInspectBatch: makePlaceholder('startInspectBatch') as GlobalRuntime['startInspectBatch'],
    endInspectBatch: makePlaceholder('endInspectBatch') as GlobalRuntime['endInspectBatch'],
    flushAllEffects: makePlaceholder('flushAllEffects') as GlobalRuntime['flushAllEffects'],

    version: '0.0.1',
    init: () => {},
    emit: () => {},
    getState: () => ({ registry: null, connected: false, components: new Map() }),
    getAllComponents: () => [],
    _registerStateStore: new Map(),

    _activate(realRuntime) {
      if (this._active) return;
      this._active = true;

      // Override placeholder methods with real implementations
      this.registerComponent = realRuntime.registerComponent.bind(realRuntime);
      this.handleState = realRuntime.handleState.bind(realRuntime);
      this.handleEffect = realRuntime.handleEffect.bind(realRuntime);
      this._registerState = realRuntime._registerState.bind(realRuntime);
      this.setComponentState = realRuntime.setComponentState.bind(realRuntime);
      this.reportError = realRuntime.reportError.bind(realRuntime);
      this.refresh = realRuntime.refresh.bind(realRuntime);
      this.startInspectBatch = realRuntime.startInspectBatch.bind(realRuntime);
      this.endInspectBatch = realRuntime.endInspectBatch.bind(realRuntime);
      this.flushAllEffects = realRuntime.flushAllEffects.bind(realRuntime);

      // Drain buffered calls in FIFO order
      const queue = this._queue;
      this._queue = [];

      for (const call of queue) {
        try {
          switch (call.method) {
            case 'registerComponent':
              this.registerComponent(...call.args as [string, string, string, string?]);
              break;
            case 'handleState':
              this.handleState(...call.args as [string, string, string, unknown]);
              break;
            case 'handleEffect':
              this.handleEffect(...call.args as [string, string, string, string]);
              break;
            case '_registerState':
              this._registerState(...call.args as [string, string, (v: unknown) => void]);
              break;
            case 'setComponentState':
              this.setComponentState(...call.args as [string, string, unknown]);
              break;
            case 'reportError':
              this.reportError(...call.args as [string, unknown]);
              break;
            case 'refresh':
              this.refresh();
              break;
            case 'startInspectBatch':
              this.startInspectBatch();
              break;
            case 'endInspectBatch':
              this.endInspectBatch();
              break;
            case 'flushAllEffects':
              this.flushAllEffects();
              break;
          }
        } catch (e) {
          // Drain errors must never crash the app
          console.warn('[Svelte DevTools] Error draining buffered call:', call.method, e);
        }
      }
    },
  };

  return runtime;
}

/**
 * Serialize the init script as a minified inline string for HTML injection.
 * This is what the Vite plugin injects into the page head.
 */
export function getInitScript(): string {
  return `<script id="__svelte-devtools-init">
(function(){
  if(window.__SVELTE_DEVTOOLS_RUNTIME__) return;
  var _q=[],_active=false;
  function _b(m){return function(){if(_active)return;_q.push({method:m,args:Array.from(arguments)});};}
  window.__SVELTE_DEVTOOLS_RUNTIME__={
    _queue:_q,_active:_active,
    registerComponent:_b('registerComponent'),
    handleState:_b('handleState'),
    handleEffect:_b('handleEffect'),
    _registerState:_b('_registerState'),
    setComponentState:_b('setComponentState'),
    reportError:_b('reportError'),
    refresh:_b('refresh'),
    version:'0.0.1',
    init:function(){},
    emit:function(){},
    getState:function(){return{registry:null,connected:false,components:new Map()};},
    getAllComponents:function(){return[];},
    _registerStateStore:new Map(),
    _activate:function(real){
      if(_active)return;
      _active=true;this._active=true;
      var q=_q;_q=[];
      var methods=['registerComponent','handleState','handleEffect','_registerState','setComponentState','reportError','refresh','startInspectBatch','endInspectBatch','flushAllEffects'];
      for(var i=0;i<methods.length;i++){var m=methods[i];this[m]=real[m].bind(real);}
      for(var j=0;j<q.length;j++){try{var c=q[j];switch(c.method){
        case'registerComponent':this.registerComponent(c.args[0],c.args[1],c.args[2],c.args[3]);break;
        case'handleState':this.handleState(c.args[0],c.args[1],c.args[2],c.args[3]);break;
        case'handleEffect':this.handleEffect(c.args[0],c.args[1],c.args[2],c.args[3]);break;
        case'_registerState':this._registerState(c.args[0],c.args[1],c.args[2]);break;
        case'setComponentState':this.setComponentState(c.args[0],c.args[1],c.args[2]);break;
        case'reportError':this.reportError(c.args[0],c.args[1]);break;
        case'refresh':this.refresh();break;
        case'startInspectBatch':this.startInspectBatch();break;
        case'endInspectBatch':this.endInspectBatch();break;
        case'flushAllEffects':this.flushAllEffects();break;
      }}catch(e){console.warn('[Svelte DevTools] drain error:',e);}}
    }
  };
})();
</script>`;
}
