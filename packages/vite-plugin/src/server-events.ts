interface ServerEvent {
    id: string;
    type: string;
    timestamp: number;
    duration?: number;
    data: unknown;
}

const defaultEvents: ServerEvent[] = [];
const stores = new WeakMap<object, ServerEvent[]>();
function eventsFor(owner?: object): ServerEvent[] {
    if (!owner) return defaultEvents;
    let events = stores.get(owner);
    if (!events) { events = []; stores.set(owner, events); }
    return events;
}

const MAX_EVENTS = 1000;

export function addServerEvent(event: ServerEvent, owner?: object): void {
    const serverEvents = eventsFor(owner);
    serverEvents.push(event);
    if (serverEvents.length < MAX_EVENTS) return;
    serverEvents.splice(0, serverEvents.length - MAX_EVENTS);
}

export function getServerEvents(opts?: { last?: number; sinceId?: string }, owner?: object): ServerEvent[] {
    const serverEvents = eventsFor(owner);
    if (opts?.sinceId) {
        const idx = serverEvents.findIndex(e => e.id === opts.sinceId);
        if (idx !== -1) return serverEvents.slice(idx + 1);
    }
    if (opts?.last && opts.last > 0) {
        return serverEvents.slice(-opts.last);
    }
    return serverEvents.slice();
}

export function clearServerEvents(owner?: object): void {
    eventsFor(owner).length = 0;
}
