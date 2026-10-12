import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checkSchemaSupport } from '../../../../lib/mixins/schema-support.ts'

function check(schema: z.ZodType): string[] {
  return checkSchemaSupport(z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>)
}

describe('checkSchemaSupport', () => {
  it('accepts every supported feature', () => {
    expect(check(z.object({
      text: z.string().min(1).max(20).regex(/^[a-z]+$/).describe('Text').meta({ examples: ['abc'] }),
      email: z.email().optional(),
      url: z.url().optional(),
      prefixed: z.string().startsWith('x').optional(),
      count: z.int().min(0).max(9).default(0),
      ratio: z.number().gt(0).lt(1).multipleOf(0.1).optional(),
      isActive: z.boolean().default(false),
      variant: z.enum(['a', 'b']).default('a'),
      size: z.union([z.literal('sm'), z.literal('lg')]).optional(),
      fixed: z.literal(3).optional(),
      tags: z.array(z.string().min(1)).max(3).default([]),
      levels: z.array(z.enum(['x', 'y'])).optional(),
      refined: z.string().refine(value => value.length > 2).optional(),
    }).describe('A component'))).toEqual([])
  })

  it('names the prop and the problem of unsupported features', () => {
    expect(check(z.object({
      nested: z.object({ a: z.string() }),
      record: z.record(z.string(), z.string()),
      nullable: z.string().nullable(),
      mixed: z.union([z.string(), z.number()]),
      table: z.array(z.object({ a: z.string() })),
      anything: z.any(),
    }))).toEqual([
      'prop "nested" is an object (or record), nested objects are not supported',
      'prop "record" is an object (or record), nested objects are not supported',
      'prop "nullable" can be string or null; nullable props and unions of types are not supported',
      'prop "mixed" can be string or number; nullable props and unions of types are not supported',
      'prop "table" items is an array of objects, only arrays of strings, numbers, booleans and enums are supported',
      'prop "anything" has a type the playground cannot edit (e.g. z.any() or z.unknown())',
    ])
  })

  it('rejects a schema that is no object of props', () => {
    expect(check(z.string())).toEqual(['mixinSchema must be a z.object({ … }) of props'])
  })

  it('rejects loose objects', () => {
    expect(check(z.looseObject({ a: z.string() }))).toEqual([expect.stringContaining('unknown keys')])
  })

  it('rejects string formats it cannot check', () => {
    expect(check(z.object({ at: z.iso.datetime() }))).toEqual([])
    expect(checkSchemaSupport({ type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }))
      .toEqual(['prop "id" uses the string format "uuid", which is not supported'])
  })
})
