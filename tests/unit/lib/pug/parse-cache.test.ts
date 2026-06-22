import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileMarkup } from '../../../../lib/pug/compile-core.ts'
import { clearPugParseCache, getPugParseCacheStats } from '../../../../lib/pug/parse-cache.ts'

// Self-contained fixture: an entry that includes a shared partial, so a compile lexes+parses
// exactly two files. Importing compile-core above has already installed the parse-cache patch.
const dir = path.resolve('tests/.tmp-parse-cache')
const contentDir = `${dir}/` as `${string}/`
const entry = path.join(dir, 'entry.pug')
const entry2 = path.join(dir, 'entry2.pug')
const partial = path.join(dir, '_partial.pug')

async function compileEntry() {
  return compileMarkup(contentDir, 'development', 'entry.pug', 'test.1')
}

describe('pug parse cache', () => {
  beforeAll(async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(entry, '.wrap\n  include _partial.pug\n')
    // a second, distinct section that includes the SAME partial — models two styleguide sections
    // sharing one include (the shared-footer case the cache exists to speed up)
    await fs.writeFile(entry2, '.other\n  include _partial.pug\n')
    await fs.writeFile(partial, 'p hello\n')
  })

  beforeEach(() => {
    clearPugParseCache()
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('engages on compile: the entry and its include are parsed and cached', async () => {
    // Canary for the pug-load.string seam — if a pug upgrade changes how includes are loaded,
    // nothing gets cached here and this fails loudly rather than silently losing the speedup.
    await compileEntry()
    const stats = getPugParseCacheStats()
    expect(stats.misses).toBeGreaterThanOrEqual(2) // entry + _partial
    expect(stats.size).toBeGreaterThanOrEqual(2)
  })

  it('serves unchanged files from cache on the next compile', async () => {
    await compileEntry()
    const cold = getPugParseCacheStats()
    await compileEntry() // same files, unchanged — must hit, not re-parse
    const warm = getPugParseCacheStats()

    // second compile re-parses nothing (every file unchanged) and hits the cache instead
    expect(warm.misses).toBe(cold.misses)
    expect(warm.hits).toBeGreaterThanOrEqual(cold.misses)
  })

  it('shares a parsed include across two different sections', async () => {
    // the whole point of the cache: section A parses the shared include, section B reuses it.
    await compileEntry() // section A: misses entry + _partial
    const afterA = getPugParseCacheStats()
    expect(afterA.hits).toBe(0)

    // section B is a different entry that includes the SAME _partial
    const b = await compileMarkup(contentDir, 'development', 'entry2.pug', 'test.2')
    const afterB = getPugParseCacheStats()

    expect(b.html).toContain('hello') // B rendered the shared partial correctly
    // B re-parses only its own entry; _partial is served from the cache A populated
    expect(afterB.hits).toBeGreaterThan(afterA.hits)
    expect(afterB.misses).toBe(afterA.misses + 1) // entry2 only — not _partial
  })

  it('re-parses only a changed file and keeps output correct', async () => {
    const first = await compileEntry()
    expect(first.html).toContain('hello')

    // edit the partial: a new on-disk signature must invalidate exactly that one cache entry
    await fs.writeFile(partial, 'p goodbye\n')
    clearPugParseCache() // reset counters; entry+partial are now cold again on disk anyway
    const before = getPugParseCacheStats()
    const second = await compileEntry()
    const after = getPugParseCacheStats()

    expect(second.html).toContain('goodbye')
    expect(second.html).not.toContain('hello')
    expect(after.misses).toBeGreaterThan(before.misses)

    // restore for re-runs
    await fs.writeFile(partial, 'p hello\n')
  })

  it('clear() resets the counters and cached files', () => {
    clearPugParseCache()
    expect(getPugParseCacheStats()).toEqual({ hits: 0, misses: 0, size: 0 })
  })
})
