import { readFileSync } from 'node:fs';

/**
 * Read the result of `npm pack --json`.
 *
 * npm 11 returns an array of pack results. npm 12 returns an object keyed by
 * package name. The release scripts run under both, so they normalize the
 * output before they read it.
 */
export function packResults(output) {
  const parsed = typeof output === 'string' ? JSON.parse(output) : output;
  return Array.isArray(parsed) ? parsed : Object.values(parsed);
}

/** The tarball file name of a pack result that was written to a file. */
export function packFilenameFromFile(path) {
  const [result] = packResults(readFileSync(path, 'utf8'));
  return result.filename;
}
