import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'

/**
 * A file's identity for cache freshness checks that survive a process restart.
 *
 * `mtimeMs:size` is the fast path, the same scheme the in-memory `PugCompileCache` uses. A content
 * hash backs it up: `git checkout`, `touch` or a reinstall bump the mtime without changing a byte,
 * and comparing hashes when only the mtime moved keeps those from invalidating every cache entry.
 */
export interface FileSignature {
  mtimeMs: number
  size: number
  /** sha1 of the file content. */
  hash: string
}

export function hashContent(content: string | Buffer): string {
  return createHash('sha1').update(content).digest('hex')
}

/** Read a file's full signature (stat + content hash), or null when it is missing. */
export async function readFileSignature(filePath: string): Promise<FileSignature | null> {
  try {
    const [stat, content] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)])
    return { mtimeMs: stat.mtimeMs, size: stat.size, hash: hashContent(content) }
  }
  catch {
    return null
  }
}

/**
 * Whether `filePath` still matches `stored`. When only the mtime changed and the content hash
 * still matches, `stored.mtimeMs` is moved forward so the next check takes the fast path again;
 * the return value then says the record changed, so a persistent cache knows to save it.
 */
export async function checkFileSignature(filePath: string, stored: FileSignature): Promise<{ isFresh: boolean, isTouched: boolean }> {
  let stat
  try {
    stat = await fs.stat(filePath)
  }
  catch {
    return { isFresh: false, isTouched: false }
  }

  if (stat.size !== stored.size)
    return { isFresh: false, isTouched: false }

  if (stat.mtimeMs === stored.mtimeMs)
    return { isFresh: true, isTouched: false }

  let content
  try {
    content = await fs.readFile(filePath)
  }
  catch {
    return { isFresh: false, isTouched: false }
  }

  if (hashContent(content) !== stored.hash)
    return { isFresh: false, isTouched: false }

  stored.mtimeMs = stat.mtimeMs
  return { isFresh: true, isTouched: true }
}
