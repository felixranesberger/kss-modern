import path from 'node:path'
import fs from 'fs-extra'

// Filesystem errors that legitimately occur while watching: editors commonly
// save via an atomic rename (write temp file, then replace), and files can be
// removed between a watcher event firing and the handler reading the file. In
// that window the path briefly doesn't exist (or isn't readable yet), so a read
// throws one of these codes. They are transient and should be skipped rather
// than crash the process — a later stable event settles the final state.
const TRANSIENT_FS_ERROR_CODES = new Set(['ENOENT', 'EBUSY', 'EPERM', 'EACCES'])

/**
 * Whether `error` is a transient filesystem error raised by a file being saved
 * or removed mid-read while watching, as opposed to a genuine failure.
 */
export function isTransientFsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false

  const { code } = error as NodeJS.ErrnoException
  return code !== undefined && TRANSIENT_FS_ERROR_CODES.has(code)
}

/**
 * Write a file only if the content has changed
 */
export async function logicalWriteFile(filepath: string, content: string) {
  // ensure directory exists
  const dir = path.dirname(filepath)
  await fs.ensureDir(dir)

  const isFileExisting = await fs.exists(filepath)
  if (isFileExisting) {
    const oldContent = await fs.readFile(filepath, 'utf-8')
    if (oldContent === content) {
      return
    }
  }

  await fs.writeFile(filepath, content)
}
