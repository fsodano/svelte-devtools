import { promises as fs } from 'fs';
import path from 'path';

/**
 * SvelteKit route node as scanned from the filesystem.
 */
export interface SvelteKitRoute {
  id: string;
  cleanedUrl: string;
  physicalDirectory: string;
  files: {
    page?: boolean;       // +page.svelte
    layout?: boolean;     // +layout.svelte or +layout@xxx.svelte
    serverPage?: boolean; // +page.server.ts/js
    serverLoad?: boolean; // +page.ts/js (non-server page load)
    endpoint?: boolean;   // +server.ts/js
    error?: boolean;      // +error.svelte
  };
  routeGroup?: string;    // Parenthesized group name if any
  paramNames?: string[];  // Extracted param names from [param] segments
  children?: SvelteKitRoute[];
}

/**
 * Clean filesystem path into a browser URL path.
 * - Strips (group) segments
 * - Converts [param] to :param notation
 * - Converts [...rest] to /* notation
 */
function cleanRoutePath(routeId: string): string {
  if (routeId === '/' || routeId === '') return '/';
  return routeId
    .split('/')
    .filter(segment => !/^\([^)]+\)$/.test(segment))
    .map(segment => {
      if (segment.startsWith('[...')) return `/*`;
      if (segment.startsWith('[[')) return `/:${segment.slice(2, -2)}?`;
      if (segment.startsWith('[')) return `/:${segment.replace(/\[(.*?)\].*/, '$1')}`;
      return segment;
    })
    .join('/')
    .replace(/\/+/g, '/') || '/';
}

/**
 * Scan a SvelteKit routes directory and return the full route tree.
 */
export async function scanSvelteKitRoutes(routesDir: string, baseDir = ''): Promise<SvelteKitRoute[]> {
  const absolutePath = path.join(routesDir, baseDir);
  let entries: { name: string; isFile(): boolean; isDirectory(): boolean }[];

  try {
    entries = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch {
    return []; // Directory doesn't exist yet
  }

  const routes: SvelteKitRoute[] = [];
  const routeFiles = entries.filter(e => e.isFile());
  const subdirs = entries.filter(e => e.isDirectory());

  // Check if this directory has SvelteKit route files
  const hasSvelteKitFile = routeFiles.some(f => f.name.startsWith('+'));

  if (hasSvelteKitFile) {
    const routeId = `/${baseDir}`;
    const route: SvelteKitRoute = {
      id: routeId,
      cleanedUrl: cleanRoutePath(routeId),
      physicalDirectory: absolutePath,
      files: {
        page: routeFiles.some(f => f.name === '+page.svelte'),
        layout: routeFiles.some(f => f.name.startsWith('+layout')),
        serverPage: routeFiles.some(f => f.name.startsWith('+page.server.')),
        serverLoad: routeFiles.some(f => f.name.startsWith('+page.') && !f.name.endsWith('.svelte')),
        endpoint: routeFiles.some(f => f.name.startsWith('+server.')),
        error: routeFiles.some(f => f.name === '+error.svelte'),
      },
      paramNames: baseDir.split('/')
        .filter(s => s.startsWith('['))
        .map(s => s.replace(/\[(.*?)\].*/, '$1')),
      routeGroup: baseDir.split('/').find(s => /^\([^)]+\)$/.test(s))?.replace(/[()]/g, ''),
    };
    routes.push(route);
  }

  // Recurse into subdirectories
  for (const dir of subdirs) {
    if (dir.name.startsWith('.')) continue; // skip dot dirs
    const nestedRoutes = await scanSvelteKitRoutes(routesDir, baseDir ? path.join(baseDir, dir.name) : dir.name);
    routes.push(...nestedRoutes);
  }

  return routes;
}

/**
 * Build a parent-child tree from flat route list.
 */
export function buildRouteTree(routes: SvelteKitRoute[]): SvelteKitRoute[] {
  const root: SvelteKitRoute = {
    id: '/',
    cleanedUrl: '/',
    physicalDirectory: '',
    files: {},
    children: [],
  };

  for (const route of routes) {
    if (route.id === '/') {
      root.files = route.files;
      root.physicalDirectory = route.physicalDirectory;
      root.paramNames = route.paramNames;
      root.routeGroup = route.routeGroup;
      continue;
    }

    const segments = route.id.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!current.children) current.children = [];
      let child = current.children.find(c => {
        const cSeg = c.id.split('/').filter(Boolean);
        return cSeg[cSeg.length - 1] === seg;
      });

      if (!child) {
        // Build intermediate or final route node
        const partialId = '/' + segments.slice(0, i + 1).join('/');
        const existingRoute = routes.find(r => r.id === partialId);
        child = existingRoute ? { ...existingRoute, children: [] } : {
          id: partialId,
          cleanedUrl: cleanRoutePath(partialId),
          physicalDirectory: path.join(route.physicalDirectory.split(segments.slice(0, i + 1).join('/'))[0] || '', ...segments.slice(0, i + 1)),
          files: {},
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  return root.children || [];
}

/**
 * Setup a file watcher on the routes directory.
 * Returns an unsubscribe function.
 */
export function watchRoutes(
  routesDir: string,
  onChange: (routes: SvelteKitRoute[]) => void
): () => void {
  let watcher: ReturnType<typeof setInterval> | null = null;
  let lastScan = '';

  async function rescan() {
    const routes = await scanSvelteKitRoutes(routesDir);
    const serialized = JSON.stringify(routes);
    if (serialized !== lastScan) {
      lastScan = serialized;
      onChange(routes);
    }
  }

  // Poll every 2 seconds as a simple file watcher
  // (Vite's built-in file watcher integration could be used instead)
  watcher = setInterval(rescan, 2000);
  rescan(); // initial scan

  return () => {
    if (watcher) clearInterval(watcher);
  };
}
