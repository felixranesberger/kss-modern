import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAll, rebuildSections } from '../../lib/index.ts'
import { getPugDependencyGraph, resetPugState } from '../../lib/pug/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

// Exercises the affinity WORKER POOL on an incremental rebuild. The dependency-tracking and
// incremental-rebuild suites only ever touch 1-2 sections, which take the inline (main-thread)
// path; here a single shared partial fans out to five sections, so the edit exceeds
// INLINE_THRESHOLD and is dispatched through runPinned across the worker slots — the real
// footer-edit production path. With more sections than slots on a low-core machine, several
// sections collide on the same slot, so this also covers per-slot serialization (no cross-talk).
const distAssetsExist = fs.existsSync(path.resolve('dist/styleguide-assets'))
const fixtureDir = path.resolve('tests/fixtures/worker-pool-content')
const tmpContent = path.resolve('tests/.tmp-worker-pool-content')
const tmpOut = path.resolve('tests/.tmp-worker-pool-out')

const config = createMinimalConfig({
  mode: 'development',
  outDir: tmpOut,
  contentDir: `${tmpContent}/`,
})

const widgetPug = path.join(tmpContent, 'pug', '_widget.pug')
const cards = ['a', 'b', 'c', 'd', 'e'] as const
const sectionIdByCard: Record<(typeof cards)[number], string> = { a: '1.1', b: '1.2', c: '1.3', d: '1.4', e: '1.5' }
const fullpage = (card: (typeof cards)[number]) => path.join(tmpOut, `fullpage-${sectionIdByCard[card]}.html`)

describe.skipIf(!distAssetsExist)('incremental rebuild via the worker pool', () => {
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

  it('maps the shared partial to all five sections (a worker-pool fan-out)', () => {
    const affected = getPugDependencyGraph().getAffectedSections(widgetPug).sort()
    expect(affected).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5'])
  })

  it('rebuilds every consumer through the pool, updating the shared part without cross-talk', async () => {
    // each card initially renders WIDGET_V1 plus its own distinct content
    for (const card of cards) {
      const html = await fs.readFile(fullpage(card), 'utf-8')
      expect(html).toContain('WIDGET_V1')
      expect(html).toContain(`Card ${card.toUpperCase()} content`)
    }

    await fs.writeFile(widgetPug, '.c-widget WIDGET_V2\n')
    const affected = getPugDependencyGraph().getAffectedSections(widgetPug)
    expect(affected.length).toBeGreaterThan(2) // > INLINE_THRESHOLD -> worker pool, not inline
    await rebuildSections(config, context, affected)

    // every section picked up the shared edit AND kept its own content — no slot mixed up outputs
    for (const card of cards) {
      const html = await fs.readFile(fullpage(card), 'utf-8')
      expect(html).toContain('WIDGET_V2')
      expect(html).not.toContain('WIDGET_V1')
      expect(html).toContain(`Card ${card.toUpperCase()} content`)
    }
  })

  it('reuses warm slots on a second edit and still produces correct output', async () => {
    // a second pass over the same worker slots (now warm); only the changed file re-parses
    await fs.writeFile(widgetPug, '.c-widget WIDGET_V3\n')
    const affected = getPugDependencyGraph().getAffectedSections(widgetPug)
    await rebuildSections(config, context, affected)

    for (const card of cards) {
      const html = await fs.readFile(fullpage(card), 'utf-8')
      expect(html).toContain('WIDGET_V3')
      expect(html).toContain(`Card ${card.toUpperCase()} content`)
    }
  })
})
