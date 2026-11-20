import type { Examples } from '../../../lib/component-schema.ts'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import * as componentSchema from '../../../lib/component-schema.ts'
import { COMPONENT_SCHEMA_SHIM_SOURCE } from '../../../lib/mixins/schema-registry.ts'

const { defineComponent, getFake, withFake } = componentSchema

describe('defineComponent of kss-modern/schema', () => {
  const schema = z.strictObject({
    text: z.string(),
    variant: z.enum(['primary', 'outline']).optional(),
    cta: z.strictObject({ text: z.string(), href: z.string() }).optional(),
  })
  const examples = { text: 'Learn more', cta: { text: 'More', href: '#' } }

  it('returns the definition unchanged', () => {
    const definition = { name: 'atoms/Button', schema, examples }
    expect(defineComponent(definition)).toBe(definition)
  })

  it('keeps the literal name', () => {
    const button = defineComponent({ name: 'atoms/Button', schema, examples })
    expectTypeOf(button.name).toEqualTypeOf<'atoms/Button'>()
  })

  it('takes the examples of the props a transform starts from', () => {
    const intro = defineComponent({
      name: 'organisms/Intro',
      schema: schema.transform(p => ({ ...p, isPrimary: p.variant === 'primary' })),
      examples,
    })
    expectTypeOf(intro.examples).toEqualTypeOf<Examples<typeof schema>>()
  })
})

describe('withFake and getFake', () => {
  const fake = () => ({ text: 'More', href: '#' })

  it('returns the schema and finds the fake through wrappers and clones', () => {
    const link = z.strictObject({ text: z.string(), href: z.string() })
    expect(withFake(link, fake)).toBe(link)

    expect(getFake(link)).toBe(fake)
    expect(getFake(link.optional())).toBe(fake)
    expect(getFake(link.nullable().optional())).toBe(fake)
    expect(getFake(link.default({ text: 'x', href: '#' }))).toBe(fake)
    expect(getFake(link.describe('A link').optional())).toBe(fake)
    expect(getFake(link.meta({ title: 'Link' }))).toBe(fake)
  })

  it('finds nothing on other schemas', () => {
    const link = withFake(z.strictObject({ text: z.string(), href: z.string() }), fake)
    expect(getFake(z.strictObject({ text: z.string(), href: z.string() }))).toBeUndefined()
    expect(getFake(z.strictObject({ link }))).toBeUndefined()
    expect(getFake(z.array(link))).toBeUndefined()
    expect(getFake(undefined)).toBeUndefined()
    expect(getFake('link')).toBeUndefined()
  })
})

describe('the kss-modern/schema shim of the .schema.ts modules', () => {
  let directory: string
  let shim: Record<string, unknown>

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kss-modern-schema-shim-'))
    const file = path.join(directory, '__kss-modern-schema.js')
    await fs.writeFile(file, COMPONENT_SCHEMA_SHIM_SOURCE)
    shim = await import(pathToFileURL(file).href)
  })

  afterAll(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('exports what the module exports at runtime', () => {
    expect(Object.keys(shim).sort()).toEqual(Object.keys(componentSchema).sort())
  })

  it('shares the fake registry with the module', () => {
    const shimWithFake = shim.withFake as typeof withFake
    const shimGetFake = shim.getFake as typeof getFake
    const fromShim = z.strictObject({ src: z.string() })
    const fromModule = z.strictObject({ alt: z.string() })
    const shimFake = () => ({ src: 'people/3' })
    const moduleFake = () => ({ alt: 'Alt' })

    expect(shimWithFake(fromShim, shimFake)).toBe(fromShim)
    withFake(fromModule, moduleFake)

    expect(getFake(fromShim.optional())).toBe(shimFake)
    expect(shimGetFake(fromModule.describe('x').optional())).toBe(moduleFake)
  })

  it('returns the definition unchanged', () => {
    const definition = { name: 'atoms/Button', schema: z.strictObject({}), examples: {} }
    expect((shim.defineComponent as typeof defineComponent)(definition)).toBe(definition)
  })
})
