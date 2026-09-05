/** JSON-safe inspection data. This is a preview, never a value to restore blindly. */
export function toDisplayValue(value: unknown, ancestors = new Set<object>()): unknown {
    if (typeof value === 'function') return '[Function]';
    if (value === undefined) return undefined;
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'symbol') return '[Symbol]';
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    if (Object.is(value, -0)) return '-0';
    if (value === null || typeof value !== 'object') return value;
    if (ancestors.has(value)) return '[Circular]';
    ancestors.add(value);
    try {
        if (typeof Node !== 'undefined' && value instanceof Node) return '[DOM Node]';
        if (Array.isArray(value)) {
            const descriptors = Object.getOwnPropertyDescriptors(value);
            return Array.from({ length: value.length }, (_, index) => {
                const descriptor = descriptors[String(index)];
                if (!descriptor) return '[undefined]';
                if (!('value' in descriptor)) return '[Getter]';
                return descriptor.value === undefined ? '[undefined]' : toDisplayValue(descriptor.value, ancestors);
            });
        }
        // Built-in methods avoid application-defined string conversion hooks.
        try {
            const entries = [...Map.prototype.entries.call(value)];
            return { type: 'Map', entries: entries.map(([key, item]) => [toDisplayValue(key, ancestors), toDisplayValue(item, ancestors)]) };
        } catch { /* Not a Map. */ }
        try {
            const values = [...Set.prototype.values.call(value)];
            return { type: 'Set', values: values.map(item => toDisplayValue(item, ancestors)) };
        } catch { /* Not a Set. */ }
        const output: Record<string, unknown> = Object.create(null);
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
            if (!descriptor.enumerable) continue;
            output[key] = 'value' in descriptor ? toDisplayValue(descriptor.value, ancestors) : '[Getter]';
        }
        return output;
    } catch { return '[Unavailable]'; }
    finally { ancestors.delete(value); }
}
