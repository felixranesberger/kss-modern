import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getFields, getInitialValues } from '../../../../client/lib/playground/fields.ts'
import { validateField, validateValues } from '../../../../client/lib/playground/validate.ts'

function fieldsOf(shape: z.ZodRawShape) {
  return getFields(z.toJSONSchema(z.object(shape), { io: 'input' }) as Record<string, unknown>)
}

function errorsFor(schema: z.ZodType, value: unknown): string[] {
  const [field] = fieldsOf({ value: schema })
  return validateField(field, value)
}

describe('validateField', () => {
  it('checks string length, pattern and format', () => {
    expect(errorsFor(z.string().min(1), '')).toEqual(['Must not be empty'])
    expect(errorsFor(z.string().max(3), 'abcd')).toEqual(['Must be at most 3 characters'])
    expect(errorsFor(z.string().regex(/^[a-z]+$/), 'A1')).toEqual(['Must match ^[a-z]+$'])
    expect(errorsFor(z.email(), 'nope')).toEqual(['Must be an email address'])
    expect(errorsFor(z.url(), 'nope')).toEqual(['Must be a URL'])
    expect(errorsFor(z.string().startsWith('x'), 'xy')).toEqual([])
  })

  it('checks numbers', () => {
    expect(errorsFor(z.int(), 1.5)).toEqual(['Must be a whole number'])
    expect(errorsFor(z.number().min(0).max(10), 11)).toEqual(['Must be at most 10'])
    expect(errorsFor(z.number().gt(0), 0)).toEqual(['Must be greater than 0'])
    expect(errorsFor(z.number().multipleOf(0.1), 0.3)).toEqual([])
    expect(errorsFor(z.number().multipleOf(5), 7)).toEqual(['Must be a multiple of 5'])
    expect(errorsFor(z.number(), undefined)).toEqual(['Required'])
  })

  it('checks enums and literal unions', () => {
    expect(errorsFor(z.enum(['a', 'b']), 'c')).toEqual(['Must be one of "a", "b"'])
    expect(errorsFor(z.union([z.literal(1), z.literal(2)]), 2)).toEqual([])
  })

  it('checks arrays: count and every entry', () => {
    expect(errorsFor(z.array(z.string().min(1)).min(1).max(2), [])).toEqual(['Needs at least 1 entry'])
    expect(errorsFor(z.array(z.string().min(1)).max(2), ['a', '', 'c'])).toEqual(['Allows at most 2 entries', 'Entry 2: Must not be empty'])
  })

  it('checks every field of an entry of an array of objects', () => {
    const entries = z.array(z.strictObject({ text: z.string().min(1), count: z.int().optional() }))
    expect(errorsFor(entries, [{ text: 'a' }, { text: '', count: 1.5 }, 'x'])).toEqual([
      'Entry 2: text: Must not be empty',
      'Entry 2: count: Must be a whole number',
      'Entry 3: Must be an object',
    ])
    expect(errorsFor(entries, [{}])).toEqual(['Entry 1: text: Required'])
  })

  it('checks the keys and values of a record', () => {
    const attributes = z.record(z.string().regex(/^data-[a-z-]+$/), z.union([z.string(), z.boolean()]))
    expect(errorsFor(attributes, { 'data-open': true, 'data-label': 'x' })).toEqual([])
    expect(errorsFor(attributes, { 'class': 'x', 'data-count': 3 })).toEqual([
      'Key "class": Must match ^data-[a-z-]+$',
      '"data-count": Must be string or boolean',
    ])
    expect(errorsFor(z.record(z.string(), z.int()), { a: 'x' })).toEqual(['"a": Must be a number'])
  })

  it('accepts an optional prop that is not passed', () => {
    const [field] = fieldsOf({ value: z.number().min(5).optional() })
    expect(validateField(field, undefined)).toEqual([])
  })
})

describe('validateValues', () => {
  it('agrees with zod on the starting values of a valid schema', () => {
    const shape = { label: z.string().meta({ examples: ['Save'] }), count: z.int().min(0).default(0), tags: z.array(z.string()).default([]) }
    const fields = fieldsOf(shape)
    expect(validateValues(fields, getInitialValues(fields)).size).toBe(0)
    expect(z.object(shape).safeParse({ label: 'Save', count: 0, tags: [] }).success).toBe(true)
  })
})
