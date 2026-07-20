import { describe, it, expect, beforeEach } from 'vitest';
import { addServerEvent, getServerEvents, clearServerEvents } from '../../packages/vite-plugin/src/server-events.js';

function makeEvent(id: string, type = 'test', data: unknown = {}): Parameters<typeof addServerEvent>[0] {
    return { id, type, timestamp: Date.now(), data };
}

describe('server-events', () => {
    beforeEach(() => {
        clearServerEvents();
    });

    describe('addServerEvent', () => {
        it('adds an event and returns it via getServerEvents', () => {
            addServerEvent(makeEvent('evt-1'));
            const events = getServerEvents();
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({ id: 'evt-1', type: 'test' });
        });

        it('caps at 1000 events', () => {
            for (let i = 0; i < 1100; i++) {
                addServerEvent(makeEvent(`evt-${i}`));
            }
            const events = getServerEvents();
            expect(events).toHaveLength(1000);
            // First event should be evt-100 (1100 - 1000 = 100)
            expect(events[0].id).toBe('evt-100');
            // Last event should be evt-1099
            expect(events[999].id).toBe('evt-1099');
        });

        it('adds events in insertion order', () => {
            addServerEvent(makeEvent('first'));
            addServerEvent(makeEvent('second'));
            addServerEvent(makeEvent('third'));
            const events = getServerEvents();
            expect(events.map(e => e.id)).toEqual(['first', 'second', 'third']);
        });

        it('preserves optional duration field', () => {
            addServerEvent({ id: 'd1', type: 'request', timestamp: 1000, duration: 42, data: {} });
            const events = getServerEvents();
            expect(events[0].duration).toBe(42);
        });
    });

    describe('getServerEvents', () => {
        it('returns all events when called with no arguments', () => {
            addServerEvent(makeEvent('a'));
            addServerEvent(makeEvent('b'));
            addServerEvent(makeEvent('c'));
            expect(getServerEvents()).toHaveLength(3);
        });

        it('returns a copy (mutations do not affect internal state)', () => {
            addServerEvent(makeEvent('x'));
            const events = getServerEvents();
            events.length = 0;
            expect(getServerEvents()).toHaveLength(1);
        });

        it('returns last N events with { last: 5 }', () => {
            for (let i = 0; i < 20; i++) {
                addServerEvent(makeEvent(`evt-${i}`));
            }
            const last5 = getServerEvents({ last: 5 });
            expect(last5).toHaveLength(5);
            expect(last5[0].id).toBe('evt-15');
            expect(last5[4].id).toBe('evt-19');
        });

        it('returns events after sinceId', () => {
            for (let i = 0; i < 20; i++) {
                addServerEvent(makeEvent(`evt-${i}`));
            }
            const after15 = getServerEvents({ sinceId: 'evt-15' });
            expect(after15).toHaveLength(4);
            expect(after15[0].id).toBe('evt-16');
            expect(after15[3].id).toBe('evt-19');
        });

        it('returns all events when sinceId is not found', () => {
            addServerEvent(makeEvent('evt-1'));
            addServerEvent(makeEvent('evt-2'));
            const result = getServerEvents({ sinceId: 'evt-999' });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toEqual(['evt-1', 'evt-2']);
        });

        it('returns empty array when no events and last is set', () => {
            const result = getServerEvents({ last: 5 });
            expect(result).toEqual([]);
        });

        it('returns empty array when no events and sinceId is set', () => {
            const result = getServerEvents({ sinceId: 'evt-1' });
            expect(result).toEqual([]);
        });

        it('sinceId takes precedence over last', () => {
            for (let i = 0; i < 20; i++) {
                addServerEvent(makeEvent(`evt-${i}`));
            }
            const result = getServerEvents({ sinceId: 'evt-10', last: 2 });
            // sinceId returns everything after evt-10, ignoring last
            expect(result).toHaveLength(9);
            expect(result[0].id).toBe('evt-11');
        });
    });

    describe('clearServerEvents', () => {
        it('clears all events', () => {
            addServerEvent(makeEvent('a'));
            addServerEvent(makeEvent('b'));
            clearServerEvents();
            expect(getServerEvents()).toEqual([]);
        });

        it('is idempotent', () => {
            clearServerEvents();
            clearServerEvents();
            expect(getServerEvents()).toEqual([]);
        });

        it('allows adding events after clear', () => {
            addServerEvent(makeEvent('before'));
            clearServerEvents();
            addServerEvent(makeEvent('after'));
            const events = getServerEvents();
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('after');
        });
    });

    describe('edge cases', () => {
        it('handles undefined opts', () => {
            addServerEvent(makeEvent('a'));
            addServerEvent(makeEvent('b'));
            expect(getServerEvents(undefined)).toHaveLength(2);
        });

        it('handles empty opts object', () => {
            addServerEvent(makeEvent('a'));
            expect(getServerEvents({})).toHaveLength(1);
        });

        it('handles negative last by returning all events', () => {
            addServerEvent(makeEvent('a'));
            addServerEvent(makeEvent('b'));
            const result = getServerEvents({ last: -1 });
            expect(result).toHaveLength(2);
        });

        it('handles zero last by returning all events', () => {
            addServerEvent(makeEvent('a'));
            addServerEvent(makeEvent('b'));
            const result = getServerEvents({ last: 0 });
            expect(result).toHaveLength(2);
        });

        it('handles last larger than total events', () => {
            addServerEvent(makeEvent('only-one'));
            const result = getServerEvents({ last: 100 });
            expect(result).toHaveLength(1);
        });
    });

    describe('concurrent safety', () => {
        it('concurrent adds do not lose events', () => {
            const count = 100;
            for (let i = 0; i < count; i++) {
                addServerEvent(makeEvent(`concurrent-${i}`));
            }
            expect(getServerEvents()).toHaveLength(count);
        });

        it('addEvent + clear + addEvent sequence preserves correct count', () => {
            for (let i = 0; i < 5; i++) {
                addServerEvent(makeEvent(`batch1-${i}`));
            }
            clearServerEvents();
            for (let i = 0; i < 5; i++) {
                addServerEvent(makeEvent(`batch2-${i}`));
            }
            const events = getServerEvents();
            expect(events).toHaveLength(5);
            expect(events[0].id).toBe('batch2-0');
            expect(events[4].id).toBe('batch2-4');
        });

        it('multiple clear + add cycles work correctly', () => {
            for (let cycle = 0; cycle < 10; cycle++) {
                for (let i = 0; i < 10; i++) {
                    addServerEvent(makeEvent(`cycle${cycle}-evt${i}`));
                }
                expect(getServerEvents()).toHaveLength(10);
                clearServerEvents();
                expect(getServerEvents()).toHaveLength(0);
            }
        });
    });
});
