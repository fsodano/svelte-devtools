import type { Rollup } from 'vite';

/**
 * Format a Svelte-style error frame (colon-separated) to Vite overlay format (pipe-separated).
 * 
 * Svelte:  "2: bar;\n       ^"
 * Vite:    " 2 | bar;\n          ^"
 */
function formatFrameForVite(frame?: string): string | undefined {
  if (!frame) return undefined;
  return frame
    .split('\n')
    .map(line => {
      const match = line.match(/^(\s*)(\d+):\s*(.*)/);
      if (match) {
        return `${match[1]}${match[2]} | ${match[3]}`;
      }
      return '         ' + line;
    })
    .join('\n');
}

/**
 * Build an extended error message that includes filename:line:col for clickability.
 */
function buildExtendedLogMessage(error: Error & { start?: { line: number; column: number }; filename?: string }): string {
  let msg = error.message;
  if (error.filename && error.start) {
    msg = `${error.filename}:${error.start.line}:${error.start.column} ${msg}`;
  }
  return msg;
}

/**
 * Convert a compiler/parser error into RollupError for Vite's error overlay.
 */
export function toRollupError(
  error: unknown,
  options: { isBuild?: boolean; isDebug?: boolean }
): Rollup.RollupError {
  const err = error as Error & {
    frame?: string;
    start?: { line: number; column: number };
    filename?: string;
    loc?: { line: number; column: number; file?: string };
  };

  const rollupError: Rollup.RollupError = {
    name: 'SvelteDevToolsError',
    id: err.filename || err.loc?.file,
    message: buildExtendedLogMessage(err),
    stack: options.isBuild || options.isDebug || !err.frame ? err.stack : '',
  };

  const frame = formatFrameForVite(err.frame);
  if (frame) {
    (rollupError as unknown as Record<string, unknown>).frame = frame;
  }

  const start = err.start || err.loc;
  if (start) {
    rollupError.loc = {
      line: start.line,
      column: start.column,
      file: err.filename || (start as { file?: string }).file,
    } as Rollup.RollupLog['loc'];
  }

  return rollupError;
}

/**
 * Log a warning message through the plugin's logs API or console.
 */
export function logWarning(message: string, logsApi: Record<string, (arg: unknown) => unknown> | null): void {
  if (logsApi && typeof logsApi.add === 'function') {
    logsApi.add({
      message,
      level: 'warn',
      category: 'svelte-devtools',
    } as unknown);
  } else {
    console.warn(`[Svelte DevTools] ${message}`);
  }
}
