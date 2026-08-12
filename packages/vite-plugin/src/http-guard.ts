/**
 * Host and Origin allow-listing for the Svelte DevTools HTTP API (ADR-0009).
 *
 * Wildcard CORS and unvalidated Host headers are never acceptable. Origins
 * are reflected only when the request's Origin matches a strict allow-list
 * (localhost/127.0.0.1/[::1] on any port, plus user-configured origins).
 * Host headers must resolve to a local hostname or a configured host,
 * which blunts DNS rebinding before any handler runs.
 */

import type { ServerResponse } from 'node:http';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

let configuredOrigins: readonly string[] = [];
let configuredHosts: readonly string[] = [];

function parseEnvList(name: string): string[] {
    const raw = process.env[name];
    return raw
        ? raw.split(',').map(s => s.trim()).filter(Boolean)
        : [];
}

/** Set the user-configured origin/host allow-lists from plugin options. */
export function configureHttpGuards(options: { allowedOrigins?: readonly string[]; allowedHosts?: readonly string[] }): void {
    configuredOrigins = [...(options.allowedOrigins ?? [])];
    configuredHosts = [...(options.allowedHosts ?? [])];
}

function allowedOrigins(): readonly string[] {
    return [...configuredOrigins, ...parseEnvList('SVELTE_DEVTOOLS_ALLOWED_ORIGINS')];
}

function allowedHosts(): readonly string[] {
    return [...configuredHosts, ...parseEnvList('SVELTE_DEVTOOLS_ALLOWED_HOSTS')];
}

/** Extract the hostname from a Host header, stripping any port (IPv6-safe). */
export function hostnameFromHostHeader(host: string): string {
    if (host.startsWith('[')) {
        const end = host.indexOf(']');
        return end > 0 ? host.slice(1, end) : host;
    }
    return host.split(':')[0];
}

/** True for localhost/127.0.0.1/[::1] hosts and configured hosts. */
export function isAllowedHost(host: string | undefined): boolean {
    if (!host) return false;
    const hostname = hostnameFromHostHeader(host);
    return LOCAL_HOSTNAMES.has(hostname) || allowedHosts().includes(hostname);
}

/**
 * True for http(s) origins on localhost/127.0.0.1/[::1] (any port) and
 * for explicitly configured origins.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return false;
    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        if (LOCAL_HOSTNAMES.has(parsed.hostname)) return true;
        return allowedOrigins().includes(origin);
    } catch {
        return false;
    }
}

export function sendForbiddenHost(res: ServerResponse): void {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Forbidden host' }));
}

export function sendUnauthorized(res: ServerResponse): void {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
}
