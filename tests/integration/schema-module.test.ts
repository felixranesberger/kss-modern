import type { ResolvedStyleguideConfiguration } from '../../lib/index.ts'
import type { MixinManifest } from '../../lib/mixins/index.ts'
import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createMixinPipeline } from '../../lib/mixins/index.ts'
import { isSchemaSource, prepareSchemaRegistry } from '../../lib/mixins/schema-registry.ts'
import { compileMarkup } from '../../lib/pug/compile-core.ts'
import { resetPugState } from '../../lib/pug/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

const tmpRoot = path.resolve('tests/.tmp-schema-module')
const tmpContent = path.join(tmpRoot, 'content')
const tmpOut = path.join(tmpRoot, 'out')

const FILES: Record<string, string> = {
  'shared/fields.ts': `import { z } from 'zod'

export const link = z.strictObject({
  text: z.string().min(1),
  href: z.string().min(1),
})
`,
  'molecules/card.schema.ts': `import { defineComponent } from 'kss-modern/schema'
import { z } from 'zod'
import { link } from '../shared/fields'

const input = z.strictObject({
  title: z.string().min(1),
  variant: z.enum(['default', 'highlight']).default('default'),
  cta: link.optional(),
})

type Input = z.output<typeof input>

export const card = defineComponent({
  name: 'molecules/Card',
  schema: input.transform((p: Input) => ({ ...p, isHighlighted: p.variant === 'highlight', hasCta: p.cta !== undefined })),
  examples: { title: 'Card title', cta: { text: 'More', href: '#' } },
})
`,
  'molecules/card.pug': `mixin card(props)
  - const p = defineComponent('molecules/Card', props)

  article.card(class=p.isHighlighted && 'card--highlight')
    h3= p.title
    if p.hasCta
      a(href=p.cta.href)= p.cta.text
`,
  'pages/teaser.pug': `include ../molecules/card
+card({ title: 'Hello', variant: 'highlight', cta: { text: 'Go', href: '/go' } })
`,
}

function createConfig(overrides: Partial<ResolvedStyleguideConfiguration> = {}): ResolvedStyleguideConfiguration {
  return createMinimalConfig({
    mode: 'development',
    outDir: tmpOut,
    contentDir: `${tmpContent}/`,
    cacheDir: false,
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

function getCard(manifest: MixinManifest) {
  const entry = manifest.mixins.find(candidate => candidate.name === 'card')
  if (!entry)
    throw new Error('no card mixin')
  return entry
}

describe('.schema.ts modules', () => {
  beforeEach(async () => {
    resetPugState()
    await fs.remove(tmpRoot)
    for (const [file, source] of Object.entries(FILES))
      await writeFile(file, source)
  })

  afterAll(async () => {
    await fs.remove(tmpRoot)
  })

  it('reads the schema of a mixin that names its component', async () => {
    const { manifest } = await createMixinPipeline(createConfig()).build()
    const card = getCard(manifest)

    expect(card).toMatchObject({ hasSchema: true, isSchemaModule: true, path: ['molecules', 'Card'] })
    expect(card.jsonSchema?.properties).toMatchObject({
      title: { type: 'string', minLength: 1, examples: ['Card title'] },
      variant: { default: 'default' },
      cta: { type: 'object', examples: [{ text: 'More', href: '#' }] },
    })
  })

  it('writes the modules for the playground, with zod and kss-modern/schema taken from shims', async () => {
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(manifest.schemaRegistry).toMatch(/^mixins\/schemas\/[\da-f]{16}\/registry\.js$/)

    const directory = path.join(tmpOut, path.dirname(manifest.schemaRegistry!))
    const card = await fs.readFile(path.join(directory, 'molecules/card.schema.js'), 'utf-8')
    expect(card).toContain(`from '../__zod.js'`)
    expect(card).toContain(`from '../__kss-modern-schema.js'`)
    expect(card).toContain(`from '../shared/fields.js'`)
    expect(card).not.toContain('Input')
    expect(await fs.pathExists(path.join(directory, '__zod.js'))).toBe(true)
    expect(await fs.pathExists(path.join(directory, '__kss-modern-schema.js'))).toBe(true)
  })

  it('still reads a component exported as a plain object', async () => {
    await writeFile('molecules/card.schema.ts', `import { z } from 'zod'\n\nexport const card = { name: 'molecules/Card', schema: z.strictObject({ title: z.string() }), examples: { title: 'Plain' } }\n`)
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(getCard(manifest).jsonSchema?.properties).toMatchObject({ title: { examples: ['Plain'] } })
  })

  it('renders a section with the transformed props and depends on the schema sources', async () => {
    const registry = await prepareSchemaRegistry(tmpContent)
    if (!registry || 'error' in registry)
      throw new Error('no registry')

    const { html, dependencies } = await compileMarkup(`${tmpContent}/`, 'development', 'pages/teaser.pug', 'teaser', registry.nodeRegistry)
    expect(html).toContain('<article class="card card--highlight">')
    expect(html).toContain('<a href="/go">Go</a>')
    expect(dependencies).toEqual(expect.arrayContaining([
      path.join(tmpContent, 'molecules/card.schema.ts'),
      path.join(tmpContent, 'shared/fields.ts'),
    ]))
    expect(isSchemaSource(path.join(tmpContent, 'shared/fields.ts'))).toBe(true)
  })

  it('picks up an edit of an imported file', async () => {
    const pipeline = createMixinPipeline(createConfig())
    const first = await pipeline.build()

    const fields = await writeFile('shared/fields.ts', FILES['shared/fields.ts'].replace('href: z.string().min(1)', 'href: z.string().min(2)'))
    const second = await pipeline.build([fields])

    expect(second.manifest.schemaRegistry).not.toBe(first.manifest.schemaRegistry)
    const cta = getCard(second.manifest).jsonSchema?.properties as Record<string, { properties: Record<string, unknown> }>
    expect(cta.cta.properties.href).toMatchObject({ minLength: 2 })
    // the old hash directory is gone
    expect(await fs.pathExists(path.join(tmpOut, path.dirname(first.manifest.schemaRegistry!)))).toBe(false)
  })

  it('reports an import the playground cannot resolve', async () => {
    await writeFile('molecules/card.schema.ts', `import { z } from 'zod'\nimport { merge } from 'lodash'\n\nexport const card = { name: 'molecules/Card', schema: z.strictObject({}) }\n`)
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(getCard(manifest)).toMatchObject({ hasSchema: false, schemaError: expect.stringContaining('only zod, kss-modern/schema and relative files') })
  })

  it('reports a component name no .schema.ts file exports', async () => {
    await writeFile('molecules/card.pug', FILES['molecules/card.pug'].replace(`'molecules/Card'`, `'molecules/Teaser'`))
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(getCard(manifest).schemaError).toContain('No .schema.ts file exports a component named "molecules/Teaser"')
  })

  it('rejects examples for props the schema does not have', async () => {
    await writeFile('molecules/card.schema.ts', FILES['molecules/card.schema.ts'].replace(`examples: { title`, `examples: { subtitle: 'x', title`))
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(getCard(manifest).schemaError).toContain('`examples` names the prop "subtitle"')
  })
})
