import { realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export function resolveEditorLocation(root: string, file: unknown, line: unknown = 1, column: unknown = 1): string {
  if (typeof file !== 'string' || !file || file.includes('\0')) throw new Error('Provide a source filename.');
  if (!Number.isInteger(line) || Number(line) < 1 || !Number.isInteger(column) || Number(column) < 0) {
    throw new Error('Line must be a positive integer and column must be a nonnegative integer.');
  }
  const rootPath = realpathSync(root);
  const filePath = realpathSync(resolve(root, file));
  if (!filePath.startsWith(rootPath + sep)) throw new Error('Source file must be inside the project root.');
  if (!statSync(filePath).isFile()) throw new Error('Source path is not a file.');
  return `${filePath}:${line}:${column}`;
}
