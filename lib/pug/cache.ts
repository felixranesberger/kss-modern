import fs from 'node:fs/promises'
import path from 'node:path'

export interface PugCacheEntry {
  /** The raw section markup that produced this entry (the compile input / cache key payload). */
  markupSource: string
  /** Final compiled HTML (post-format, post-accessibility-fix). */
  compiledHtml: string
  /** Absolute paths of every file the markup depends on (entry pug/html + includes/extends). */
  dependencies: string[]
  /** depPath -> signature; used to detect on-disk changes. */
  depSignatures: Map<string, string>
}

/**
 * Signature of a file used for cheap change detection: `mtimeMs:size`.
 * Sufficient for a single-user dev watcher; avoids reading file contents.
 * Returns null when the file is missing.
 */
async function signatureOf(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    return `${stat.mtimeMs}:${stat.size}`
  }
  catch {
    return null
  }
}

export async function computeDepSignatures(dependencies: string[]): Promise<Map<string, string>> {
  const signatures = new Map<string, string>()
  await Promise.all(dependencies.map(async (dep) => {
    const resolved = path.resolve(dep)
    const sig = await signatureOf(resolved)
    if (sig !== null)
      signatures.set(resolved, sig)
  }))
  return signatures
}

/**
 * Per-section compile cache that invalidates on dependency change.
 *
 * Unlike the previous prod-only `processCache`, this is safe to consult in development:
 * an entry is fresh only while the section's markup AND all of its dependency files are
 * unchanged. So a `.pug`/`_partial.pug` edit invalidates exactly the sections that use it,
 * and everything else is served from cache.
 */
export class PugCompileCache {
  private entries = new Map<string, PugCacheEntry>()

  get(sectionId: string): PugCacheEntry | undefined {
    return this.entries.get(sectionId)
  }

  set(sectionId: string, entry: PugCacheEntry): void {
    this.entries.set(sectionId, entry)
  }

  clear(): void {
    this.entries.clear()
  }

  /**
   * True when the cached entry can be reused for the given current markup:
   * same markup source and every dependency's on-disk signature unchanged.
   */
  async isFresh(sectionId: string, currentMarkupSource: string): Promise<boolean> {
    const entry = this.entries.get(sectionId)
    if (!entry)
      return false

    if (entry.markupSource !== currentMarkupSource)
      return false

    for (const [dep, signature] of entry.depSignatures) {
      const current = await signatureOf(dep)
      if (current !== signature)
        return false
    }

    return true
  }
}
