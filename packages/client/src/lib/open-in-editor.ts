/** Open source files through the authenticated Vite server and its configured editor. */
import { apiFetch } from './api.js';

export interface EditorLocation {
  filename: string;
  line?: number;
  column?: number;
}

export function getSourceLocation(component: {
  filename?: string;
  sourceLocation?: EditorLocation;
}): EditorLocation | undefined {
  if (component.sourceLocation?.filename) return component.sourceLocation;
  return component.filename ? { filename: component.filename } : undefined;
}

export function formatSourceLocation(location: EditorLocation): string {
  const filename = location.filename.split(/[\\/]/).pop() || location.filename;
  if (location.line === undefined) return filename;
  return `${filename}:${location.line}${location.column === undefined ? '' : `:${location.column}`}`;
}

export async function openInEditor(filename: string, line?: number, column?: number): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch('/__svelte-devtools/open-in-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, line, column }),
    });
  } catch {
    throw new Error('Cannot reach the dev server. Check that it is running and try again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Could not open the editor (HTTP ${res.status}). Set LAUNCH_EDITOR before starting the dev server.`);
  }
}
