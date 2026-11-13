import type { ZodNamespace } from '../zod.ts'
import type { ComponentDefinition } from './define-component.ts'
import { checkSchemaSupport } from './schema-support.ts'

export type MixinSchemaResult
  = | {
    jsonSchema: Record<string, unknown>
    /** `name` passed to `defineComponent`, the mixin's place in the explorer. */
    name?: string
  }
  | { error: string }

/**
 * How a mixin declares its schema, see `./discovery.ts`: in a `defineComponent` block, in a
 * `mixinSchema` block, or by name in a `.schema.ts` file (`module`, see `./schema-registry.ts`).
 */
export type MixinSchemaForm = 'defineComponent' | 'mixinSchema' | 'module'

interface EvaluatedDefinition {
  schema: unknown
  name?: string
}

/** Run a `mixinSchema` block and return the schema it assigns. */
function runMixinSchemaBlock(z: ZodNamespace, source: string): EvaluatedDefinition {
  // eslint-disable-next-line no-new-func
  return { schema: new Function('z', `${source}\nreturn mixinSchema`)(z) as unknown }
}

/**
 * Run a `defineComponent(…)` block with a `defineComponent` that only records its definition and
 * returns an empty object, since there are no props to parse.
 */
function runDefineComponentBlock(z: ZodNamespace, source: string): EvaluatedDefinition {
  let definition: unknown
  let isCalled = false
  const recordDefinition = (value: unknown) => {
    if (!isCalled) {
      definition = value
      isCalled = true
    }
    return {}
  }
  // eslint-disable-next-line no-new-func
  new Function('z', 'defineComponent', 'props', source)(z, recordDefinition, undefined)

  if (!isCalled)
    throw new Error('The block does not call `defineComponent`')
  if (!definition || typeof definition !== 'object')
    throw new Error('`defineComponent` expects an object `{ name, schema }`')

  const { name, schema } = definition as { name?: unknown, schema?: unknown }
  if (name !== undefined && typeof name !== 'string')
    throw new Error('`name` of `defineComponent` must be a string')
  return { schema, name }
}

/**
 * Evaluate a mixin's schema block on its own and convert the schema to JSON Schema.
 *
 * The block may only reference `z`: it runs here without the mixin's `props` or any other
 * template variable. `io: 'input'` describes what a caller may pass, so a field with `.default()`
 * is optional rather than required. The result must stay within the zod features the playground
 * supports (see `./schema-support.ts`); anything else is reported as an error. Never throws.
 */
/**
 * Convert a schema to JSON Schema and check it against the zod features the playground supports
 * (see `./schema-support.ts`). `examples` set the first example of the props they name.
 */
function toPlaygroundJsonSchema(z: ZodNamespace, schema: unknown, examples?: Record<string, unknown>): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema as never, {
    io: 'input',
    // a type JSON Schema cannot describe (dates, maps, …) cannot get a control either
    unrepresentable: 'throw',
  }) as Record<string, unknown>

  const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined
  for (const [key, value] of Object.entries(examples ?? {})) {
    if (!properties?.[key])
      throw new Error(`\`examples\` names the prop "${key}", which the schema does not have`)
    properties[key].examples = [value]
  }

  const unsupported = checkSchemaSupport(jsonSchema)
  if (unsupported.length > 0)
    throw new Error(`The schema uses zod features the playground does not support:\n${unsupported.map(line => `- ${line}`).join('\n')}`)
  return jsonSchema
}

function toResult(jsonSchema: Record<string, unknown>, name: string | undefined): MixinSchemaResult {
  return name === undefined ? { jsonSchema } : { jsonSchema, name }
}

function toError(error: unknown): MixinSchemaResult {
  return { error: error instanceof Error ? error.message : String(error) }
}

export function evaluateMixinSchema(z: ZodNamespace, source: string, form: MixinSchemaForm = 'mixinSchema'): MixinSchemaResult {
  try {
    const { schema, name } = form === 'defineComponent' ? runDefineComponentBlock(z, source) : runMixinSchemaBlock(z, source)
    if (!schema || typeof schema !== 'object' || !('_zod' in schema))
      return { error: form === 'defineComponent' ? '`schema` of `defineComponent` is not a zod schema' : '`mixinSchema` is not a zod schema' }

    return toResult(toPlaygroundJsonSchema(z, schema), name)
  }
  catch (error) {
    return toError(error)
  }
}

/**
 * Convert a component definition from a `.schema.ts` file to JSON Schema, like
 * {@link evaluateMixinSchema} does for a block. Never throws.
 */
export function evaluateComponentDefinition(z: ZodNamespace, definition: ComponentDefinition | undefined, name: string): MixinSchemaResult {
  if (!definition)
    return { error: `No .schema.ts file exports a component named "${name}". Export an object \`{ name: '${name}', schema }\` from the .schema.ts file next to the mixin.` }
  if (!('_zod' in definition.schema))
    return { error: `\`schema\` of "${name}" is not a zod schema` }
  try {
    return toResult(toPlaygroundJsonSchema(z, definition.schema, definition.examples), name)
  }
  catch (error) {
    return toError(error)
  }
}
