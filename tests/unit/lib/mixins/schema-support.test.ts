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
      links: z.array(z.strictObject({
        text: z.string().min(1),
        href: z.string(),
        isExternal: z.boolean().default(false),
        target: z.enum(['_self', '_blank']).optional(),
      })).min(1).meta({ examples: [[{ text: 'Home', href: '/' }]] }),
      looseEntries: z.array(z.object({ title: z.string() })).optional(),
      attributes: z.record(z.string().regex(/^data-[a-z-]+$/), z.union([z.string(), z.boolean()])).optional(),
      counts: z.record(z.string(), z.int()).optional(),
      refined: z.string().refine(value => value.length > 2).optional(),
    }).describe('A component'))).toEqual([])
  })

  it('names the prop and the problem of unsupported features', () => {
    expect(check(z.object({
      nested: z.object({ a: z.string() }),
      record: z.record(z.string(), z.object({ a: z.string() })),
      nullable: z.string().nullable(),
      mixed: z.union([z.string(), z.number()]),
      anything: z.any(),
    }))).toEqual([
      'prop "nested" is an object, nested objects are not supported; use an array of objects for a list of entries or z.record() for a map',
      'prop "record" has values that are no strings, numbers or booleans, which is not supported',
      'prop "nullable" can be string or null; nullable props and unions of types are not supported (except as record values)',
      'prop "mixed" can be string or number; nullable props and unions of types are not supported (except as record values)',
      'prop "anything" has a type the playground cannot edit (e.g. z.any() or z.unknown())',
    ])
  })

  it('keeps the entries of an array of objects flat', () => {
    expect(check(z.object({
      rows: z.array(z.object({
        tags: z.array(z.string()),
        meta: z.object({ a: z.string() }),
        nullable: z.string().nullable(),
      })),
      records: z.array(z.record(z.string(), z.string())),
      looseRows: z.array(z.looseObject({ a: z.string() })),
      grid: z.array(z.array(z.string())),
    }))).toEqual([
      'prop "rows" items field "tags" is an array, the fields of a list entry must be scalars',
      'prop "rows" items field "meta" is an object, the fields of a list entry must be scalars',
      'prop "rows" items field "nullable" can be string or null; nullable props and unions of types are not supported (except as record values)',
      'prop "records" items is an object without fields, which is not supported',
      'prop "looseRows" items allows unknown keys (z.looseObject or .catchall()), which is not supported',
      'prop "grid" items is an array of arrays, only arrays of scalars or of flat objects are supported',
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
