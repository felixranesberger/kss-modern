/**
 * Validates the playground's props against the constraints of the schema, as the user types. It
 * covers exactly the zod features the build lets through (`lib/mixins/schema-support.ts`), so an
 * error appears at the field before anything renders. The mixin's own `mixinSchema.parse(props)`
 * still runs on every render and catches what JSON Schema cannot state, like `.refine()`.
 */
import type { Field, FieldValues, Literal, ValueRules } from './fields.ts'

// the shape zod's `.email()` checks; the render-time parse is the final word
const EMAIL_RE = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

function formatLiteral(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value)
}

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value))
  }
  catch {
    return false
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** What is wrong with `value` under `rules`, or undefined when it is valid. */
export function validateValue(rules: ValueRules, value: unknown): string | undefined {
  switch (rules.kind) {
    case 'enum':
      return rules.options?.includes(value as Literal)
        ? undefined
        : `Must be one of ${(rules.options ?? []).map(formatLiteral).join(', ')}`

    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Must be true or false'

    case 'string': {
      if (typeof value !== 'string')
        return 'Must be text'
      if (rules.minLength !== undefined && value.length < rules.minLength)
        return rules.minLength === 1 ? 'Must not be empty' : `Must be at least ${plural(rules.minLength, 'character')}`
      if (rules.maxLength !== undefined && value.length > rules.maxLength)
        return `Must be at most ${plural(rules.maxLength, 'character')}`
      if (rules.format === 'email' && !EMAIL_RE.test(value))
        return 'Must be an email address'
      if (rules.format === 'uri' && !isValidUrl(value))
        return 'Must be a URL'
      if (rules.pattern !== undefined && rules.format !== 'email' && !new RegExp(rules.pattern).test(value))
        return `Must match ${rules.pattern}`
      return undefined
    }

    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value))
        return 'Must be a number'
      if (rules.kind === 'integer' && !Number.isInteger(value))
        return 'Must be a whole number'
      if (rules.minimum !== undefined && value < rules.minimum)
        return `Must be at least ${rules.minimum}`
      if (rules.maximum !== undefined && value > rules.maximum)
        return `Must be at most ${rules.maximum}`
      if (rules.exclusiveMinimum !== undefined && value <= rules.exclusiveMinimum)
        return `Must be greater than ${rules.exclusiveMinimum}`
      if (rules.exclusiveMaximum !== undefined && value >= rules.exclusiveMaximum)
        return `Must be less than ${rules.exclusiveMaximum}`
      // compare with a tolerance, 0.3 is no exact multiple of 0.1 in floating point
      if (rules.multipleOf !== undefined) {
        const ratio = value / rules.multipleOf
        if (Math.abs(ratio - Math.round(ratio)) > 1e-9)
          return `Must be a multiple of ${rules.multipleOf}`
      }
      return undefined
    }
  }
}

/** Every problem with one prop's value, empty when it is valid or (optional and) not passed. */
export function validateField(field: Field, value: unknown): string[] {
  if (value === undefined)
    return field.isOptional ? [] : ['Required']

  if (field.kind !== 'array') {
    const error = validateValue(field as ValueRules, value)
    return error ? [error] : []
  }

  if (!Array.isArray(value))
    return ['Must be a list']

  const errors: string[] = []
  if (field.minItems !== undefined && value.length < field.minItems)
    errors.push(`Needs at least ${plural(field.minItems, 'entry').replace('entrys', 'entries')}`)
  if (field.maxItems !== undefined && value.length > field.maxItems)
    errors.push(`Allows at most ${plural(field.maxItems, 'entry').replace('entrys', 'entries')}`)
  value.forEach((item, index) => {
    const error = field.items ? validateValue(field.items, item) : undefined
    if (error)
      errors.push(`Entry ${index + 1}: ${error}`)
  })
  return errors
}

/** Problems per prop key; props without problems are left out. */
export function validateValues(fields: Field[], values: FieldValues): Map<string, string[]> {
  const problems = new Map<string, string[]>()
  for (const field of fields) {
    const errors = validateField(field, values[field.key])
    if (errors.length > 0)
      problems.set(field.key, errors)
  }
  return problems
}
