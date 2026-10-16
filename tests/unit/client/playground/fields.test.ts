import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getEmptyItem, getFields, getInitialObject, getInitialValue, getInitialValues, getProps } from '../../../../client/lib/playground/fields.ts'

const schema = z.toJSONSchema(z.object({
  label: z.string().min(1).max(20).describe('Button text'),
  count: z.int().min(0).max(9),
  ratio: z.number().multipleOf(0.5).meta({ examples: [0.5] }),
  isActive: z.boolean().default(true),
  variant: z.enum(['primary', 'ghost']).default('primary'),
  size: z.union([z.literal('sm'), z.literal('lg')]).optional(),
  icon: z.string().optional(),
  tags: z.array(z.string().min(1)).max(3),
}), { io: 'input' }) as Record<string, unknown>

describe('getFields', () => {
  const fields = getFields(schema)
  const byKey = Object.fromEntries(fields.map(field => [field.key, field]))

  it('maps every supported type onto a control', () => {
    expect(fields.map(field => [field.key, field.kind, field.isOptional])).toEqual([
      ['label', 'string', false],
      ['count', 'integer', false],
      ['ratio', 'number', false],
      ['isActive', 'boolean', true],
      ['variant', 'enum', true],
      ['size', 'enum', true],
      ['icon', 'string', true],
      ['tags', 'array', false],
    ])
  })

  it('keeps the constraints', () => {
    expect(byKey.label).toMatchObject({ minLength: 1, maxLength: 20, description: 'Button text' })
    expect(byKey.count).toMatchObject({ minimum: 0, maximum: 9 })
    expect(byKey.ratio).toMatchObject({ multipleOf: 0.5 })
    expect(byKey.size.options).toEqual(['sm', 'lg'])
    expect(byKey.tags).toMatchObject({ maxItems: 3, items: { kind: 'string', minLength: 1 } })
  })

  it('drops the safe-integer bounds z.int() states', () => {
    const [field] = getFields(z.toJSONSchema(z.object({ n: z.int() })) as Record<string, unknown>)
    expect(field.minimum).toBeUndefined()
    expect(field.maximum).toBeUndefined()
  })
})

describe('arrays of objects', () => {
  const [field] = getFields(z.toJSONSchema(z.object({
    links: z.array(z.strictObject({
      text: z.string().min(1).describe('Link text'),
      href: z.string(),
      isExternal: z.boolean().default(false),
      target: z.enum(['_self', '_blank']).optional(),
    })),
  }), { io: 'input' }) as Record<string, unknown>)

  it('describes every field of an entry', () => {
    expect(field.kind).toBe('array')
    expect(field.items?.kind).toBe('object')
    const entryFields = field.items?.kind === 'object' ? field.items.fields : []
    expect(entryFields.map(entryField => [entryField.key, entryField.kind, entryField.isOptional])).toEqual([
      ['text', 'string', false],
      ['href', 'string', false],
      ['isExternal', 'boolean', true],
      ['target', 'enum', true],
    ])
    expect(entryFields[0]).toMatchObject({ minLength: 1, description: 'Link text' })
  })

  it('starts a fresh entry with defaults and empty required fields', () => {
    expect(getEmptyItem(field.items!)).toEqual({ text: '', href: '', isExternal: false })
  })
})

describe('object props', () => {
  const fields = getFields(z.toJSONSchema(z.object({
    image: z.strictObject({
      src: z.string().min(1).meta({ examples: ['university/2'] }),
      alt: z.string().default(''),
      loading: z.enum(['lazy', 'eager']).optional(),
    }).describe('Cover image').optional(),
    cta: z.strictObject({ text: z.string(), href: z.string() }),
  }), { io: 'input' }) as Record<string, unknown>)
  const byKey = Object.fromEntries(fields.map(field => [field.key, field]))

  it('describes every field of the object', () => {
    expect(byKey.image).toMatchObject({ kind: 'object', isOptional: true, description: 'Cover image' })
    expect(byKey.image.fields?.map(field => [field.key, field.kind, field.isOptional])).toEqual([
      ['src', 'string', false],
      ['alt', 'string', true],
      ['loading', 'enum', true],
    ])
  })

  it('leaves an optional object out and builds a required one from its fields', () => {
    expect(getInitialValue(byKey.image)).toBeUndefined()
    expect(getInitialValue(byKey.cta)).toEqual({ text: '', href: '' })
  })

  it('starts an object switched on from the starting values of its fields', () => {
    expect(getInitialObject(byKey.image.fields!)).toEqual({ src: 'university/2', alt: '' })
  })
})

describe('records', () => {
  const [field] = getFields(z.toJSONSchema(z.object({
    attributes: z.record(z.string().regex(/^data-[a-z-]+$/), z.union([z.string(), z.boolean()])).optional(),
  }), { io: 'input' }) as Record<string, unknown>)

  it('describes keys and every allowed value type', () => {
    expect(field.kind).toBe('record')
    expect(field.record).toMatchObject({ keyPattern: '^data-[a-z-]+$', values: [{ kind: 'string' }, { kind: 'boolean' }] })
  })
})

describe('initial values', () => {
  const fields = getFields(schema)
  const byKey = Object.fromEntries(fields.map(field => [field.key, field]))

  it('prefers the default, then the first example, then an empty value', () => {
    expect(getInitialValue(byKey.variant)).toBe('primary')
    expect(getInitialValue(byKey.ratio)).toBe(0.5)
    expect(getInitialValue(byKey.label)).toBe('')
    expect(getInitialValue(byKey.tags)).toEqual([])
  })

  it('leaves an optional prop without default or example out', () => {
    expect(getInitialValue(byKey.icon)).toBeUndefined()
    expect(getInitialValue(byKey.size)).toBeUndefined()
  })

  it('takes the props a URL carried and leaves the others unset', () => {
    const values = getInitialValues(fields, { label: 'Save', icon: 'disk' })
    expect(getProps(fields, values)).toEqual({ label: 'Save', icon: 'disk' })
  })
})
