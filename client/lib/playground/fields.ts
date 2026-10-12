/**
 * Turns a mixin's JSON Schema (zod's `toJSONSchema`, `io: 'input'`) into the controls the playground
 * renders, with every constraint the control must enforce, and works out each control's starting
 * value. The build only lets supported zod features through (`lib/mixins/schema-support.ts`), so
 * every schema seen here maps onto one of these field kinds. Pure, shared by both playground hosts.
 */

type JsonSchema = Record<string, unknown>

export type ValueKind = 'string' | 'number' | 'integer' | 'boolean' | 'enum'
export type FieldKind = ValueKind | 'array'

export type Literal = string | number | boolean | null

/** What a single value must satisfy: a scalar prop, or one entry of an array prop. */
export interface ValueRules {
  kind: ValueKind
  /** Allowed values of an `enum` (from `z.enum()`, `z.literal()` or a union of literals). */
  options?: Literal[]
  minLength?: number
  maxLength?: number
  /** `.regex()` and the pattern-based string checks. */
  pattern?: string
  /** `email` or `uri`; other formats always come with a pattern. */
  format?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
}

export interface Field extends Omit<ValueRules, 'kind'> {
  key: string
  kind: FieldKind
  /** Not in the schema's `required` list: an empty control leaves the prop out. */
  isOptional: boolean
  description?: string
  default?: unknown
  /** `examples[0]` from `.meta({ examples: [...] })`. */
  example?: unknown
  hasDefault: boolean
  hasExample: boolean
  /** The rules for each entry of an `array` field. */
  items?: ValueRules
  minItems?: number
  maxItems?: number
}

/** Prop key -> the control's value; `undefined` means the prop is not passed. */
export type FieldValues = Record<string, unknown>

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** `z.int()` states the safe-integer range as its bounds; those are no limit worth showing. */
function getBound(value: unknown): number | undefined {
  const number = getNumber(value)
  return number !== undefined && Math.abs(number) < Number.MAX_SAFE_INTEGER ? number : undefined
}

export function getValueRules(schema: JsonSchema): ValueRules {
  if (Array.isArray(schema.anyOf))
    return { kind: 'enum', options: schema.anyOf.map(member => (member as JsonSchema).const as Literal) }
  if ('const' in schema)
    return { kind: 'enum', options: [schema.const as Literal] }
  if (Array.isArray(schema.enum))
    return { kind: 'enum', options: schema.enum as Literal[] }

  switch (schema.type) {
    case 'string':
      return {
        kind: 'string',
        minLength: getNumber(schema.minLength),
        maxLength: getNumber(schema.maxLength),
        pattern: typeof schema.pattern === 'string' ? schema.pattern : undefined,
        format: typeof schema.format === 'string' ? schema.format : undefined,
      }
    case 'number':
    case 'integer':
      return {
        kind: schema.type,
        minimum: getBound(schema.minimum),
        maximum: getBound(schema.maximum),
        exclusiveMinimum: getBound(schema.exclusiveMinimum),
        exclusiveMaximum: getBound(schema.exclusiveMaximum),
        multipleOf: getNumber(schema.multipleOf),
      }
    default:
      return { kind: 'boolean' }
  }
}

/** The fields of the mixin's object schema, in declaration order. */
export function getFields(schema: JsonSchema | undefined): Field[] {
  if (!schema || !isObject(schema.properties))
    return []

  const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : [])

  return Object.entries(schema.properties).map(([key, value]) => {
    const property = isObject(value) ? value : {}
    const examples = Array.isArray(property.examples) ? property.examples : []
    const common = {
      key,
      isOptional: !required.has(key),
      description: typeof property.description === 'string' ? property.description : undefined,
      default: property.default,
      example: examples[0],
      hasDefault: 'default' in property,
      hasExample: examples.length > 0,
    }

    if (property.type === 'array') {
      return {
        ...common,
        kind: 'array' as const,
        items: getValueRules(isObject(property.items) ? property.items : {}),
        minItems: getNumber(property.minItems),
        maxItems: getNumber(property.maxItems),
      }
    }

    return { ...common, ...getValueRules(property) }
  })
}

/** The value a fresh control (or a fresh array entry) starts with. */
export function getEmptyValue(rules: Pick<ValueRules, 'kind' | 'options' | 'minimum' | 'exclusiveMinimum'>): unknown {
  switch (rules.kind) {
    case 'string':
      return ''
    case 'boolean':
      return false
    case 'enum':
      return rules.options?.[0]
    case 'number':
    case 'integer':
      return undefined
  }
}

/**
 * A control's starting value: the schema default, else the first example, else empty. Empty is
 * `undefined` (not passed) for an optional prop, and the type's empty value for a required one.
 */
export function getInitialValue(field: Field): unknown {
  if (field.hasDefault)
    return field.default
  if (field.hasExample)
    return field.example
  if (field.isOptional)
    return undefined
  return field.kind === 'array' ? [] : getEmptyValue(field as ValueRules)
}

/** Starting values of every control; props a URL carried replace them, absent props stay unset. */
export function getInitialValues(fields: Field[], props?: Record<string, unknown>): FieldValues {
  return Object.fromEntries(fields.map(field => [field.key, props ? props[field.key] : getInitialValue(field)]))
}

/** The `props` object the controls describe. */
export function getProps(fields: Field[], values: FieldValues): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const field of fields) {
    if (values[field.key] !== undefined)
      props[field.key] = values[field.key]
  }
  return props
}
