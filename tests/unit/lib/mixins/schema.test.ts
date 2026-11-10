import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent, withFake } from '../../../../lib/component-schema.ts'
import { DEFAULT_SEED, resolveExamples } from '../../../../lib/fixtures/index.ts'
import { evaluateComponentDefinition, evaluateMixinSchema } from '../../../../lib/mixins/schema.ts'

describe('evaluateMixinSchema', () => {
  it('converts the schema to JSON Schema', async () => {
    const result = await evaluateMixinSchema(z, '\nvar mixinSchema = z.object({ label: z.string().describe(\'Button text\') })')

    expect(result).toMatchObject({
      jsonSchema: {
        type: 'object',
        properties: { label: { type: 'string', description: 'Button text' } },
        required: ['label'],
      },
    })
  })

  it('treats fields with a default as optional input (io: input)', async () => {
    const result = await evaluateMixinSchema(z, 'var mixinSchema = z.object({ label: z.string(), variant: z.enum([\'a\', \'b\']).default(\'a\') })')
    if (!('jsonSchema' in result))
      throw new Error(result.error)

    expect(result.jsonSchema.required).toEqual(['label'])
    expect(result.jsonSchema.properties).toMatchObject({ variant: { default: 'a', enum: ['a', 'b'] } })
  })

  it('keeps examples from .meta()', async () => {
    const result = await evaluateMixinSchema(z, 'var mixinSchema = z.object({ count: z.number().meta({ examples: [3] }) })')
    expect(result).toMatchObject({ jsonSchema: { properties: { count: { examples: [3] } } } })
  })

  it('reports types JSON Schema cannot express', async () => {
    const result = await evaluateMixinSchema(z, 'var mixinSchema = z.object({ at: z.date() })')
    expect(result).toEqual({ error: expect.stringContaining('Date cannot be represented') })
  })

  it('reports zod features outside the supported set', async () => {
    const result = await evaluateMixinSchema(z, 'var mixinSchema = z.object({ meta: z.string().nullable() })')
    expect(result).toEqual({ error: expect.stringContaining('prop "meta" can be string or null') })
  })

  it('reports a schema block that throws as an error', async () => {
    const result = await evaluateMixinSchema(z, 'var mixinSchema = z.objekt({})')
    expect(result).toEqual({ error: expect.stringContaining('objekt') })
  })

  it('reports a schema block that reads template variables as an error', async () => {
    const result = await evaluateMixinSchema(z, 'var mixinSchema = z.object({ label: z.literal(props.label) })')
    expect(result).toEqual({ error: expect.stringContaining('props') })
  })

  it('rejects a mixinSchema that is not a zod schema', async () => {
    expect(await evaluateMixinSchema(z, 'var mixinSchema = { label: \'string\' }')).toEqual({ error: expect.stringContaining('not a zod schema') })
  })

  describe('defineComponent blocks', () => {
    const block = (definition: string) => `\nconst p = defineComponent(${definition}, props)`

    it('takes the schema and the name from the definition', async () => {
      const result = await evaluateMixinSchema(z, block('{\n  name: \'atoms/Button\',\n  schema: z.strictObject({ label: z.string() }).describe(\'A button\'),\n}'), 'defineComponent')
      expect(result).toMatchObject({
        name: 'atoms/Button',
        jsonSchema: { type: 'object', description: 'A button', properties: { label: { type: 'string' } }, required: ['label'] },
      })
    })

    it('passes no props, so a block that only defines the component evaluates', async () => {
      const result = await evaluateMixinSchema(z, 'defineComponent({ schema: z.object({ a: z.string() }) }, props || {})', 'defineComponent')
      expect(result).toEqual({ jsonSchema: expect.objectContaining({ type: 'object' }) })
    })

    it('reports a block that throws', async () => {
      expect(await evaluateMixinSchema(z, block('{ name: \'x\', schema: z.objekt({}) }'), 'defineComponent'))
        .toEqual({ error: expect.stringContaining('objekt') })
    })

    it('reports a block that never calls defineComponent', async () => {
      expect(await evaluateMixinSchema(z, 'if (false) defineComponent({ schema: z.object({}) }, props)', 'defineComponent'))
        .toEqual({ error: 'The block does not call `defineComponent`' })
    })

    it('reports a definition without a zod schema', async () => {
      expect(await evaluateMixinSchema(z, block('{ name: \'x\', schema: { label: \'string\' } }'), 'defineComponent'))
        .toEqual({ error: '`schema` of `defineComponent` is not a zod schema' })
      expect(await evaluateMixinSchema(z, block('z.object({})'), 'defineComponent'))
        .toEqual({ error: '`schema` of `defineComponent` is not a zod schema' })
    })

    it('reports a name that is not a string', async () => {
      expect(await evaluateMixinSchema(z, block('{ name: 3, schema: z.object({}) }'), 'defineComponent'))
        .toEqual({ error: '`name` of `defineComponent` must be a string' })
    })

    it('reports zod features outside the supported set', async () => {
      expect(await evaluateMixinSchema(z, block('{ schema: z.object({ meta: z.string().nullable() }) }'), 'defineComponent'))
        .toEqual({ error: expect.stringContaining('prop "meta" can be string or null') })
    })
  })
})

describe('examples', () => {
  const image = withFake(z.strictObject({ src: z.string(), alt: z.string().default('') }), f => ({ src: f.system.fileName(), alt: f.lorem.words(2) }))
  const card = defineComponent({
    name: 'molecules/Card',
    schema: z.strictObject({
      variant: z.enum(['tile', 'teaser']).default('tile'),
      title: z.string(),
      reverse: z.boolean().default(false),
      tags: z.array(z.string()).optional(),
      cta: z.strictObject({ text: z.string(), href: z.string() }).optional(),
      image: image.optional(),
    }),
    examples: {
      variant: 'teaser',
      title: f => f.lorem.sentence(),
      tags: ['fixed', f => f.lorem.word()],
      cta: { text: 'Read more', href: f => f.internet.url() },
    },
  })

  it('writes the values of resolveExamples with the default seed, not the functions', async () => {
    const result = await evaluateComponentDefinition(z, card, card.name)
    if (!('jsonSchema' in result))
      throw new Error(result.error)

    const resolved = resolveExamples(card, { seed: DEFAULT_SEED }) as Record<string, unknown>
    const properties = result.jsonSchema.properties as Record<string, { examples?: unknown[], properties?: Record<string, { examples?: unknown[] }> }>
    expect(properties.variant.examples).toEqual(['teaser'])
    expect(properties.title.examples).toEqual([resolved.title])
    expect(properties.tags.examples).toEqual([['fixed', expect.any(String)]])
    expect(properties.image.examples).toEqual([resolved.image])
    expect(properties.reverse.examples).toBeUndefined()
    expect(JSON.parse(JSON.stringify(result.jsonSchema))).toEqual(result.jsonSchema)
  })

  it('sets examples on top-level props only, an object prop gets its whole object', async () => {
    const result = await evaluateComponentDefinition(z, card, card.name)
    if (!('jsonSchema' in result))
      throw new Error(result.error)

    const cta = (result.jsonSchema.properties as Record<string, { examples?: unknown[], properties: Record<string, { examples?: unknown[] }> }>).cta
    expect(cta.examples).toEqual([{ text: 'Read more', href: expect.stringMatching(/^https?:\/\//) }])
    expect(cta.properties.href.examples).toBeUndefined()
  })

  it('gives the same values on every evaluation', async () => {
    expect(await evaluateComponentDefinition(z, card, card.name)).toEqual(await evaluateComponentDefinition(z, card, card.name))
  })

  it('reads examples from a defineComponent block, with and without fakes', async () => {
    const result = await evaluateMixinSchema(z, `const p = defineComponent({
      name: 'atoms/Button',
      schema: z.strictObject({ label: z.string(), href: z.string().optional() }),
      examples: { label: 'Learn more', href: f => f.internet.url() },
    }, props)`, 'defineComponent')

    expect(result).toMatchObject({
      jsonSchema: { properties: { label: { examples: ['Learn more'] }, href: { examples: [expect.stringMatching(/^https?:\/\//)] } } },
    })
  })

  it('reports an example for a prop the schema does not have', async () => {
    expect(await evaluateMixinSchema(z, 'defineComponent({ schema: z.object({ a: z.string() }), examples: { b: f => f.lorem.word() } }, props)', 'defineComponent'))
      .toEqual({ error: '`examples` names the prop "b", which the schema does not have' })
  })
})
