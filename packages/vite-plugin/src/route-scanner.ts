import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface RouteParameter {
    name: string;
    optional: boolean;
    rest: boolean;
    matcher?: string;
}
export interface ScannedRoute {
    id: string;
    cleanedUrl: string;
    files: Record<string, boolean>;
    routeGroup?: string;
    groups: string[];
    paramNames: string[];
    parameters: RouteParameter[];
    navigable: boolean;
}

/** Keep Kit's bracket syntax: a route template is not a concrete URL. */
export function scanRoutes(routesDir: string): ScannedRoute[] {
    if (!existsSync(routesDir)) return [];
    const routes: ScannedRoute[] = [];
    function visit(dir: string, segments: string[]): void {
        const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        const files: Record<string, boolean> = {};
        for (const entry of entries) {
            if (entry.isFile()) {
                const match = /^\+(page|layout|error|server)(?:@[^.]*)?(\.server)?\.(svelte|js|ts)$/.exec(entry.name);
                if (match) {
                    const key = match[1] + (match[2] ?? (match[3] !== 'svelte' && match[1] !== 'server' ? '.load' : ''));
                    files[key] = true;
                }
            }
        }
        if (Object.keys(files).length) {
            const groups = segments.filter(segment => /^\(.*\)$/.test(segment)).map(segment => segment.slice(1, -1));
            const cleanedUrl = '/' + segments.filter(segment => !/^\(.*\)$/.test(segment)).join('/');
            const parameters = [...cleanedUrl.matchAll(/\[\[([^\]]+)\]\]|\[([^\]]+)\]/g)].map(match => {
                const token = match[1] ?? match[2];
                const [name, matcher] = token.replace(/^\.\.\./, '').split('=');
                return { name, optional: !!match[1], rest: token.startsWith('...'), ...(matcher ? { matcher } : {}) };
            });
            routes.push({
                id: '/' + segments.join('/'), cleanedUrl, files, groups,
                routeGroup: groups.length ? groups.join(' / ') : undefined,
                parameters, paramNames: parameters.map(parameter => parameter.name),
                navigable: !!files.page && parameters.length === 0 && !cleanedUrl.includes('['),
            });
        }
        for (const entry of entries) {
            // Ignore symlinks and private Kit directories, including their contents.
            if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.')) {
                visit(join(dir, entry.name), [...segments, entry.name]);
            }
        }
    }
    visit(routesDir, []);
    return routes;
}

/** Kit exposes its resolved configuration on the setup plugin. */
export function resolveRouteDirectory(root: string, plugins: readonly { name: string; api?: unknown }[]): { routesDir: string; configurationSource: string; basePath: string } {
    const plugin = plugins.find(plugin => plugin.name === 'vite-plugin-sveltekit-setup');
    const api = plugin?.api as { options?: { kit?: { files?: { routes?: unknown }; paths?: { base?: unknown } } } } | undefined;
    const configured = api?.options?.kit?.files?.routes;
    const base = api?.options?.kit?.paths?.base;
    const basePath = typeof base === 'string' ? base : '';
    return typeof configured === 'string'
        ? { routesDir: resolve(root, configured), configurationSource: 'sveltekit', basePath }
        : { routesDir: resolve(root, 'src/routes'), configurationSource: 'default', basePath };
}
