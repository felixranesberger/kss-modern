import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAll, rebuildSections } from '../../lib/index.ts'
import { getPugDependencyGraph, resetPugState } from '../../lib/pug/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

const distAssetsExist = fs.existsSync(path.resolve('dist/styleguide-assets'))
const fixtureDir = path.resolve('tests/fixtures/incremental-content')
const tmpContent = path.resolve('tests/.tmp-incremental-content')
const tmpOut = path.resolve('tests/.tmp-incremental-out')

const config = createMinimalConfig({
  mode: 'development',
  outDir: tmpOut,
  contentDir: `${tmpContent}/`,
})

const cardPug = path.join(tmpContent, 'pug', 'card.pug')
const cardBodyPug = path.join(tmpContent, 'pug', '_card-body.pug')
const cardFullpage = path.join(tmpOut, 'fullpage-1.1.html')
const buttonFullpage = path.join(tmpOut, 'fullpage-1.2.html')
const composedFullpage = path.join(tmpOut, 'fullpage-1.3.html')

describe.skipIf(!distAssetsExist)('incremental rebuild', () => {
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

  it('maps an included partial to its consuming section', () => {
    expect(getPugDependencyGraph().getAffectedSections(cardBodyPug)).toContain('1.1')
  })

  it('maps the entry pug file to its section', () => {
    expect(getPugDependencyGraph().getAffectedSections(cardPug)).toContain('1.1')
  })

  it('compiles useId server-side in the dev build', async () => {
    expect(await fs.readFile(cardFullpage, 'utf-8')).toContain('id="id-1-1-title"')
  })

  it('rebuilds only the affected fullpages, leaving others byte-identical', async () => {
    const cardBefore = await fs.readFile(cardFullpage, 'utf-8')
    const buttonBefore = await fs.readFile(buttonFullpage, 'utf-8')

    await fs.writeFile(cardPug, 'article.c-card\n  h3(id=useId(\'title\')) Card EDITED\n  include _card-body.pug\n')
    const affected = getPugDependencyGraph().getAffectedSections(cardPug)
    await rebuildSections(config, context, affected)

    const cardAfter = await fs.readFile(cardFullpage, 'utf-8')
    const buttonAfter = await fs.readFile(buttonFullpage, 'utf-8')

    expect(cardAfter).not.toBe(cardBefore)
    expect(cardAfter).toContain('Card EDITED')
    // the unrelated button section was not recompiled or rewritten
    expect(buttonAfter).toBe(buttonBefore)
  })

  it('propagates a partial edit to <insert-markup> consumers', async () => {
    const composedBefore = await fs.readFile(composedFullpage, 'utf-8')

    await fs.writeFile(cardBodyPug, '.c-card__body\n  p Card body REBUILT\n')
    const affected = getPugDependencyGraph().getAffectedSections(cardBodyPug)
    expect(affected).toContain('1.1')
    await rebuildSections(config, context, affected)

    // section 1.3 embeds 1.1 via <insert-markup>, so it must pick up the partial change
    const composedAfter = await fs.readFile(composedFullpage, 'utf-8')
    expect(composedAfter).not.toBe(composedBefore)
    expect(composedAfter).toContain('Card body REBUILT')
  })
})
