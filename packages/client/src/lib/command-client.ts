import { apiFetch } from './api.js';

interface StateCommand { id: string; componentId: string; key: string; value: unknown }

/** Only the selected panel executes a mutation. Failed acknowledgements are not retried. */
export function startCommandClient(edit: (command: StateCommand) => Promise<unknown>, sessionId = crypto.randomUUID()): () => void {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
        try {
            const target = window.opener || window.parent;
            const query = new URLSearchParams({ sessionId, url: target.location.href });
            const response = await apiFetch(`/__svelte-devtools/api/commands?${query}`, { signal: controller.signal });
            if (!response.ok) return;
            const data = await response.json();
            for (const command of data.commands as StateCommand[]) {
                if (controller.signal.aborted) break;
                let result;
                try { result = { ok: true, value: await edit(command), recording: true }; }
                catch (error) { result = { ok: false, error: error instanceof Error ? error.message : 'State edit failed' }; }
                await apiFetch('/__svelte-devtools/api/commands/result', {
                    method: 'POST', signal: controller.signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, id: command.id, result }),
                });
            }
        } catch { /* Status exposes loss of connectivity. Never repeat a mutation. */ }
        finally { if (!controller.signal.aborted) timer = setTimeout(poll, 500); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
}
