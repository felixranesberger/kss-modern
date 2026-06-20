import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildAll, rebuildSections } from '../../lib/index.ts'
import { getPugDependencyGraph, resetPugState } from '../../lib/pug/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

const distAssetsExist = fs.existsSync(path.resolve('dist/styleguide-assets'))
const fixtureDir = path.resolve('tests/fixtures/dependency-tracking-content')
const tmpContent = path.resolve('tests/.tmp-deptrack-content')
const tmpOut = path.resolve('tests/.tmp-deptrack-out')

const config = createMinimalConfig({
  mode: 'development',
  outDir: tmpOut,
  contentDir: `${tmpContent}/`,
})

const pug = (name: string) => path.join(tmpContent, 'pug', name)
const fullpage = (ref: string) => path.join(tmpOut, `fullpage-${ref}.html`)
const read = (file: string) => fs.readFile(file, 'utf-8')
const affected = (file: string) => getPugDependencyGraph().getAffectedSections(file).sort()

describe.skipIf(!distAssetsExist)('dependency tracking', () => {
  let context: Awaited<ReturnType<typeof buildAll>>['context']

  beforeAll(async () => {
    resetPugState()
    await fs.remove(tmpContent)
    await fs.remove(tmpOut)
    await fs.copy(fixtureDir, tmpContent)
    await fs.ensureDir(tmpOut)
    context = (await buildAll(config)).context
  }, 60_000)

  afterAll(async () => {
    await fs.remove(tmpContent)
    await fs.remove(tmpOut)
  })

  // --- graph mapping from the initial build (read-only) ---
  describe('graph mapping', () => {
    it('maps a transitively-included partial to its section', () => {
      // nested.pug -> _mid.pug -> _leaf.pug
      expect(affected(pug('_leaf.pug'))).toContain('1.1')
      expect(affected(pug('_mid.pug'))).toContain('1.1')
    })

    it('maps an extended layout to its section', () => {
      // page.pug extends _base.pug
      expect(affected(pug('_base.pug'))).toContain('1.2')
    })

    it('maps a shared partial to every consuming section', () => {
      expect(affected(pug('_shared.pug'))).toEqual(['1.3', '1.4'])
    })

    it('maps an entry pug file to its section', () => {
      expect(affected(pug('nested.pug'))).toEqual(['1.1'])
    })

    it('returns no sections for a pug file nothing references', () => {
      expect(affected(pug('orphan-never-referenced.pug'))).toEqual([])
    })
  })

  // --- incremental rebuilds as files change (ordered: each builds on the previous) ---
  describe('rebuild on dependency changes', () => {
    it('rebuilds every consumer when a shared partial changes', async () => {
      const aBefore = await read(fullpage('1.3'))
      const bBefore = await read(fullpage('1.4'))

      await fs.writeFile(pug('_shared.pug'), 'p Shared v2\n')
      await rebuildSections(config, context, affected(pug('_shared.pug')))

      const aAfter = await read(fullpage('1.3'))
      const bAfter = await read(fullpage('1.4'))
      expect(aAfter).not.toBe(aBefore)
      expect(bAfter).not.toBe(bBefore)
      expect(aAfter).toContain('Shared v2')
      expect(bAfter).toContain('Shared v2')
    })

    it('rebuilds only the affected section when a transitive partial changes', async () => {
      const nestedBefore = await read(fullpage('1.1'))
      const layoutBefore = await read(fullpage('1.2'))

      await fs.writeFile(pug('_leaf.pug'), 'p Leaf v2\n')
      await rebuildSections(config, context, affected(pug('_leaf.pug')))

      expect(await read(fullpage('1.1'))).not.toBe(nestedBefore)
      expect(await read(fullpage('1.1'))).toContain('Leaf v2')
      // the unrelated layout section is untouched
      expect(await read(fullpage('1.2'))).toBe(layoutBefore)
    })

    it('clears stale edges when an include is removed', async () => {
      // before: 1.1 depends on _mid + _leaf
      expect(affected(pug('_leaf.pug'))).toEqual(['1.1'])

      await fs.writeFile(pug('nested.pug'), '.nested\n  p inlined now\n')
      await rebuildSections(config, context, affected(pug('nested.pug')))

      // after: the dropped partials no longer map to 1.1, but the entry file still does
      expect(affected(pug('_leaf.pug'))).toEqual([])
      expect(affected(pug('_mid.pug'))).toEqual([])
      expect(affected(pug('nested.pug'))).toEqual(['1.1'])
      expect(await read(fullpage('1.1'))).toContain('inlined now')
    })

    it('creates a new edge when an include is added', async () => {
      expect(affected(pug('_extra.pug'))).toEqual([])

      await fs.writeFile(pug('_extra.pug'), 'p Extra v1\n')
      await fs.writeFile(pug('shared-a.pug'), '.shared-a\n  include _shared.pug\n  include _extra.pug\n')
      await rebuildSections(config, context, affected(pug('shared-a.pug')))

      expect(affected(pug('_extra.pug'))).toEqual(['1.3'])
      expect(await read(fullpage('1.3'))).toContain('Extra v1')
    })

    it('follows a renamed partial when its include is updated', async () => {
      // _extra.pug currently maps to 1.3 (added in the previous test)
      expect(affected(pug('_extra.pug'))).toEqual(['1.3'])

      await fs.move(pug('_extra.pug'), pug('_extra-renamed.pug'))
      await fs.writeFile(pug('shared-a.pug'), '.shared-a\n  include _shared.pug\n  include _extra-renamed.pug\n')
      await rebuildSections(config, context, affected(pug('shared-a.pug')))

      // the old path stops mapping; the new path takes over
      expect(affected(pug('_extra.pug'))).toEqual([])
      expect(affected(pug('_extra-renamed.pug'))).toEqual(['1.3'])
      expect(await read(fullpage('1.3'))).toContain('Extra')
    })

    it('keeps the last good output when a referenced file is deleted', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const bBefore = await read(fullpage('1.4'))

      await fs.remove(pug('_shared.pug'))
      // the graph edge survives a delete, so the consumers are still picked up
      const ids = affected(pug('_shared.pug'))
      expect(ids).toContain('1.4')

      await expect(rebuildSections(config, context, ids)).resolves.toBeUndefined()

      // 1.4 retains its last-good HTML rather than crashing or emitting an empty page
      expect(await read(fullpage('1.4'))).toBe(bBefore)
      expect(await read(fullpage('1.4'))).toContain('Shared v2')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })
})
