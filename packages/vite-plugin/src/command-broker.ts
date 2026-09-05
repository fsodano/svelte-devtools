import { randomUUID } from 'node:crypto';

export interface StateCommand {
    id: string;
    sessionId: string;
    componentId: string;
    key: string;
    value: unknown;
}
export interface CommandResult {
    ok: boolean;
    error?: string;
    value?: unknown;
    recording?: boolean;
}

/** A command is delivered once. A timeout never implies that retrying is safe. */
export class CommandBroker {
    private sessions = new Map<string, { lastSeen: number; url: string }>();
    private pending = new Map<string, {
        command: StateCommand;
        delivered: boolean;
        finish: (result: CommandResult) => void;
    }>();

    constructor(private timeoutMs = 5000) {}

    listSessions() {
        for (const [id, session] of this.sessions) {
            if (Date.now() - session.lastSeen > 5000) this.sessions.delete(id);
        }
        return [...this.sessions].map(([id, session]) => ({ id, ...session }));
    }

    poll(sessionId: string, url: string): StateCommand[] {
        this.listSessions();
        if (!this.sessions.has(sessionId) && this.sessions.size >= 64) throw new Error('Too many panel sessions');
        this.sessions.set(sessionId, { lastSeen: Date.now(), url });
        const commands: StateCommand[] = [];
        for (const item of this.pending.values()) {
            if (item.command.sessionId === sessionId && !item.delivered) {
                item.delivered = true;
                commands.push(item.command);
                break; // A failed acknowledgement cannot strand other delivered commands.
            }
        }
        return commands;
    }

    submit(input: Omit<StateCommand, 'id'>): Promise<CommandResult> {
        if (!this.listSessions().some(s => s.id === input.sessionId)) {
            return Promise.resolve({ ok: false, error: 'SESSION_UNAVAILABLE: open the Svelte panel and choose a session from status.' });
        }
        if (this.pending.size >= 64) return Promise.resolve({ ok: false, error: 'COMMAND_QUEUE_FULL' });
        const command = { ...input, id: randomUUID() };
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                const delivered = this.pending.get(command.id)?.delivered;
                this.pending.delete(command.id);
                resolve({ ok: false, error: delivered
                    ? 'OUTCOME_UNKNOWN: the panel received the command but did not acknowledge it. Inspect live state before retrying.'
                    : 'COMMAND_NOT_DELIVERED: the panel did not receive the command.' });
            }, this.timeoutMs);
            this.pending.set(command.id, { command, delivered: false, finish: result => {
                clearTimeout(timer);
                this.pending.delete(command.id);
                resolve(result);
            } });
        });
    }

    acknowledge(sessionId: string, id: string, result: CommandResult): boolean {
        const item = this.pending.get(id);
        if (!item?.delivered || item.command.sessionId !== sessionId) return false;
        item.finish(result);
        return true;
    }
}

const brokers = new WeakMap<object, CommandBroker>();
export function getCommandBroker(server: object): CommandBroker {
    let broker = brokers.get(server);
    if (!broker) { broker = new CommandBroker(); brokers.set(server, broker); }
    return broker;
}
