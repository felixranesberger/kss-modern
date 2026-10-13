import type { ResolvedStyleguideConfiguration } from '../../lib/index.ts'
import type { MixinManifest } from '../../lib/mixins/index.ts'
import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildAll } from '../../lib/index.ts'
import { createMixinPipeline } from '../../lib/mixins/index.ts'
import { compileMarkup } from '../../lib/pug/compile-core.ts'
import { compilePugMarkup, resetPugState } from '../../lib/pug/index.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

const distAssetsExist = fs.existsSync(path.resolve('dist/styleguide-assets'))
const fixtureDir = path.resolve('tests/fixtures/mixin-content')
const tmpRoot = path.resolve('tests/.tmp-mixin-pipeline')
const tmpContent = path.join(tmpRoot, 'content')
const tmpOut = path.join(tmpRoot, 'out')
const tmpCache = path.join(tmpRoot, 'cache')

function createConfig(overrides: Partial<ResolvedStyleguideConfiguration> = {}): ResolvedStyleguideConfiguration {
  return createMinimalConfig({
    mode: 'development',
    outDir: tmpOut,
    contentDir: `${tmpContent}/`,
    cacheDir: tmpCache,
    ...overrides,
  })
}

function byId(manifest: MixinManifest, id: string) {
  const entry = manifest.mixins.find(candidate => candidate.id === id)
  if (!entry)
    throw new Error(`no mixin ${id}`)
  return entry
}

/** Rewrite a fixture file so its signature changes even within the same millisecond. */
async function editFile(relativePath: string, transform: (source: string) => string): Promise<string> {
  const filePath = path.join(tmpContent, relativePath)
  await fs.writeFile(filePath, transform(await fs.readFile(filePath, 'utf-8')))
  const later = new Date(Date.now() + 5000)
  await fs.utimes(filePath, later, later)
  return filePath
}

describe('mixin pipeline', () => {
  beforeEach(async () => {
    resetPugState()
    await fs.remove(tmpRoot)
    await fs.copy(fixtureDir, tmpContent)
  })

  afterAll(async () => {
    await fs.remove(tmpRoot)
  })

  it('publishes only the mixins that declare a mixinSchema', async () => {
    const { manifest } = await createMixinPipeline(createConfig()).build()

    // icon and legacy declare no schema: internal building blocks, not listed
    expect(manifest.mixins.map(entry => [entry.name, entry.hasSchema])).toEqual([
      ['badge', true],
      ['broken', false],
      ['button', true],
    ])
    expect(byId(manifest, 'button')).toMatchObject({ args: 'props', line: 2, path: ['atoms', 'Button'], file: expect.stringMatching(/pug\/_button\.pug$/) })
    expect(byId(manifest, 'badge').path).toEqual(['badge'])
    expect(byId(manifest, 'button').module).toMatch(/^mixins\/button\.[0-9a-f]{10}\.js$/)
  })

  it('takes the schema description', async () => {
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(byId(manifest, 'badge').description).toBe('A small status label')
    expect(byId(manifest, 'button').description).toBeUndefined()
  })

  it('turns a broken schema into a warning and lists the mixin without playground', async () => {
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(byId(manifest, 'broken')).toMatchObject({ hasSchema: false, schemaError: expect.stringContaining('objekt') })
  })

  it('writes the modules and the manifest', async () => {
    const { manifest } = await createMixinPipeline(createConfig()).build()

    const written = JSON.parse(await fs.readFile(path.join(tmpOut, 'mixins/manifest.json'), 'utf-8')) as MixinManifest
    expect(written).toEqual(manifest)
    expect(await fs.readFile(path.join(tmpOut, byId(manifest, 'button').module!), 'utf-8')).toContain('export { render }')
  })

  it('compiles nothing on a second build without changes', async () => {
    const pipeline = createMixinPipeline(createConfig())
    expect((await pipeline.build()).stats).toMatchObject({ compiled: 2, cached: 0 })
    expect((await pipeline.build()).stats).toMatchObject({ compiled: 0, cached: 2, schemasEvaluated: 0 })
  })

  it('compiles nothing after a restart, served from the disk cache', async () => {
    await createMixinPipeline(createConfig()).build()

    // a new process: fresh in-memory state, only the disk cache survives
    resetPugState()
    const { stats } = await createMixinPipeline(createConfig()).build()
    expect(stats).toMatchObject({ compiled: 0, cached: 2, schemasEvaluated: 0 })
  })

  it('does not recompile files that were only touched (same content, new mtime)', async () => {
    await createMixinPipeline(createConfig()).build()
    await editFile('pug/_icon.pug', source => source)

    resetPugState()
    expect((await createMixinPipeline(createConfig()).build()).stats.compiled).toBe(0)
  })

  it('discards a corrupt disk cache silently', async () => {
    await createMixinPipeline(createConfig()).build()
    const [cacheFile] = await fs.readdir(tmpCache)
    await fs.writeFile(path.join(tmpCache, cacheFile), '{ not json')

    resetPugState()
    expect((await createMixinPipeline(createConfig()).build()).stats).toMatchObject({ compiled: 2 })
  })

  it('recompiles only the consumers of a changed partial', async () => {
    const pipeline = createMixinPipeline(createConfig())
    const first = await pipeline.build()

    const iconFile = await editFile('pug/_icon.pug', source => source.replace('svg(class=iconPrefix', 'svg(class=iconPrefix role="img"'))
    const second = await pipeline.build([iconFile])

    expect(second.stats).toMatchObject({ compiled: 1, cached: 1 })
    expect(byId(second.manifest, 'button').module).not.toBe(byId(first.manifest, 'button').module)
    expect(byId(second.manifest, 'badge').module).toBe(byId(first.manifest, 'badge').module)
  })

  it('re-evaluates only the schema that changed', async () => {
    const pipeline = createMixinPipeline(createConfig())
    await pipeline.build()

    const badgeFile = await editFile('pug/_badge.pug', source => source.replace('text: z.string(),', 'text: z.string().describe(\'Badge text\'),'))
    const { manifest, stats } = await pipeline.build([badgeFile])

    expect(stats.schemasEvaluated).toBe(1)
    expect(byId(manifest, 'badge').jsonSchema).toMatchObject({ properties: { text: { description: 'Badge text' } } })
  })

  it('does not re-evaluate the schema when only the mixin body changed', async () => {
    const pipeline = createMixinPipeline(createConfig())
    await pipeline.build()

    const badgeFile = await editFile('pug/_badge.pug', source => source.replace('span.badge=', 'strong.badge='))
    const { stats } = await pipeline.build([badgeFile])

    expect(stats).toMatchObject({ schemasEvaluated: 0, compiled: 1 })
  })

  it('reuses the last result without any work for a build without markup changes', async () => {
    const pipeline = createMixinPipeline(createConfig())
    const first = await pipeline.build()
    expect(await pipeline.build([])).toBe(first)
    expect(await pipeline.build([path.join(tmpContent, 'sass/styles.scss')])).toBe(first)
  })

  it('rediscovers added and removed files and reports the navigation change', async () => {
    const pipeline = createMixinPipeline(createConfig())
    await pipeline.build()

    const addedFile = path.join(tmpContent, 'pug/_tag.pug')
    await fs.writeFile(addedFile, 'mixin tag(props)\n  -\n    var mixinSchema = z.object({ text: z.string() })\n  span= mixinSchema.parse(props).text\n')
    const added = await pipeline.build([addedFile])
    expect(added.isNavigationChanged).toBe(true)
    expect(byId(added.manifest, 'tag').hasSchema).toBe(true)

    await fs.remove(addedFile)
    const removed = await pipeline.build([addedFile])
    expect(removed.isNavigationChanged).toBe(true)
    expect(removed.manifest.mixins.some(entry => entry.id === 'tag')).toBe(false)
    expect((await fs.readdir(path.join(tmpOut, 'mixins'))).some(file => file.startsWith('tag.'))).toBe(false)
  })

  it('keeps the last good module and reports the error in development', async () => {
    const pipeline = createMixinPipeline(createConfig())
    const first = await pipeline.build()

    const badgeFile = await editFile('pug/_badge.pug', source => source.replace('span.badge=', 'span.badge(=')) // unbalanced paren
    const { manifest } = await pipeline.build([badgeFile])

    expect(byId(manifest, 'badge').error?.message).toBeTruthy()
    expect(byId(manifest, 'badge').module).toBe(byId(first.manifest, 'badge').module)
    expect(byId(manifest, 'button').error).toBeUndefined()
  })

  it('fails a production build on a schema outside the supported zod features', async () => {
    await fs.remove(path.join(tmpContent, 'pug/_broken-schema.pug'))
    await editFile('pug/_badge.pug', source => source.replace('text: z.string(),', 'text: z.string(), meta: z.object({ a: z.string() }),'))

    await expect(createMixinPipeline(createConfig({ mode: 'production' })).build())
      .rejects
      .toThrow(/Invalid mixinSchema in 1 mixin[\s\S]*badge[\s\S]*prop "meta" is an object/)
  })

  it('lists such a schema with its error in development', async () => {
    await editFile('pug/_badge.pug', source => source.replace('text: z.string(),', 'text: z.string(), at: z.date(),'))
    const { manifest } = await createMixinPipeline(createConfig()).build()
    expect(byId(manifest, 'badge')).toMatchObject({ hasSchema: false, schemaError: expect.stringContaining('Date cannot be represented') })
  })

  it('fails a production build on a mixin compile error', async () => {
    await editFile('pug/_badge.pug', source => `include _missing-partial\n${source}`)
    await expect(createMixinPipeline(createConfig({ mode: 'production' })).build()).rejects.toThrow(/Pug compilation failed for 1 mixin/)
  })
})

describe('the z local in regular section markup', () => {
  it('lets sections call mixins that parse their props with a schema', async () => {
    const { html } = await compileMarkup(`${fixtureDir}/`, 'development', '<insert-vite-pug src="pug/toolbar.pug"></insert-vite-pug>', '1.1')

    expect(html).toContain('<button class="btn btn--primary" id="id-1-1-btn"><svg class="icon" data-name="disk"></svg>Save</button>')
    expect(html).toContain('<span class="badge">New 0</span>')
  })

  it('reports the mixins the markup called, as a tree', async () => {
    const { mixinUsage } = await compileMarkup(`${fixtureDir}/`, 'development', '<insert-vite-pug src="pug/toolbar.pug"></insert-vite-pug>', '1.1')
    expect(mixinUsage).toEqual([
      { name: 'button', count: 1, children: [{ name: 'icon', count: 1, children: [] }] },
      { name: 'badge', count: 1, children: [] },
    ])
  })

  it('keeps the mixin usage on a compile cache hit', async () => {
    resetPugState()
    const repository = new Map([['1.1', { markup: '<insert-vite-pug src="pug/toolbar.pug"></insert-vite-pug>' }]])
    await compilePugMarkup('development', `${fixtureDir}/`, repository)
    const cached = await compilePugMarkup('development', `${fixtureDir}/`, repository)
    expect(cached.get('1.1')?.mixinUsage?.map(node => node.name)).toEqual(['button', 'badge'])
  })
})

describe.skipIf(!distAssetsExist)('mixin pages', () => {
  beforeEach(async () => {
    resetPugState()
    await fs.remove(tmpRoot)
    await fs.copy(fixtureDir, tmpContent)
  })

  afterAll(async () => {
    await fs.remove(tmpRoot)
  })

  it('writes the explorer and the standalone pages and links them in the navigation', async () => {
    await buildAll(createConfig())

    const explorer = await fs.readFile(path.join(tmpOut, 'mixins.html'), 'utf-8')
    expect(explorer).toContain('data-mixin-explorer')
    expect(explorer).toContain('data-explorer-item="broken"')
    expect(explorer).not.toContain('data-explorer-item="legacy"')
    expect(explorer).toContain('href="mixins.html#mixin=button"')
    // the first playground in tree order (folders first) is selected up front
    expect(explorer).toContain('src="mixins-button-standalone.html?controls=0&amp;embed=1"')
    expect(explorer).toMatch(/<summary[\s\S]*?atoms[\s\S]*?data-explorer-item="button"/)
    expect(await fs.pathExists(path.join(tmpOut, 'mixins-button.html'))).toBe(false)

    const standalone = await fs.readFile(path.join(tmpOut, 'mixins-button-standalone.html'), 'utf-8')
    expect(standalone).toContain('<div data-kss-mixin-root></div>')
    expect(standalone).toContain('id="kss-playground-config"')
    expect(standalone).not.toContain('class="relative min-h-screen')

    const sectionPage = await fs.readFile(path.join(tmpOut, 'index.html'), 'utf-8')
    expect(sectionPage).toContain('href="mixins.html"')
  })
})
