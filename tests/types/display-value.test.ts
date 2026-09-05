import { expect, it, vi } from 'vitest';
import { toDisplayValue } from '../../packages/types/src/display-value.js';

it('does not invoke array accessors or custom iterators while inspecting values', () => {
    const getter = vi.fn(() => { throw new Error('Application getter invoked'); });
    const iterator = vi.fn(() => { throw new Error('Application iterator invoked'); });
    const value = [1, 2, undefined];
    Object.defineProperty(value, '1', { get: getter, enumerable: true });
    Object.defineProperty(value, Symbol.iterator, { value: iterator });
    expect(toDisplayValue(value)).toEqual([1, '[Getter]', '[undefined]']);
    expect(getter).not.toHaveBeenCalled();
    expect(iterator).not.toHaveBeenCalled();
});
