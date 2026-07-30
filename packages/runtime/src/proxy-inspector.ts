/**
 * SvelteProxyInspector
 * 
 * Recursively unwraps Svelte 5 reactive Proxy objects into serializable plain objects.
 * Handles circular references (via WeakSet tracking), depth limits, and filtering
 * of internal Svelte framework symbols.
 */
export class SvelteProxyInspector {
  private visited = new WeakSet<object>();
  private depth = 0;
  private readonly MAX_DEPTH = 10;

  /**
   * Inspect a value, resolving Svelte 5 proxies recursively.
   * Returns a plain serializable object.
   */
  inspect(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'function') return '[Function]';
    if (typeof value !== 'object') return value;
    if (value instanceof Element || value instanceof Node) return '[DOM Node]';
    
    // Guard circular references
    if (this.visited.has(value as object)) return '[Circular]';
    
    // Depth limit
    if (this.depth >= this.MAX_DEPTH) return '[Max Depth]';
    
    this.visited.add(value as object);
    this.depth++;

    try {
      // Handle arrays
      if (Array.isArray(value)) {
        return value.map(item => this.inspect(item));
      }

      // Handle Map
      if (value instanceof Map) {
        const result: Record<string, unknown> = {};
        value.forEach((v, k) => {
          result[String(k)] = this.inspect(v);
        });
        return result;
      }

      // Handle Set
      if (value instanceof Set) {
        return Array.from(value).map(v => this.inspect(v));
      }

      // Handle Date
      if (value instanceof Date) {
        return value.toISOString();
      }

      // Handle RegExp
      if (value instanceof RegExp) {
        return value.toString();
      }

      // Handle Error
      if (value instanceof Error) {
        return { message: value.message, name: value.name, stack: value.stack };
      }

      // Handle Promise
      if (value instanceof Promise) {
        return '[Promise]';
      }

      // Generic object (handles Svelte proxies transparently)
      const result: Record<string, unknown> = {};
      
      // Collect property descriptors from the entire prototype chain
      const props = new Set<string>();
      let proto = Object.getPrototypeOf(value);
      // Skip Object.prototype and its descendants
      const ownKeys = [
        ...Object.getOwnPropertyNames(value),
        ...Object.getOwnPropertySymbols(value),
      ];
      
      for (const key of ownKeys) {
        props.add(String(key));
      }
      
      // Also walk up prototype chain for getters
      while (proto && proto !== Object.prototype) {
        const protoKeys = Object.getOwnPropertyNames(proto);
        for (const key of protoKeys) {
          props.add(key);
        }
        proto = Object.getPrototypeOf(proto);
      }

      for (const key of props) {
        // Skip internal Svelte symbols
        if (key.startsWith('$$') || key === '__svelte_meta' || key.startsWith('__svelte')) continue;
        if (key === '__SVELTE_DEVTOOLS_RUNTIME__' || key === '__SVELTE_DEVTOOLS_REGISTRY__') continue;

        try {
          const desc = Object.getOwnPropertyDescriptor(value, key) || 
                       this.getDescriptorFromPrototype(value, key);
          if (!desc) continue;

          if (desc.get) {
            // Getter — call it safely
            const val = desc.get.call(value);
            result[key] = this.inspect(val);
          } else if ('value' in desc) {
            if (typeof desc.value !== 'function') {
              result[key] = this.inspect(desc.value);
            }
          }
        } catch {
          // Skip properties that throw on access
          result[key] = '[Unavailable]';
        }
      }

      // If we got nothing, try string coercion
      if (Object.keys(result).length === 0) {
        return String(value);
      }

      return result;
    } finally {
      this.depth--;
    }
  }

  /**
   * Get a property descriptor from the prototype chain.
   */
  private getDescriptorFromPrototype(obj: object, key: string): PropertyDescriptor | undefined {
    let proto = Object.getPrototypeOf(obj);
    while (proto && proto !== Object.prototype) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) return desc;
      proto = Object.getPrototypeOf(proto);
    }
    return undefined;
  }
}

/**
 * Apply a value to a target state Map via a dot-notated path.
 * Creates intermediate Maps for missing path segments.
 * 
 * Example:
 *   mutateRuntimeState(stateMap, 'user.address.city', 'NYC')
 *   → stateMap.get('user') is a Map, .get('address') is a Map, .set('city', 'NYC')
 */
export function mutateRuntimeState(
  state: Map<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  
  if (parts.length === 1) {
    state.set(parts[0], value);
    return;
  }

  // Navigate/create intermediate Maps
  let current: Map<string, unknown> = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!current.has(key) || !(current.get(key) instanceof Map)) {
      current.set(key, new Map());
    }
    const next = current.get(key);
    if (next instanceof Map) {
      current = next;
    } else {
      // If it's not a Map, can't navigate further — overwrite
      return;
    }
  }

  // Set the final value
  current.set(parts[parts.length - 1], value);
}
