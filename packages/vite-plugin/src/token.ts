/**
 * Per-run API token for the Svelte DevTools agent HTTP API (ADR-0009).
 *
 * The token is generated once per dev-server run, printed to the terminal,
 * and injected into the prebuilt panel HTML so the client can send it on
 * every request. Scripts and agents may set SVELTE_DEVTOOLS_TOKEN to reuse
 * a stable value across runs.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

let cachedToken: string | null = null;

function generateToken(): string {
    return randomBytes(32).toString('hex');
}

/** Resolve the per-run token, preferring SVELTE_DEVTOOLS_TOKEN when set. */
export function getDevtoolsToken(): string {
    if (!cachedToken) {
        const envToken = process.env.SVELTE_DEVTOOLS_TOKEN;
        cachedToken = envToken && envToken.trim().length > 0 ? envToken.trim() : generateToken();
    }
    return cachedToken;
}

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/**
 * True when the request carries the per-run token, either as an
 * `Authorization: Bearer <token>` header or as a `?token=<token>` query
 * parameter. The query form exists for navigator.sendBeacon, which cannot
 * set custom headers.
 */
export function isAuthorized(req: IncomingMessage): boolean {
    const expected = getDevtoolsToken();
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        if (safeEqual(header.slice('Bearer '.length), expected)) return true;
    }
    const rawUrl = req.url || '';
    const qIndex = rawUrl.indexOf('?');
    if (qIndex >= 0) {
        const params = new URLSearchParams(rawUrl.slice(qIndex + 1));
        const queryToken = params.get('token');
        if (queryToken && safeEqual(queryToken, expected)) return true;
    }
    return false;
}

/** Test-only hook: drop the cached token so the next read re-evaluates the environment. */
export function resetDevtoolsToken(): void {
    cachedToken = null;
}
