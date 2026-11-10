import type { ZodNamespace } from '../zod.ts'
import type { ComponentDefinition } from './define-component.ts'
import { getFake } from '../component-schema.ts'
import { getArrayElement, getObjectShape } from '../fixtures/zod-internals.ts'
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

export interface EvaluatedDefinition {
  schema: unknown
  name?: string
  examples?: unknown
  slots?: unknown
  cases?: unknown
  strength?: unknown
}

type FixturesModule = typeof import('../fixtures/index.ts')

let fixtures: Promise<FixturesModule> | undefined

/** `kss-modern/fixtures`, imported on first use: it needs `@faker-js/faker`, an optional peer. */
function loadFixtures(): Promise<FixturesModule> {
  fixtures ??= import('../fixtures/index.ts')
  return fixtures
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * The path of the first value `resolveExamples` would make with Faker: a function in `examples`,
 * or a field without an entry whose fragment has a `withFake`. Walks like `resolveExamples`.
 */
function findFake(schema: unknown, example: unknown, path: string): string | undefined {
  if (typeof example === 'function')
    return path
  if (Array.isArray(example)) {
    const element = getArrayElement(schema)
    for (const [index, item] of example.entries()) {
      const found = findFake(element, item, `${path}[${index}]`)
      if (found)
        return found
    }
    return undefined
  }
  if (!isPlainObject(example))
    return undefined

  const shape = getObjectShape(schema)
  for (const key of new Set([...Object.keys(shape ?? {}), ...Object.keys(example)])) {
    const keyPath = path === '' ? key : `${path}.${key}`
    const found = example[key] !== undefined ? findFake(shape?.[key], example[key], keyPath) : getFake(shape?.[key]) && keyPath
    if (found)
      return found
  }
  return undefined
}

/**
 * `examples` as plain values, see `resolveExamples` in `lib/fixtures`, with its default seed.
 * Without fakes `examples` are already plain, so Faker is only loaded when they hold one.
 */
async function resolveDefinitionExamples(definition: { name?: string, schema: unknown, examples?: unknown }): Promise<Record<string, unknown>> {
  const examples = isPlainObject(definition.examples) ? definition.examples : {}
  const fakePath = findFake(definition.schema, examples, '')
  if (fakePath === undefined)
    return examples

  let module: FixturesModule
  try {
    module = await loadFixtures()
  }
  catch (error) {
    fixtures = undefined
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`\`examples.${fakePath}\` is made with Faker, which needs @faker-js/faker. Install it with \`npm i -D @faker-js/faker\`.\n${reason}`)
  }
  const { DEFAULT_SEED, resolveExamples } = module
  return resolveExamples({ name: definition.name ?? '', schema: definition.schema as never, examples }, { seed: DEFAULT_SEED })
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

  const { name, schema, examples, slots, cases, strength } = definition as EvaluatedDefinition & { name?: unknown }
  if (name !== undefined && typeof name !== 'string')
    throw new Error('`name` of `defineComponent` must be a string')
  return { schema, name, examples, slots, cases, strength }
}

/**
 * The whole definition a `defineComponent` or `mixinSchema` block declares, run in this thread.
 * The test fixtures need it, the JSON Schema only its plain parts. Throws like the block does.
 */
export function readSchemaBlockDefinition(z: ZodNamespace, source: string, form: Exclude<MixinSchemaForm, 'module'>): EvaluatedDefinition {
  return form === 'defineComponent' ? runDefineComponentBlock(z, source) : runMixinSchemaBlock(z, source)
}

/**
 * Convert a schema to JSON Schema and check it against the zod features the playground supports
 * (see `./schema-support.ts`). The resolved `examples` set the first example of the top-level props
 * they name, an object prop gets its whole object.
 */
async function toPlaygroundJsonSchema(z: ZodNamespace, definition: EvaluatedDefinition): Promise<Record<string, unknown>> {
  const { schema } = definition
  const jsonSchema = z.toJSONSchema(schema as never, {
    io: 'input',
    // a type JSON Schema cannot describe (dates, maps, …) cannot get a control either
    unrepresentable: 'throw',
  }) as Record<string, unknown>

  const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined
  for (const [key, value] of Object.entries(await resolveDefinitionExamples(definition))) {
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

/**
 * Evaluate a mixin's schema block on its own and convert the schema to JSON Schema.
 *
 * The block may only reference `z`: it runs here without the mixin's `props` or any other
 * template variable. `io: 'input'` describes what a caller may pass, so a field with `.default()`
 * is optional rather than required. The result must stay within the zod features the playground
 * supports (see `./schema-support.ts`); anything else is reported as an error. Never rejects.
 * `examples` of a `defineComponent` block count as in a `.schema.ts` file.
 */
export async function evaluateMixinSchema(z: ZodNamespace, source: string, form: MixinSchemaForm = 'mixinSchema'): Promise<MixinSchemaResult> {
  try {
    const definition = form === 'defineComponent' ? runDefineComponentBlock(z, source) : runMixinSchemaBlock(z, source)
    const { schema, name } = definition
    if (!schema || typeof schema !== 'object' || !('_zod' in schema))
      return { error: form === 'defineComponent' ? '`schema` of `defineComponent` is not a zod schema' : '`mixinSchema` is not a zod schema' }

    return toResult(await toPlaygroundJsonSchema(z, definition), name)
  }
  catch (error) {
    return toError(error)
  }
}

/**
 * Convert a component definition from a `.schema.ts` file to JSON Schema, like
 * {@link evaluateMixinSchema} does for a block. Never rejects.
 */
export async function evaluateComponentDefinition(z: ZodNamespace, definition: ComponentDefinition | undefined, name: string): Promise<MixinSchemaResult> {
  if (!definition)
    return { error: `No .schema.ts file exports a component named "${name}". Export an object \`{ name: '${name}', schema }\` from the .schema.ts file next to the mixin.` }
  if (!('_zod' in definition.schema))
    return { error: `\`schema\` of "${name}" is not a zod schema` }
  try {
    return toResult(await toPlaygroundJsonSchema(z, { schema: definition.schema, name, examples: definition.examples }), name)
  }
  catch (error) {
    return toError(error)
  }
}
