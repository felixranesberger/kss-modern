import type { Stats } from 'node:fs'
import { statSync } from 'node:fs'
import pugLoad from 'pug-load'

/**
 * Shared parse cache for pug includes/extends.
 *
 * Pug re-lexes and re-parses the entire include tree for every section it compiles. When many
 * sections share a heavy include tree (a layout that pulls in navigation + footer, say), editing
 * one shared file forces every dependent section to re-parse the whole tree from scratch — and on
 * the THI styleguide lex+parse is ~95% of compile time (file reads are ~5%), so an 8-section
 * footer-edit rebuild spends almost all its time re-parsing identical, unchanged files.
 *
 * pug resolves includes inside `pug-load`'s `string` (lex -> parse -> recursively load each
 * include), and pug's public plugin API only exposes a `read` hook (file I/O) — there is no seam
 * to cache the parsed AST. So we wrap `pug-load.string`, the single function through which every
 * file (the entry plus every include/extends, recursively) is lexed and parsed.
 *
 * We cache the SHALLOW parsed AST per file — the output of lex+parse, BEFORE include resolution —
 * keyed by the file's on-disk signature. Include resolution (`pug-load`'s default export) still
 * runs on every call and re-descends into children, so a changed descendant is always re-read and
 * re-parsed while unchanged files (the bulk of a shared tree) are served from cache. This is the
 * correct granularity: caching the fully-resolved subtree instead would embed stale descendants —
 * a footer edit would not invalidate the layout's cached blob, since the layout file itself is
 * unchanged.
 *
 * `pug-load`'s resolver deep-clones its input AST before walking/mutating it, so the cached parsed
 * AST is never touched by downstream linking or codegen — no defensive clone is needed here.
 *
 * The patch is process-global (it mutates the shared `pug-load` module), which is fine: this
 * project's only pug consumer is the compile pipeline. Each worker thread imports this module
 * separately and therefore patches its own `pug-load` and owns its own cache; with a persistent
 * worker pool that cache stays warm across rebuilds, which is where the win compounds.
 */

interface LoadOptions {
  filename?: string
  lex?: (src: string, options: unknown) => unknown
  parse?: (tokens: unknown, options: unknown) => unknown
  [key: string]: unknown
}

interface ParsedEntry {
  /** `mtimeMs:size` of the file when it was parsed. */
  sig: string
  /** Shallow parsed AST (pre include-resolution); pristine, never mutated. */
  ast: unknown
}

const parseCache = new Map<string, ParsedEntry>()
let hits = 0
let misses = 0

/**
 * Cheap change-detection signature, matching `PugCompileCache`'s scheme so both layers agree on
 * what "unchanged" means. Returns null when the file is missing (defer to pug's default path).
 */
function signatureOf(filename: string): string | null {
  try {
    const stat: Stats = statSync(filename)
    return `${stat.mtimeMs}:${stat.size}`
  }
  catch {
    return null
  }
}

let installed = false
const originalLoadString = pugLoad.string

/** Patch `pug-load.string` so every pug lex+parse is memoised per file. Idempotent. */
export function installPugParseCache(): void {
  if (installed)
    return
  installed = true

  pugLoad.string = function cachedLoadString(src: string, options: LoadOptions) {
    const filename = options?.filename
    // Only cache real files we can lex+parse ourselves; anything else defers to pug's own path.
    if (filename && typeof options.lex === 'function' && typeof options.parse === 'function') {
      const sig = signatureOf(filename)
      if (sig !== null) {
        let parsed: unknown
        const cached = parseCache.get(filename)
        if (cached && cached.sig === sig) {
          parsed = cached.ast
          hits++
        }
        else {
          parsed = options.parse(options.lex(src, options), options)
          parseCache.set(filename, { sig, ast: parsed })
          misses++
        }
        // pug-load's resolver clones `parsed` before mutating, so the cache entry stays pristine.
        return pugLoad(parsed, options)
      }
    }
    return originalLoadString(src, options)
  } as typeof pugLoad.string
}

/** Drop all cached parsed ASTs (test isolation; the cache is otherwise process-lifetime). */
export function clearPugParseCache(): void {
  parseCache.clear()
  hits = 0
  misses = 0
}

/** Hit/miss counters since the last clear, plus how many files are cached (dev diagnostics). */
export function getPugParseCacheStats(): { hits: number, misses: number, size: number } {
  return { hits, misses, size: parseCache.size }
}
