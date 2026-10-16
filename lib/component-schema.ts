/**
 * `kss-modern/schema`, imported by `.schema.ts` files:
 *
 * ```ts
 * import { defineComponent } from 'kss-modern/schema'
 * import { z } from 'zod'
 *
 * export const button = defineComponent({
 *   name: 'atoms/Button',
 *   schema: z.strictObject({ text: z.string() }),
 *   examples: { text: 'Learn more' },
 * })
 * ```
 *
 * At runtime it returns the definition unchanged. It exists for the types: `examples` is checked
 * against the props the schema takes, and `name` keeps its literal type. The registry gives the
 * `.schema.ts` modules their own copy of this function, see `lib/mixins/schema-registry.ts`, so it
 * must stay free of imports.
 */
import type { z } from 'zod'

export interface ComponentSchemaDefinition<Name extends string = string, Schema extends z.ZodType = z.ZodType> {
  /** Where the mixin sits in the explorer, `/` nests folders. `defineComponent('<name>', props)` in the mixin picks it. */
  name: Name
  schema: Schema
  /** Demo values per prop, the explorer starts with them. They are never defaults. */
  examples?: Partial<z.input<Schema>>
}

export function defineComponent<const Name extends string, Schema extends z.ZodType>(
  definition: ComponentSchemaDefinition<Name, Schema>,
): ComponentSchemaDefinition<Name, Schema> {
  return definition
}
