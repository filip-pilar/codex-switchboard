import { constants, lstatSync, mkdirSync, openSync, closeSync, fstatSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
import { dirname, resolve, parse, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Check every existing component, including a dangling final symlink. Never
// resolve a user-selected credential/config path through a symlink.
export function checkPath(path, { directory = false, missing = true } = {}) {
  const absolute = resolve(path), root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split('/').filter(Boolean)) {
    current = join(current, part);
    let metadata;
    try { metadata = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT' && missing) return;
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error('unsafe_symlink');
    if (current !== absolute || directory) {
      if (!metadata.isDirectory()) throw new Error('unsafe_directory');
    } else if (!metadata.isFile()) throw new Error('unsafe_file');
    if (current === absolute && metadata.uid !== process.getuid() && metadata.uid !== 0) throw new Error('unsafe_owner');
  }
}
export function privateDirectory(path) {
  checkPath(path, { directory: true });
  mkdirSync(path, { recursive: true, mode: 0o700 });
  checkPath(path, { directory: true, missing: false });
  chmodSync(path, 0o700);
  return path;
}
export function readProtected(path, { limit = 16 * 1024 * 1024, optional = false } = {}) {
  try {
    checkPath(path, { missing: false });
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > limit || stat.uid !== process.getuid()) throw new Error('unsafe_file');
      return readFileSync(fd);
    } finally { closeSync(fd); }
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
export function atomicWrite(path, content) {
  checkPath(path);
  privateDirectory(dirname(path));
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content); fsyncSync(fd); closeSync(fd); fd = undefined;
    checkPath(path); renameSync(temporary, path);
    const parent = openSync(dirname(path), constants.O_RDONLY);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export const writeJSON = (path, value) => atomicWrite(path, JSON.stringify(value, null, 2) + '\n');
export function readJSON(path, fallback) {
  const data = readProtected(path, { optional: fallback !== undefined });
  return data ? JSON.parse(data) : structuredClone(fallback);
}
