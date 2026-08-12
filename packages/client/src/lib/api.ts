/**
 * Token-aware HTTP helpers for the DevTools panel (ADR-0009).
 *
 * The plugin injects the per-run API token into the prebuilt panel HTML as
 * `window.__SVELTE_DEVTOOLS_TOKEN__`. Every fetch attaches it as an
 * `Authorization: Bearer` header; navigator.sendBeacon cannot set headers, so
 * beacon URLs carry it as a `?token=` query parameter instead.
 */

const TOKEN_KEY = '__SVELTE_DEVTOOLS_TOKEN__' as const;

function getToken(): string {
  const raw = (globalThis as Record<string, unknown>)[TOKEN_KEY];
  return typeof raw === 'string' ? raw : '';
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${getToken()}`);
  return fetch(url, { ...init, headers });
}

export function beaconUrl(url: string): string {
  const token = getToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
