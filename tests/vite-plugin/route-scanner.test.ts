import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveRouteDirectory, scanRoutes } from '../../packages/vite-plugin/src/route-scanner.js';

const roots: string[] = [];
function fixture(files: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'devtools-routes-'));
    roots.push(root);
    for (const file of files) {
        const path = join(root, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, '');
    }
    return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('route inventory', () => {
    it('preserves group identity rather than merging equal URLs', () => {
        const routes = scanRoutes(fixture(['(public)/+layout.svelte', '(private)/+layout.svelte', '(public)/about/+page.svelte']));
        expect(routes).toHaveLength(3);
        expect(routes.filter(route => route.cleanedUrl === '/').map(route => route.id).sort()).toEqual(['/(private)', '/(public)']);
        expect(routes.find(route => route.id === '/(public)/about')).toMatchObject({ cleanedUrl: '/about', groups: ['public'], navigable: true });
    });
    it('preserves optional, rest and matcher parameters without enabling template navigation', () => {
        const [route] = scanRoutes(fixture(['[[lang]]/[id=integer]/[...rest]/+page.svelte']));
        expect(route.cleanedUrl).toBe('/[[lang]]/[id=integer]/[...rest]');
        expect(route.navigable).toBe(false);
        expect(route.parameters).toEqual([
            { name: 'lang', optional: true, rest: false },
            { name: 'id', optional: false, rest: false, matcher: 'integer' },
            { name: 'rest', optional: false, rest: true },
        ]);
    });
    it('does not navigate layout-only, load-only or endpoint directories', () => {
        const routes = scanRoutes(fixture(['layout/+layout.svelte', 'load/+page.ts', 'api/+server.ts', 'page/+page.svelte', 'page/+page.server.ts', '_private/+page.svelte', '.hidden/+page.svelte']));
        expect(routes.filter(route => route.navigable).map(route => route.id)).toEqual(['/page']);
        expect(routes).toHaveLength(4);
        expect(routes.find(route => route.id === '/page')?.files).toEqual({ page: true, 'page.server': true });
    });
    it('reads the resolved Kit configuration, including nondefault routes roots', () => {
        const root = fixture(['custom/+page.svelte']);
        const directory = resolveRouteDirectory(root, [{ name: 'vite-plugin-sveltekit-setup', api: { options: { kit: { files: { routes: 'custom' }, paths: { base: '/app' } } } } }]);
        expect(directory).toEqual({ routesDir: join(root, 'custom'), configurationSource: 'sveltekit', basePath: '/app' });
        expect(scanRoutes(directory.routesDir)[0].id).toBe('/');
        expect(resolveRouteDirectory(root, []).routesDir).toBe(resolve(root, 'src/routes'));
    });
    it('returns an empty inventory when there is no routes directory', () => {
        expect(scanRoutes(join(fixture([]), 'missing'))).toEqual([]);
    });
});
