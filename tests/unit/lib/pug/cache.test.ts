import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeDepSignatures, PugCompileCache } from '../../../../lib/pug/cache.ts'

const tmpDep = path.resolve('tests/.tmp-cache-dep.pug')

async function entryFor(markupSource: string) {
  return {
    markupSource,
    compiledHtml: '<p>compiled</p>',
    dependencies: [tmpDep],
    depSignatures: await computeDepSignatures([tmpDep]),
  }
}

describe('pugCompileCache', () => {
  beforeAll(async () => {
    await fs.writeFile(tmpDep, 'p original\n')
  })

  afterAll(async () => {
    await fs.rm(tmpDep, { force: true })
  })

  it('is stale when there is no entry', async () => {
    const cache = new PugCompileCache()
    expect(await cache.isFresh('1.1', 'src')).toBe(false)
  })

  it('is fresh for unchanged markup and unchanged dependencies', async () => {
    const cache = new PugCompileCache()
    cache.set('1.1', await entryFor('src'))
    expect(await cache.isFresh('1.1', 'src')).toBe(true)
  })

  it('is stale when the markup source changes', async () => {
    const cache = new PugCompileCache()
    cache.set('1.1', await entryFor('src'))
    expect(await cache.isFresh('1.1', 'a different markup')).toBe(false)
  })

  it('is stale when a dependency file changes on disk', async () => {
    const cache = new PugCompileCache()
    cache.set('1.1', await entryFor('src'))

    // a different size yields a different signature
    await fs.writeFile(tmpDep, 'p original content, now noticeably longer\n')
    expect(await cache.isFresh('1.1', 'src')).toBe(false)
  })
})
