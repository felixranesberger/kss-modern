import type { ResolvedStyleguideConfiguration } from '../../lib/index.ts'
import type { MixinFixtureFile } from '../../lib/mixins/fixture-export.ts'
import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { formatMixinFixtureReport } from '../../lib/mixins/fixture-export.ts'
import { createMixinPipeline } from '../../lib/mixins/index.ts'
import { resetPugState } from '../../lib/pug/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

const tmpRoot = path.resolve('tests/.tmp-mixin-fixtures')
const tmpContent = path.join(tmpRoot, 'content')
const tmpOut = path.join(tmpRoot, 'out')
const fixtureDir = path.join(tmpRoot, 'fixtures')

const FILES: Record<string, string> = {
  // the named slots of hss.de: `+fragment('<name>')` in the call, `$fragments.collect(block)` in the mixin
  'fragment.pug': `mixin fragment(name)
  - const start = pug_html.length
  - block && block()
  - pug_mixins.$fragments.target[name] = pug_html.slice(start)
  - pug_html = pug_html.slice(0, start)

-
  pug_mixins.$fragments = pug_mixins.$fragments || {
    target: {},
    collect(block) {
      const outer = this.target
      const slots = this.target = {}
      block && block()
      this.target = outer
      return slots
    },
  }
`,
  'fragments.ts': `import { withFake } from 'kss-modern/schema'
import { z } from 'zod'

export const image = withFake(
  z.strictObject({ src: z.string().min(1), alt: z.string().default('') }),
  f => ({ src: f.helpers.arrayElement(['people/1', 'people/2']), alt: f.lorem.words(2) }),
)
`,
  'molecules/teaser.schema.ts': `import { defineComponent } from 'kss-modern/schema'
import { z } from 'zod'
import { image } from '../fragments'

export const teaser = defineComponent({
  name: 'molecules/Teaser',
  schema: z.strictObject({
    title: z.string().min(1),
    variant: z.enum(['default', 'large']).default('default'),
    image: image.optional(),
  }),
  examples: { title: f => f.lorem.words(3) },
  slots: { footer: '<a href="#more">More</a>' },
})
`,
  'molecules/teaser.pug': `include ../fragment

mixin teaser(props)
  - const p = defineComponent('molecules/Teaser', props)
  - const slots = pug_mixins.$fragments.collect(block)
  article.teaser(class=p.variant === 'large' && 'teaser--large')
    if p.image
      img.teaser__image(src=p.image.src alt=p.image.alt)
    h3.teaser__title= p.title
    if slots.footer
      footer.teaser__footer!= slots.footer
`,
  'atoms/box.pug': `mixin box(props)
  -
    const p = defineComponent({
      name: 'atoms/Box',
      schema: z.strictObject({ dark: z.boolean().default(false) }),
      examples: {},
    }, props)
  div.box(class=p.dark && 'box--dark')
    block
`,
}

function createConfig(overrides: Partial<ResolvedStyleguideConfiguration> = {}): ResolvedStyleguideConfiguration {
  return createMinimalConfig({
    mode: 'development',
    outDir: tmpOut,
    contentDir: `${tmpContent}/`,
    cacheDir: false,
    mixinFixtureDir: fixtureDir,
    ...overrides,
  })
}

async function writeFile(relativePath: string, source: string): Promise<string> {
  const filePath = path.join(tmpContent, relativePath)
  await fs.outputFile(filePath, source)
  // a distinct signature even within the same millisecond
  const later = new Date(Date.now() + 5000 + Math.random() * 1000)
  await fs.utimes(filePath, later, later)
  return filePath
}

async function readFixture(relativePath: string): Promise<MixinFixtureFile> {
  return JSON.parse(await fs.readFile(path.join(fixtureDir, relativePath), 'utf-8')) as MixinFixtureFile
}

describe('mixinFixtureDir', () => {
  beforeEach(async () => {
    resetPugState()
    await fs.remove(tmpRoot)
    for (const [file, source] of Object.entries(FILES))
      await writeFile(file, source)
  })

  afterAll(async () => {
    await fs.remove(tmpRoot)
  })

  it('writes the cases of every component with the markup of its mixin', async () => {
    await createMixinPipeline(createConfig()).build()
    const teaser = await readFixture('molecules/Teaser.json')

    expect(teaser).toMatchObject({ component: 'molecules/Teaser', seed: 1, errors: [], report: { mode: 'full', unreachable: [], renderErrors: [] } })
    expect(teaser.inputHash).toMatch(/^[\da-f]+$/)
    // variant x (-image, +image -alt, +image +alt) x slot:footer, all valid
    expect(teaser.report.dimensions.map(dimension => dimension.key)).toEqual(['variant', 'image', 'image.alt', 'slot:footer'])
    expect(teaser.cases).toHaveLength(12)
    for (const testCase of teaser.cases) {
      expect(testCase.html).toContain('<!-- START TEASER-->')
      expect(testCase.html).toContain('<article class="teaser')
    }

    const withImage = teaser.cases.find(testCase => testCase.props.image !== undefined && testCase.slots.footer !== undefined)!
    expect(withImage.files).toEqual(['image.src'])
    expect(withImage.html).toContain(`src="${(withImage.props.image as { src: string }).src}"`)
    expect(withImage.html).toContain('<footer class="teaser__footer"><a href="#more">More</a></footer>')

    const minimal = teaser.cases.find(testCase => testCase.name === 'minimal')!
    expect(minimal.props).toEqual({ title: expect.any(String) })
    expect(minimal.html).not.toContain('<footer')
  })

  it('fills the default slot as the block of the call', async () => {
    await createMixinPipeline(createConfig()).build()
    const box = await readFixture('atoms/Box.json')

    expect(box.report.dimensions.map(dimension => dimension.key)).toEqual(['dark', 'slot:default'])
    const filled = box.cases.find(testCase => testCase.slots.default !== undefined && testCase.props.dark === true)!
    expect(filled.html).toContain('<div class="box box--dark"><p data-slot="default">Slot default</p></div>')
  })

  it('does not rewrite a file whose input is unchanged, also in a new process', async () => {
    await createMixinPipeline(createConfig()).build()
    const file = path.join(fixtureDir, 'molecules/Teaser.json')
    const past = new Date('2020-01-01T00:00:00Z')
    await fs.utimes(file, past, past)

    resetPugState()
    await createMixinPipeline(createConfig()).build()
    expect((await fs.stat(file)).mtime).toEqual(past)

    // a changed example makes a new hash and new cases
    const before = await readFixture('molecules/Teaser.json')
    const pipeline = createMixinPipeline(createConfig())
    await pipeline.build()
    const schema = await writeFile('molecules/teaser.schema.ts', FILES['molecules/teaser.schema.ts'].replace(`'<a href="#more">More</a>'`, `'<a href="#all">All</a>'`))
    await pipeline.build([schema])
    const after = await readFixture('molecules/Teaser.json')
    expect(after.inputHash).not.toBe(before.inputHash)
    expect(after.cases.some(testCase => testCase.html?.includes('#all'))).toBe(true)
    expect((await fs.stat(file)).mtime).not.toEqual(past)
  })

  it('removes the file of a component that is gone and leaves other files alone', async () => {
    await fs.outputFile(path.join(fixtureDir, 'README.json'), '{ "own": true }\n')
    const pipeline = createMixinPipeline(createConfig())
    await pipeline.build()
    expect(await fs.pathExists(path.join(fixtureDir, 'atoms/Box.json'))).toBe(true)

    await fs.remove(path.join(tmpContent, 'atoms/box.pug'))
    await pipeline.build()
    expect(await fs.pathExists(path.join(fixtureDir, 'atoms/Box.json'))).toBe(false)
    expect(await fs.pathExists(path.join(fixtureDir, 'README.json'))).toBe(true)
  })

  it('reports a render error and fails a production build with it', async () => {
    await writeFile('atoms/box.pug', FILES['atoms/box.pug'].replace(`div.box(class=p.dark && 'box--dark')`, `- if (p.dark) throw new Error('dark is broken')\n  div.box`))
    await createMixinPipeline(createConfig()).build()
    const box = await readFixture('atoms/Box.json')
    expect(box.report.renderErrors).toEqual([{ case: '+dark', message: 'dark is broken' }])
    expect(box.cases.find(testCase => testCase.name === '+dark')).toMatchObject({ error: 'dark is broken' })
    expect(box.cases.find(testCase => testCase.name === '+dark')).not.toHaveProperty('html')

    resetPugState()
    await expect(createMixinPipeline(createConfig({ mode: 'production' })).build()).rejects.toThrow(/Test fixtures failed for 1 mixin\(s\):[\s\S]*atoms\/Box[\s\S]*dark is broken/)
  })

  it('formats the report of the written files', async () => {
    await createMixinPipeline(createConfig()).build()
    const overview = await formatMixinFixtureReport(fixtureDir)
    expect(overview).toMatch(/atoms\/Box\s+full\s+4/)
    expect(overview).toContain('2 components, 16 cases')

    const report = await formatMixinFixtureReport(fixtureDir, 'molecules/Teaser')
    expect(report).toContain('molecules/Teaser: 12 cases, full product')
    expect(report).toContain('variant: variant=default variant=large')
    await expect(formatMixinFixtureReport(fixtureDir, 'molecules/Nope')).rejects.toThrow('No test fixtures for "molecules/Nope"')
  })
})
