import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandBroker } from '../../packages/vite-plugin/src/command-broker.js';

afterEach(() => vi.useRealTimers());

describe('live command broker', () => {
    const command = { sessionId: 'panel-a', componentId: 'counter:1', key: 'count', value: 2 };
    it('targets one session, delivers once and requires its acknowledgement', async () => {
        const broker = new CommandBroker();
        broker.poll('panel-a', 'http://localhost/app');
        broker.poll('panel-b', 'http://localhost/other');
        const result = broker.submit(command);
        expect(broker.poll('panel-b', '')).toEqual([]);
        const [delivered] = broker.poll('panel-a', '');
        expect(delivered).toMatchObject(command);
        expect(broker.poll('panel-a', '')).toEqual([]);
        expect(broker.acknowledge('panel-b', delivered.id, { ok: true })).toBe(false);
        expect(broker.acknowledge('panel-a', delivered.id, { ok: true, value: 2, recording: true })).toBe(true);
        expect(await result).toEqual({ ok: true, value: 2, recording: true });
        expect(broker.acknowledge('panel-a', delivered.id, { ok: true })).toBe(false);
    });

    it('rejects absent and expired sessions without queuing mutations', async () => {
        vi.useFakeTimers();
        const broker = new CommandBroker();
        expect(await broker.submit(command)).toMatchObject({ ok: false });
        broker.poll('panel-a', '');
        vi.advanceTimersByTime(5001);
        expect(broker.listSessions()).toEqual([]);
        expect(await broker.submit(command)).toMatchObject({ ok: false });
        expect(broker.poll('panel-a', '')).toEqual([]);
    });

    it.each([false, true])('reports timeout outcome accurately (delivered=%s)', async delivered => {
        vi.useFakeTimers();
        const broker = new CommandBroker(100);
        broker.poll('panel-a', '');
        const result = broker.submit(command);
        if (delivered) broker.poll('panel-a', '');
        await vi.advanceTimersByTimeAsync(101);
        expect(await result).toMatchObject({ ok: false, error: expect.stringContaining(delivered ? 'OUTCOME_UNKNOWN' : 'COMMAND_NOT_DELIVERED') });
        expect(broker.poll('panel-a', '')).toEqual([]);
    });

    it('returns runtime errors without claiming success', async () => {
        const broker = new CommandBroker();
        broker.poll('panel-a', '');
        const result = broker.submit(command);
        const [delivered] = broker.poll('panel-a', '');
        broker.acknowledge('panel-a', delivered.id, { ok: false, error: 'Read-only state' });
        expect(await result).toEqual({ ok: false, error: 'Read-only state' });
    });
});
