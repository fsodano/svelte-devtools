/** Whether a live value can be edited as JSON without silently discarding data. */
export function isJsonEditable(value: unknown, ancestors = new Set<object>()): boolean {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
    if (typeof value !== 'object' || ancestors.has(value)) return false;
    ancestors.add(value);
    try {
        const proto = Object.getPrototypeOf(value);
        // Accept plain objects from another same-origin window, but not class instances.
        if (!Array.isArray(value) && proto !== null && Object.getPrototypeOf(proto) !== null) return false;
        const keys = Reflect.ownKeys(value);
        if (Array.isArray(value)) {
            if (keys.length !== value.length + 1) return false; // holes or custom properties
        }
        for (const key of keys) {
            if (Array.isArray(value) && key === 'length') continue;
            if (typeof key !== 'string') return false;
            if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor?.enumerable || !('value' in descriptor) || !isJsonEditable(descriptor.value, ancestors)) return false;
        }
        return true;
    } catch { return false; }
    finally { ancestors.delete(value); }
}
