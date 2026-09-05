import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSourceLocation, getSourceLocation, openInEditor } from '../../packages/client/src/lib/open-in-editor.js';

afterEach(() => vi.unstubAllGlobals());

describe('source navigation', () => {
  it('opens filename-only components without inventing a source position', () => {
    const location = getSourceLocation({ filename: '/app/src/PokemonCard.svelte' });
    expect(location).toEqual({ filename: '/app/src/PokemonCard.svelte' });
    expect(formatSourceLocation(location!)).toBe('PokemonCard.svelte');
    expect(getSourceLocation({})).toBeUndefined();
  });

  it('prefers exact source metadata and supports Windows filenames', () => {
    const sourceLocation = { filename: 'C:\\app\\Card.svelte', line: 12, column: 0 };
    expect(getSourceLocation({ filename: 'Other.svelte', sourceLocation })).toBe(sourceLocation);
    expect(formatSourceLocation(sourceLocation)).toBe('Card.svelte:12:0');
  });

  it('sends the file and position through the authenticated endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('__SVELTE_DEVTOOLS_TOKEN__', 'test-token');
    await openInEditor('/app/Card.svelte', 12, 0);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/__svelte-devtools/open-in-editor');
    expect(init.headers.get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ file: '/app/Card.svelte', line: 12, column: 0 });
  });

  it('surfaces server and connection errors to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Editor unavailable"}', { status: 500 })));
    await expect(openInEditor('Card.svelte')).rejects.toThrow('Editor unavailable');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(openInEditor('Card.svelte')).rejects.toThrow('Cannot reach the dev server');
  });
});
