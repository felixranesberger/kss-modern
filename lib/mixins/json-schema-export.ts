import type { MixinManifest } from './types.ts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logger } from '../logger.ts'
import { logicalWriteFile } from '../utils.ts'

/** Characters no file system accepts in a name, plus control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE_SEGMENT_CHARS_RE = /[<>:"\\|?*\u0000-\u001F]/g

/** A path segment as a file or folder name. Undefined for one that is empty or would leave the directory. */
function toFileSegment(segment: string): string | undefined {
  const cleaned = segment.replace(UNSAFE_SEGMENT_CHARS_RE, '-').trim()
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? undefined : cleaned
}

/**
 * The file of every mixin with a usable schema, relative to the export directory: its explorer
 * path, `atoms/Button` -> `atoms/Button.json`. A path taken twice gets a numeric suffix.
 */
export function getJsonSchemaFiles(manifest: MixinManifest): Map<string, Record<string, unknown>> {
  const files = new Map<string, Record<string, unknown>>()
  for (const entry of manifest.mixins) {
    if (!entry.hasSchema || !entry.jsonSchema)
      continue

    const segments = entry.path.map(toFileSegment).filter((segment): segment is string => segment !== undefined)
    const base = (segments.length > 0 ? segments : [entry.id]).join('/')
    let file = `${base}.json`
    for (let count = 2; files.has(file); count++)
      file = `${base}-${count}.json`
    if (file !== `${base}.json`)
      logger.warn(`The JSON Schema of mixin "${entry.name}" (${entry.file}:${entry.line}) is written to ${file}, since ${base}.json is taken.`)

    files.set(file, entry.jsonSchema)
  }
  return files
}

/**
 * Write the JSON Schema of every public mixin into `directory`, one file per mixin in the folders
 * of its explorer path. `previous` is the result of the last call: a file whose content it already
 * holds is not touched, one no mixin claims any more is removed. Other files in the directory are
 * left alone. Returns the absolute path and content of every file now written.
 */
export async function writeJsonSchemaFiles(directory: string, manifest: MixinManifest, previous: ReadonlyMap<string, string> = new Map()): Promise<Map<string, string>> {
  const root = path.resolve(directory)
  const written = new Map([...getJsonSchemaFiles(manifest)].map(([file, jsonSchema]) => [path.join(root, file), `${JSON.stringify(jsonSchema, null, 2)}\n`]))

  await Promise.all([
    ...[...written]
      .filter(([file, content]) => previous.get(file) !== content)
      .map(([file, content]) => logicalWriteFile(file, content)),
    ...[...previous.keys()].filter(file => !written.has(file)).map(file => fs.rm(file, { force: true })),
  ])

  return written
}
