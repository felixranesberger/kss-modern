import type { ZodNamespace } from '../zod.ts'
import { checkSchemaSupport } from './schema-support.ts'

export type MixinSchemaResult
  = | { jsonSchema: Record<string, unknown> }
    | { error: string }

/**
 * Evaluate a mixin's `mixinSchema` block on its own and convert the schema to JSON Schema.
 *
 * The block may only reference `z`: it runs here without the mixin's `props` or any other
 * template variable. `io: 'input'` describes what a caller may pass, so a field with `.default()`
 * is optional rather than required. The result must stay within the zod features the playground
 * supports (see `./schema-support.ts`); anything else is reported as an error. Never throws.
 */
export function evaluateMixinSchema(z: ZodNamespace, source: string): MixinSchemaResult {
  try {
    // eslint-disable-next-line no-new-func
    const schema = new Function('z', `${source}\nreturn mixinSchema`)(z) as unknown
    if (!schema || typeof schema !== 'object' || !('_zod' in schema))
      return { error: '`mixinSchema` is not a zod schema' }

    const jsonSchema = z.toJSONSchema(schema as never, {
      io: 'input',
      // a type JSON Schema cannot describe (dates, maps, …) cannot get a control either
      unrepresentable: 'throw',
    }) as Record<string, unknown>

    const unsupported = checkSchemaSupport(jsonSchema)
    if (unsupported.length > 0)
      return { error: `The schema uses zod features the playground does not support:\n${unsupported.map(line => `- ${line}`).join('\n')}` }

    return { jsonSchema }
  }
  catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
