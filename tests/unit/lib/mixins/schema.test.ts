import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { evaluateMixinSchema } from '../../../../lib/mixins/schema.ts'

describe('evaluateMixinSchema', () => {
  it('converts the schema to JSON Schema', () => {
    const result = evaluateMixinSchema(z, '\nvar mixinSchema = z.object({ label: z.string().describe(\'Button text\') })')

    expect(result).toMatchObject({
      jsonSchema: {
        type: 'object',
        properties: { label: { type: 'string', description: 'Button text' } },
        required: ['label'],
      },
    })
  })

  it('treats fields with a default as optional input (io: input)', () => {
    const result = evaluateMixinSchema(z, 'var mixinSchema = z.object({ label: z.string(), variant: z.enum([\'a\', \'b\']).default(\'a\') })')
    if (!('jsonSchema' in result))
      throw new Error(result.error)

    expect(result.jsonSchema.required).toEqual(['label'])
    expect(result.jsonSchema.properties).toMatchObject({ variant: { default: 'a', enum: ['a', 'b'] } })
  })

  it('keeps examples from .meta()', () => {
    const result = evaluateMixinSchema(z, 'var mixinSchema = z.object({ count: z.number().meta({ examples: [3] }) })')
    expect(result).toMatchObject({ jsonSchema: { properties: { count: { examples: [3] } } } })
  })

  it('reports types JSON Schema cannot express', () => {
    const result = evaluateMixinSchema(z, 'var mixinSchema = z.object({ at: z.date() })')
    expect(result).toEqual({ error: expect.stringContaining('Date cannot be represented') })
  })

  it('reports zod features outside the supported set', () => {
    const result = evaluateMixinSchema(z, 'var mixinSchema = z.object({ meta: z.record(z.string(), z.string()) })')
    expect(result).toEqual({ error: expect.stringContaining('prop "meta" is an object') })
  })

  it('reports a schema block that throws as an error', () => {
    const result = evaluateMixinSchema(z, 'var mixinSchema = z.objekt({})')
    expect(result).toEqual({ error: expect.stringContaining('objekt') })
  })

  it('reports a schema block that reads template variables as an error', () => {
    const result = evaluateMixinSchema(z, 'var mixinSchema = z.object({ label: z.literal(props.label) })')
    expect(result).toEqual({ error: expect.stringContaining('props') })
  })

  it('rejects a mixinSchema that is not a zod schema', () => {
    expect(evaluateMixinSchema(z, 'var mixinSchema = { label: \'string\' }')).toEqual({ error: expect.stringContaining('not a zod schema') })
  })
})
