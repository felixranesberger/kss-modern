import type { ZodNamespace } from '../zod.ts'
import { checkSchemaSupport } from './schema-support.ts'

export type MixinSchemaResult
  = | {
    jsonSchema: Record<string, unknown>
    /** `name` passed to `defineComponent`, the mixin's place in the explorer. */
    name?: string
  }
  | { error: string }

/** How a mixin declares its schema, see `./discovery.ts`. */
export type MixinSchemaForm = 'defineComponent' | 'mixinSchema'

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
export function evaluateMixinSchema(z: ZodNamespace, source: string, form: MixinSchemaForm = 'mixinSchema'): MixinSchemaResult {
  try {
    const { schema, name } = form === 'defineComponent' ? runDefineComponentBlock(z, source) : runMixinSchemaBlock(z, source)
    if (!schema || typeof schema !== 'object' || !('_zod' in schema))
      return { error: form === 'defineComponent' ? '`schema` of `defineComponent` is not a zod schema' : '`mixinSchema` is not a zod schema' }

    const jsonSchema = z.toJSONSchema(schema as never, {
      io: 'input',
      // a type JSON Schema cannot describe (dates, maps, …) cannot get a control either
      unrepresentable: 'throw',
    }) as Record<string, unknown>

    const unsupported = checkSchemaSupport(jsonSchema)
    if (unsupported.length > 0)
      return { error: `The schema uses zod features the playground does not support:\n${unsupported.map(line => `- ${line}`).join('\n')}` }

    return name === undefined ? { jsonSchema } : { jsonSchema, name }
  }
  catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
