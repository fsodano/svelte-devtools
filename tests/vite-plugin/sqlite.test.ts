// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { traceSqliteQuery } from '../../packages/vite-plugin/src/sqlite.js';
import { runWithTraceContext } from '../../packages/vite-plugin/src/trace-context.js';

const options = { enabled: true, database: 'todos', operation: 'get' as const, statement: 'SELECT secret', captureStatement: true };
function observed(callback: () => unknown) {
  const events: any[] = [];
  const result = runWithTraceContext({ traceId: 'request', spanId: 'parent', emit: (e) => events.push(e) }, callback);
  return { events, result };
}
describe('explicit SQLite tracing', () => {
  it('preserves result identity and records real parentage and duration', () => {
    const row = { secret: 'not captured' };
    const { result, events } = observed(() => traceSqliteQuery(options, () => row));
    expect(result).toBe(row);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'server:sql', data: { traceId: 'request', parentSpanId: 'parent', rowCount: 1, status: 'success', statement: 'SELECT secret' } });
    expect(events[0].duration).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(events)).not.toContain('not captured');
  });
  it('omits statements by default and bounds explicitly captured text', () => {
    expect(observed(() => traceSqliteQuery({ ...options, captureStatement: false }, () => undefined)).events[0].data.statement).toBeUndefined();
    const { events } = observed(() => traceSqliteQuery({ ...options, statement: 'x'.repeat(5000) }, () => undefined));
    expect(events[0].data.statement).toHaveLength(4096);
    expect(events[0].data.statementTruncated).toBe(true);
    expect(events[0].data.rowCount).toBe(0);
  });
  it('rethrows the original error and never records potentially sensitive messages', () => {
    const error = Object.assign(new Error('private binding'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    const { events } = observed(() => {
      expect(() => traceSqliteQuery(options, () => { throw error; })).toThrow(error);
    });
    expect(events[0].data.error).toBe('SQLITE_CONSTRAINT_UNIQUE');
    expect(JSON.stringify(events)).not.toContain('private binding');
  });
  it('does not invoke getters on query results or thrown errors', () => {
    const value = Object.defineProperty({}, 'changes', { get() { throw new Error('getter'); } });
    const { result, events } = observed(() => traceSqliteQuery({ ...options, operation: 'run' }, () => value));
    expect(result).toBe(value);
    expect(events[0].data.rowCount).toBeUndefined();
  });
  it('reads array row counts without invoking a value get trap and preserves results when descriptor inspection fails', () => {
    let valueReads = 0;
    const rows = new Proxy([{}, {}], { get() { valueReads++; throw new Error('Unexpected value read'); } });
    const observedRows = observed(() => traceSqliteQuery({ ...options, operation: 'all' }, () => rows));
    expect(observedRows.result).toBe(rows);
    expect(valueReads).toBe(0);
    expect(observedRows.events[0].data.rowCount).toBe(2);

    const opaqueRows = new Proxy([], { getOwnPropertyDescriptor() { throw new Error('Opaque result'); } });
    const opaque = observed(() => traceSqliteQuery({ ...options, operation: 'all' }, () => opaqueRows));
    expect(opaque.result).toBe(opaqueRows);
    expect(opaque.events).toEqual([]);
  });
  it('is inert when disabled or outside a request and tolerates a failing observer', () => {
    expect(observed(() => traceSqliteQuery({ ...options, enabled: false }, () => 7))).toEqual({ result: 7, events: [] });
    expect(traceSqliteQuery(options, () => 8)).toBe(8);
    expect(runWithTraceContext({ traceId: 'r', spanId: 's', emit() { throw new Error('observer'); } }, () => traceSqliteQuery(options, () => 9))).toBe(9);
  });
});

// The native driver belongs to the independent fixture, not the extension package.
import { createRequire } from 'node:module';
const fixtureRequire = createRequire(new URL('../apps/todo-sqlite/package.json', import.meta.url));
let Database: any;
try { Database = fixtureRequire('better-sqlite3'); } catch { /* Install the Todo fixture to run native coverage. */ }
it.skipIf(!Database)('preserves native SQLite bindings, fluent configuration, changes, and transaction rollback', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
    const insert = db.prepare('INSERT INTO items (name) VALUES (?)');
    const result = observed(() => traceSqliteQuery({ ...options, operation: 'run', statement: insert.source }, () => insert.run('private-value')));
    expect(result.events[0].data.rowCount).toBe(1);
    expect(JSON.stringify(result.events)).not.toContain('private-value');
    const selected = db.prepare('SELECT id FROM items').pluck().safeIntegers();
    expect(observed(() => traceSqliteQuery(options, () => selected.get())).result).toBe(1n);
    const transaction = db.transaction(() => {
      traceSqliteQuery(options, () => insert.run('second'));
      traceSqliteQuery(options, () => insert.run('private-value'));
    });
    const events: any[] = [];
    expect(() => runWithTraceContext({ traceId: 'r', spanId: 's', emit: e => events.push(e) }, transaction)).toThrow();
    expect(events[1].data.error).toBe('SQLITE_CONSTRAINT_UNIQUE');
    expect(db.prepare('SELECT count(*) FROM items').pluck().get()).toBe(1);
  } finally { db.close(); }
});
