interface ServerEvent {
    id: string;
    type: string;
    timestamp: number;
    duration?: number;
    data: unknown;
}

const serverEvents: ServerEvent[] = [];

// Dedup: track seen event IDs to prevent duplicate processing
const seenIds = new Map<string, number>();
const SEEN_CLEANUP_INTERVAL = 60_000; // 1 minute
const SEEN_MAX_AGE = 300_000; // 5 minutes

// Periodically clean old seen IDs to prevent memory leaks
const seenCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of seenIds) {
        if (now - timestamp > SEEN_MAX_AGE) {
            seenIds.delete(key);
        }
    }
}, SEEN_CLEANUP_INTERVAL);
if (seenCleanup.unref) seenCleanup.unref();
const MAX_EVENTS = 1000;

export function addServerEvent(event: ServerEvent): void {
    serverEvents.push(event);
    if (serverEvents.length < MAX_EVENTS) return;
    serverEvents.splice(0, serverEvents.length - MAX_EVENTS);
}

export function getServerEvents(opts?: { last?: number; sinceId?: string }): ServerEvent[] {
    if (opts?.sinceId) {
        const idx = serverEvents.findIndex(e => e.id === opts.sinceId);
        if (idx !== -1) return serverEvents.slice(idx + 1);
    }
    if (opts?.last && opts.last > 0) {
        return serverEvents.slice(-opts.last);
    }
    return serverEvents.slice();
}

export function clearServerEvents(): void {
    serverEvents.length = 0;
}
