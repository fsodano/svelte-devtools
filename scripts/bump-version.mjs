#!/usr/bin/env node
/**
 * bump-version.mjs — move every release version reference to one new version.
 *
 * A release version lives in more than one place, and a reference left behind
 * is a broken promise to whoever reads the documentation. This updates:
 *
 *   - the root manifest and the five workspace manifests
 *   - the internal workspace dependency ranges
 *   - the shared DEVTOOLS_VERSION constant
 *   - the root package-lock.json
 *   - the docs, READMEs, and skills that name the release
 *
 * It also reports any file that still names an older release, so a reference
 * in a file this script does not know about is visible rather than silent.
 *
 * Usage:
 *   node scripts/bump-version.mjs <next-version>   update every reference
 *   node scripts/bump-version.mjs --check           report what is inconsistent
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WORKSPACES = ['client', 'mcp', 'runtime', 'types', 'vite-plugin'];
const INTERNAL = new Set([
  '@fsodano/svelte-devtools-client',
  '@fsodano/svelte-devtools-mcp',
  '@fsodano/svelte-devtools-runtime',
  '@fsodano/svelte-devtools-types',
  '@fsodano/vite-plugin-svelte-devtools',
]);

/** Files that name the release version. */
const SCANNED_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'AGENTS.md',
  'docs/02_vite-plugin.md',
  'docs/03_runtime.md',
  'docs/06_api.md',
  'docs/07_mcp.md',
  'docs/INDEX.md',
  'docs/VITE.md',
  'docs/design-guidelines.md',
  'docs/inspiration.md',
  'packages/client/README.md',
  'packages/mcp/README.md',
  'packages/runtime/README.md',
  'packages/types/README.md',
  'packages/vite-plugin/README.md',
  'skills/SKILLS.md',
  'skills/implement-devtools.md',
  'skills/verify-devtools.md',
];

/** The version of the `@vitejs/devtools` host, not of this package. Never change it here. */
const HOST_VERSION = '0.4.8';

/**
 * The ways this repository names its own release. A wider scan would catch
 * Vite, Svelte, and SvelteKit versions, which belong to other packages.
 */
const RELEASE_REFERENCE = /@fsodano\/[a-z0-9-]+@(\d+\.\d+\.\d+)|\bv(\d+\.\d+\.\d+)\b|\b(?:source |building |targets |describes )?release (?:context \()?(\d+\.\d+\.\d+)|\bDevTools (\d+\.\d+\.\d+)/g;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function currentVersion() {
  return readJson(join(root, 'package.json')).version;
}

/** The release versions a text file names. */
function releaseVersions(text) {
  return [...new Set([...text.matchAll(RELEASE_REFERENCE)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4])
    .filter((token) => token && token !== HOST_VERSION))];
}

function updateManifests(next) {
  const rootManifestPath = join(root, 'package.json');
  const rootManifest = readJson(rootManifestPath);
  rootManifest.version = next;
  writeJson(rootManifestPath, rootManifest);

  for (const workspace of WORKSPACES) {
    const path = join(root, 'packages', workspace, 'package.json');
    const manifest = readJson(path);
    manifest.version = next;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = manifest[section];
      if (!deps) continue;
      for (const [name, range] of Object.entries(deps)) {
        if (INTERNAL.has(name)) deps[name] = `^${next}`;
      }
    }
    writeJson(path, manifest);
  }
}

function updateConstant(next) {
  const path = join(root, 'packages/types/src/constants.ts');
  const source = readFileSync(path, 'utf8');
  const pattern = /(export const DEVTOOLS_VERSION = ')[^']+(')/;
  if (!pattern.test(source)) {
    console.error('✗ DEVTOOLS_VERSION not found in packages/types/src/constants.ts');
    process.exit(1);
  }
  writeFileSync(path, source.replace(pattern, `$1${next}$2`));
}

function updateLockfile(next) {
  const path = join(root, 'package-lock.json');
  const lock = readJson(path);
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  for (const workspace of WORKSPACES) {
    const entry = lock.packages?.[`packages/${workspace}`];
    if (!entry) continue;
    entry.version = next;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = entry[section];
      if (!deps) continue;
      for (const [name, range] of Object.entries(deps)) {
        if (INTERNAL.has(name)) deps[name] = `^${next}`;
      }
    }
  }
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

/** Replace the old release version in a text file. Returns the number of edits. */
function updateText(path, previous, next) {
  const before = readFileSync(path, 'utf8');
  const after = before.replaceAll(previous, next);
  if (before === after) return 0;
  writeFileSync(path, after);
  return before.split(previous).length - 1;
}

const [argument] = process.argv.slice(2);

if (argument === '--check') {
  const version = currentVersion();
  let failed = false;
  for (const file of SCANNED_FILES) {
    const stale = releaseVersions(readFileSync(join(root, file), 'utf8')).filter((token) => token !== version);
    if (stale.length) {
      console.error(`✗ ${file} names ${stale.join(', ')} instead of ${version}`);
      failed = true;
    }
  }
  if (failed) {
    console.error('\nRelease references are inconsistent. Run: node scripts/bump-version.mjs <version>');
    process.exit(1);
  }
  console.log(`✓ every release reference names ${version}`);
  process.exit(0);
}

if (!argument) {
  console.error('usage: node scripts/bump-version.mjs <next-version> | --check');
  process.exit(2);
}

const next = argument;
const previous = currentVersion();

updateManifests(next);
updateConstant(next);
updateLockfile(next);

let edited = 0;
for (const file of SCANNED_FILES) {
  edited += updateText(join(root, file), previous, next);
}

console.log(`✓ bumped ${previous} → ${next} in the manifests, the constant, the lockfile, and ${edited} text reference(s)`);

const remaining = [];
for (const file of SCANNED_FILES) {
  const text = readFileSync(join(root, file), 'utf8');
  const stale = releaseVersions(text).filter((token) => token !== next);
  if (stale.length) remaining.push(`  ${file}: ${stale.join(', ')}`);
}
if (remaining.length) {
  console.warn('\nThese files still name another version. They may be historical records:');
  console.warn(remaining.join('\n'));
}
