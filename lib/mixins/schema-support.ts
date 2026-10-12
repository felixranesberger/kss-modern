/**
 * The zod features a `mixinSchema` may use, checked on the JSON Schema zod produces for it.
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
 * - `.optional()`, `.default()`, `.describe()`, `.meta({ examples })`
 *
 * Checks JSON Schema cannot express (`.refine()`, `.transform()`) pass through: the mixin's own
 * `mixinSchema.parse(props)` still runs them when the playground renders.
 */

type JsonSchema = Record<string, unknown>

const ANNOTATION_KEYS = ['description', 'default', 'examples', 'title']
const STRING_KEYS = ['type', 'minLength', 'maxLength', 'pattern', 'format', 'enum', 'const', ...ANNOTATION_KEYS]
const NUMBER_KEYS = ['type', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'enum', 'const', ...ANNOTATION_KEYS]
const BOOLEAN_KEYS = ['type', 'enum', 'const', ...ANNOTATION_KEYS]
const ARRAY_KEYS = ['type', 'items', 'minItems', 'maxItems', ...ANNOTATION_KEYS]
const LITERAL_UNION_KEYS = ['anyOf', ...ANNOTATION_KEYS]
const ROOT_KEYS = ['$schema', 'type', 'properties', 'required', 'additionalProperties', ...ANNOTATION_KEYS]
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

function checkValue(schema: JsonSchema, isArrayItem: boolean): string[] {
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.every(isLiteral))
      return ['is a union, only unions of z.literal() values are supported']
    return checkKeys(schema, LITERAL_UNION_KEYS)
  }

  if (Array.isArray(schema.type))
    return [`can be ${schema.type.join(' or ')}; nullable props and unions of types are not supported`]

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
      if (isArrayItem)
        return ['is an array of arrays, only arrays of strings, numbers, booleans and enums are supported']
      if (!isObject(schema.items))
        return ['is an array without an item type (a tuple), which is not supported']
      return [
        ...checkKeys(schema, ARRAY_KEYS),
        ...checkValue(schema.items, true).map(error => `items ${error}`),
      ]
    }
    case 'object':
      return [isArrayItem
        ? 'is an array of objects, only arrays of strings, numbers, booleans and enums are supported'
        : 'is an object (or record), nested objects are not supported']
    default:
      return ['has a type the playground cannot edit (e.g. z.any() or z.unknown())']
  }
}

/** Why the schema is outside the supported set, one line per problem; empty when it is fine. */
export function checkSchemaSupport(schema: JsonSchema): string[] {
  if (schema.type !== 'object' || !isObject(schema.properties))
    return ['mixinSchema must be a z.object({ … }) of props']

  const errors = checkKeys(schema, ROOT_KEYS).map(error => `the schema ${error}`)
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
    errors.push('the schema allows unknown keys (z.looseObject or .catchall()), which is not supported')

  for (const [key, property] of Object.entries(schema.properties)) {
    const propertyErrors = isObject(property) ? checkValue(property, false) : ['is not a schema']
    errors.push(...propertyErrors.map(error => `prop "${key}" ${error}`))
  }

  return errors
}
