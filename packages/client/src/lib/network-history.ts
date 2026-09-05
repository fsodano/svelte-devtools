/** Bounded panel history. Source buffers also prevent evicted rows from reappearing. */
export class NetworkHistory<T extends { id: string }> {
  private rows: T[] = [];
  private buffers = new Map<'client' | 'server', Set<string>>();
  private dismissed = new Set<string>();

  constructor(private readonly limit = 500, private readonly bufferLimit = limit) {}

  get entries(): T[] { return this.rows; }
  get dismissedCount(): number { return this.dismissed.size; }

  ingest(source: 'client' | 'server', batch: T[]): T[] {
    // Each producer supplies a bounded current buffer, not an append-only log.
    const current = batch.slice(-this.bufferLimit);
    const previous = this.buffers.get(source) ?? new Set<string>();
    this.buffers.set(source, new Set(current.map(entry => entry.id)));
    const retained = new Set([...this.buffers.values()].flatMap(ids => [...ids]));
    for (const id of this.dismissed) if (!retained.has(id)) this.dismissed.delete(id);
    const existing = new Set(this.rows.map(entry => entry.id));
    const additions = current.filter(entry => {
      if (previous.has(entry.id) || existing.has(entry.id) || this.dismissed.has(entry.id)) return false;
      existing.add(entry.id);
      return true;
    });
    if (additions.length) this.rows = [...this.rows, ...additions].slice(-this.limit);
    return this.rows;
  }

  clear(): T[] {
    // Only entries still present in a producer buffer can be replayed.
    this.dismissed = new Set([...this.buffers.values()].flatMap(ids => [...ids]));
    this.rows = [];
    return this.rows;
  }
}
