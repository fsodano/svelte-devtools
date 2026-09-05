import { describe, expect, it } from 'vitest';
import { NetworkHistory } from '../../packages/client/src/lib/network-history.js';

const batch = (source: string, start: number, length = 50) =>
  Array.from({ length }, (_, index) => ({ id: `${source}-${start + index}` }));

describe('production network panel history', () => {
  it.each(['client', 'server'] as const)('bounds %s history and does not replay buffered requests', source => {
    const history = new NetworkHistory();
    for (let start = 0; start < 2000; start += 50) history.ingest(source, batch('c', start));
    expect(history.entries).toHaveLength(500);
    expect(history.entries[0].id).toBe('c-1500');
    const retained = history.entries;
    history.ingest(source, batch('c', 1950));
    expect(history.entries).toBe(retained);
  });

  it('shares the limit across client and server requests', () => {
    const history = new NetworkHistory();
    for (let start = 0; start < 1000; start += 50) {
      history.ingest('client', batch('c', start));
      history.ingest('server', batch('s', start));
    }
    expect(history.entries).toHaveLength(500);
    expect(history.entries.filter(entry => entry.id.startsWith('c'))).toHaveLength(250);
  });

  it('keeps cleared buffers hidden while admitting new requests and pruning tombstones', () => {
    const history = new NetworkHistory();
    history.ingest('client', batch('c', 0));
    history.ingest('server', batch('s', 0));
    history.clear();
    expect(history.dismissedCount).toBe(100);
    history.ingest('client', batch('c', 0));
    history.ingest('server', batch('s', 0));
    expect(history.entries).toEqual([]);
    history.ingest('client', batch('c', 1));
    expect(history.entries).toEqual([{ id: 'c-50' }]);
    expect(history.dismissedCount).toBe(99);
    for (let start = 50; start < 5000; start += 50) {
      history.ingest('client', batch('c', start));
      history.ingest('server', batch('s', start));
      history.clear();
      expect(history.dismissedCount).toBeLessThanOrEqual(100);
    }
    history.ingest('client', []);
    history.ingest('server', []);
    expect(history.dismissedCount).toBe(0);
  });
});
