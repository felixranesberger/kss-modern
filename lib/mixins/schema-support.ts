/**
 * The zod features a mixin's schema may use, checked on the JSON Schema zod produces for it.
 *
 * The playground generates a control for every prop and validates it while you type, so it has to
 * understand every constraint the schema states. Instead of half-supporting the rest, a schema that
 * leaves this set fails: in development the explorer shows why, a production build stops.
 *
 * Supported, per prop:
 * - `z.string()` with `.min()`, `.max()`, `.length()`, `.regex()`, `.email()`, `.url()` and the
 *   pattern-based checks (`.startsWith()`, `.endsWith()`, `.includes()`)
 * - `z.number()` / `z.int()` with `.min()`, `.max()`, `.gt()`, `.lt()`, `.multipleOf()`
 * - `z.boolean()`
 * - `z.enum([...])`, `z.literal()` and unions of literals
 * - `z.array()` of any of the above, with `.min()`, `.max()`, `.length()`
 * - `z.array()` of `z.strictObject()` / `z.object()` whose fields are any of the scalars above, for
 *   lists of entries like FAQ items or links. The fields stay flat: no lists or objects inside them.
 * - `z.record()` with string keys (optionally `.regex()`) and scalar values, also a union of
 *   `z.string()`, `z.number()` and `z.boolean()`, for maps like additional HTML attributes
 * - `.optional()`, `.default()`, `.describe()`, `.meta({ examples })`
 *
 * Checks JSON Schema cannot express (`.refine()`, `.transform()`) pass through: the mixin's own
 * `defineComponent` (or `mixinSchema.parse(props)`) still runs them when the playground renders.
 */

type JsonSchema = Record<string, unknown>

const ANNOTATION_KEYS = ['description', 'default', 'examples', 'title']
const STRING_KEYS = ['type', 'minLength', 'maxLength', 'pattern', 'format', 'enum', 'const', ...ANNOTATION_KEYS]
const NUMBER_KEYS = ['type', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'enum', 'const', ...ANNOTATION_KEYS]
const BOOLEAN_KEYS = ['type', 'enum', 'const', ...ANNOTATION_KEYS]
const ARRAY_KEYS = ['type', 'items', 'minItems', 'maxItems', ...ANNOTATION_KEYS]
const LITERAL_UNION_KEYS = ['anyOf', ...ANNOTATION_KEYS]
const ROOT_KEYS = ['$schema', 'type', 'properties', 'required', 'additionalProperties', ...ANNOTATION_KEYS]
const ENTRY_KEYS = ['type', 'properties', 'required', 'additionalProperties', ...ANNOTATION_KEYS]
const RECORD_KEYS = ['type', 'propertyNames', 'additionalProperties', ...ANNOTATION_KEYS]
const RECORD_KEY_KEYS = ['type', 'pattern', 'minLength', 'maxLength']
const RECORD_VALUE_TYPES = ['string', 'number', 'integer', 'boolean']
/** String formats the playground checks itself; any other format must come with a pattern. */
const CHECKED_FORMATS = ['email', 'uri']

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLiteral(value: unknown): boolean {
  return isObject(value) && 'const' in value && Object.keys(value).every(key => key === 'type' || key === 'const')
}

function checkKeys(schema: JsonSchema, allowed: string[]): string[] {
  return Object.keys(schema)
    .filter(key => !allowed.includes(key))
    .map(key => `uses "${key}", which comes from a zod feature the playground does not support`)
}

/** Where a value sits: a prop, the entry type of an array prop, or a field of such an entry. */
type ValuePosition = 'prop' | 'array-item' | 'entry-field'

function checkEntry(schema: JsonSchema): string[] {
  if (!isObject(schema.properties))
    return ['is an object without fields, which is not supported']

  const errors = checkKeys(schema, ENTRY_KEYS)
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
    errors.push('allows unknown keys (z.looseObject or .catchall()), which is not supported')

  for (const [key, field] of Object.entries(schema.properties)) {
    const fieldErrors = isObject(field) ? checkValue(field, 'entry-field') : ['is not a schema']
    errors.push(...fieldErrors.map(error => `field "${key}" ${error}`))
  }
  return errors
}

function isRecord(schema: JsonSchema): boolean {
  return !isObject(schema.properties) && isObject(schema.additionalProperties)
}

function checkRecord(schema: JsonSchema): string[] {
  const errors = checkKeys(schema, RECORD_KEYS)
  const keys = schema.propertyNames
  if (keys !== undefined && (!isObject(keys) || keys.type !== 'string'))
    errors.push('has keys that are no strings, only z.record(z.string(), …) is supported')
  else if (isObject(keys))
    errors.push(...checkKeys(keys, RECORD_KEY_KEYS).map(error => `keys ${error}`))

  const values = schema.additionalProperties as JsonSchema
  const types = Array.isArray(values.type) ? values.type : [values.type]
  if (Array.isArray(values.anyOf) || !types.every(type => RECORD_VALUE_TYPES.includes(String(type))))
    errors.push('has values that are no strings, numbers or booleans, which is not supported')
  else if (!Array.isArray(values.type))
    errors.push(...checkValue(values, 'entry-field').map(error => `values ${error}`))
  return errors
}

function checkValue(schema: JsonSchema, position: ValuePosition): string[] {
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.every(isLiteral))
      return ['is a union, only unions of z.literal() values are supported']
    return checkKeys(schema, LITERAL_UNION_KEYS)
  }

  if (Array.isArray(schema.type))
    return [`can be ${schema.type.join(' or ')}; nullable props and unions of types are not supported (except as record values)`]

  switch (schema.type) {
    case 'string': {
      const errors = checkKeys(schema, STRING_KEYS)
      if (typeof schema.format === 'string' && !CHECKED_FORMATS.includes(schema.format) && typeof schema.pattern !== 'string')
        errors.push(`uses the string format "${schema.format}", which is not supported`)
      return errors
    }
    case 'number':
    case 'integer':
      return checkKeys(schema, NUMBER_KEYS)
    case 'boolean':
      return checkKeys(schema, BOOLEAN_KEYS)
    case 'array': {
      if (position === 'array-item')
        return ['is an array of arrays, only arrays of scalars or of flat objects are supported']
      if (position === 'entry-field')
        return ['is an array, the fields of a list entry must be scalars']
      if (!isObject(schema.items))
        return ['is an array without an item type (a tuple), which is not supported']
      return [
        ...checkKeys(schema, ARRAY_KEYS),
        ...checkValue(schema.items, 'array-item').map(error => `items ${error}`),
      ]
    }
    case 'object':
      if (position === 'array-item')
        return checkEntry(schema)
      if (position === 'entry-field')
        return ['is an object, the fields of a list entry must be scalars']
      if (isRecord(schema))
        return checkRecord(schema)
      return ['is an object, nested objects are not supported; use an array of objects for a list of entries or z.record() for a map']
    default:
      return ['has a type the playground cannot edit (e.g. z.any() or z.unknown())']
  }
}

/** Why the schema is outside the supported set, one line per problem; empty when it is fine. */
export function checkSchemaSupport(schema: JsonSchema): string[] {
  if (schema.type !== 'object' || !isObject(schema.properties))
    return ['the schema must be a z.object({ … }) of props']

  const errors = checkKeys(schema, ROOT_KEYS).map(error => `the schema ${error}`)
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
    errors.push('the schema allows unknown keys (z.looseObject or .catchall()), which is not supported')

  for (const [key, property] of Object.entries(schema.properties)) {
    const propertyErrors = isObject(property) ? checkValue(property, 'prop') : ['is not a schema']
    errors.push(...propertyErrors.map(error => `prop "${key}" ${error}`))
  }

  return errors
}
