import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

/** Resolve public package entries under both workspace and registry installations. */
export function resolvePackageAssets(resolve = (specifier: string) => import.meta.resolve(specifier)) {
  const runtimePath = dirname(fileURLToPath(resolve('@fsodano/svelte-devtools-runtime')));
  const clientPath = join(dirname(fileURLToPath(resolve('@fsodano/svelte-devtools-client/package.json'))), 'dist');
  for (const file of [join(runtimePath, 'index.js'), join(clientPath, 'index.html')]) {
    if (!existsSync(file)) throw new Error(`Svelte DevTools package asset missing: ${file}. Build or reinstall the DevTools packages.`);
  }
  return { runtimePath, clientPath };
}
