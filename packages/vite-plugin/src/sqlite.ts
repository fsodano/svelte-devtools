import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { emitServerEvent, getTraceContext } from './trace-context.js';

export interface SqliteTraceOptions {
  /** Pass the framework's development flag. Disabled calls perform no observation. */
  enabled: boolean;
  /** Logical database name; do not use a filesystem path. */
  database: string;
  operation: 'get' | 'all' | 'run' | 'exec' | 'pragma';
  /** Prepared SQL template only. Never pass expanded bound values. */
  statement?: string;
  /** Statement text can contain sensitive literals. Capture requires explicit opt-in. */
  captureStatement?: boolean;
}

const MAX_STATEMENT = 4096;
const MAX_LABEL = 128;

/** Observe one synchronous SQLite call without wrapping or modifying native objects. */
export function traceSqliteQuery<T>(options: SqliteTraceOptions, execute: () => T): T {
  if (!options.enabled) return execute();
  const context = getTraceContext();
  if (!context) return execute();
  const start = performance.now();
  const timestamp = Date.now();
  let result: T;
  try {
    result = execute();
  } catch (error) {
    report(undefined, error, true);
    throw error;
  }
  report(result, undefined, false);
  return result;

  function report(value: unknown, error: unknown, failed: boolean) {
    const duration = performance.now() - start;
    // Observation must never alter an application's return value or exception.
    try {
      const spanId = randomUUID();
      const statement = options.captureStatement && typeof options.statement === 'string'
        ? options.statement : undefined;
      let rowCount: number | undefined;
      if (!failed) {
        if (options.operation === 'all' && Array.isArray(value)) {
          // Avoid value getters. A Proxy can still trap descriptor inspection;
          // the surrounding catch keeps a failed observation from changing the result.
          const length = Object.getOwnPropertyDescriptor(value, 'length');
          if (length && 'value' in length && typeof length.value === 'number' && Number.isFinite(length.value)) rowCount = length.value;
        }
        else if (options.operation === 'get') rowCount = value === undefined ? 0 : 1;
        else if (options.operation === 'run' && value && typeof value === 'object') {
          const changes = Object.getOwnPropertyDescriptor(value, 'changes');
          if (changes && 'value' in changes && typeof changes.value === 'number' && Number.isFinite(changes.value)) rowCount = changes.value;
        }
      }
      // Error messages may contain SQL literals or bound values. Retain only a safe code.
      const code = error && typeof error === 'object'
        ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
      const errorCode = code && 'value' in code && typeof code.value === 'string' && /^SQLITE_[A-Z0-9_]+$/.test(code.value)
        ? code.value.slice(0, MAX_LABEL) : 'SQLITE_QUERY_FAILED';
      emitServerEvent({
        id: spanId, type: 'server:sql', timestamp, duration,
        data: {
          traceId: context!.traceId, spanId, parentSpanId: context!.spanId,
          routeId: context!.routeId,
          database: typeof options.database === 'string' ? options.database.slice(0, MAX_LABEL) : 'sqlite',
          operation: options.operation,
          statement: statement?.slice(0, MAX_STATEMENT),
          statementTruncated: !!statement && statement.length > MAX_STATEMENT,
          rowCount, status: failed ? 'error' : 'success',
          ...(failed ? { error: errorCode } : {}),
        },
      });
    } catch { /* Diagnostics are best effort. */ }
  }
}
