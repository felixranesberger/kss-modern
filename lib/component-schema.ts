/**
 * `kss-modern/schema`, imported by `.schema.ts` files:
 *
 * ```ts
 * import { defineComponent } from 'kss-modern/schema'
 * import { z } from 'zod'
 *
 * export const button = defineComponent({
 *   name: 'atoms/Button',
 *   schema: z.strictObject({ text: z.string(), href: z.string().optional() }),
 *   examples: { text: 'Learn more', href: f => f.internet.url() },
 * })
 * ```
 *
 * `defineComponent` returns the definition unchanged. It exists for the types: `examples` must name
 * every prop with a free value and is checked against the props the schema takes, and `name` keeps
 * its literal type. `withFake` attaches a fake to a shared fragment, so components using it need no
 * example. The registry gives the `.schema.ts` modules their own copy of these functions, see
 * `COMPONENT_SCHEMA_SHIM_SOURCE` in `lib/mixins/schema-registry.ts`. So this file must stay free of
 * runtime imports, and the fakes live in a registry on `globalThis` that copy and module share.
 */
import type { Faker } from '@faker-js/faker'
import type { z } from 'zod'

export type { Faker }

/** A function that makes a value with Faker. Wherever `examples` takes a value it takes this as well. */
export type Fake<V> = (f: Faker) => V

declare const fakeBrand: unique symbol
/** Marks a schema fragment that brings its own fake, see {@link withFake}. */
export interface HasOwnFake { readonly [fakeBrand]: true }

type AnyObject = z.ZodObject<z.ZodRawShape>

/** Strip the wrappers that only change optional, default or nullable, and the output side of a pipe. */
type Unwrap<S>
  = S extends z.ZodOptional<infer I> ? Unwrap<I>
    : S extends z.ZodDefault<infer I> ? Unwrap<I>
      : S extends z.ZodPrefault<infer I> ? Unwrap<I>
        : S extends z.ZodNullable<infer I> ? Unwrap<I>
          : S extends z.ZodPipe<infer A, z.ZodType> ? Unwrap<A>
            : S

type HasDefault<S>
  = S extends z.ZodDefault<z.ZodType> | z.ZodPrefault<z.ZodType> ? true
    : S extends z.ZodOptional<infer I> | z.ZodNullable<infer I> ? HasDefault<I>
      : false

type HasFake<S>
  = S extends HasOwnFake ? true
    : S extends z.ZodOptional<infer I> | z.ZodDefault<infer I> | z.ZodPrefault<infer I> | z.ZodNullable<infer I> ? HasFake<I>
      : false

/** Enums, literals and booleans span the test matrix, they need no example. */
type IsEnumerable<V>
  = [V] extends [boolean] ? true
    : [V] extends [string] ? (string extends V ? false : true)
        : [V] extends [number] ? (number extends V ? false : true)
            : false

/** An object whose fields are all enumerable or have a default needs no example. */
type ObjectNeedsValue<O extends AnyObject> = [RequiredKeys<O['shape']>] extends [never] ? false : true

/** Does this prop need an entry in `examples` so the generator can fill it? */
type NeedsExample<S>
  = HasFake<S> extends true ? false
    : HasDefault<S> extends true ? false
      : Unwrap<S> extends AnyObject ? ObjectNeedsValue<Unwrap<S>>
        : Unwrap<S> extends z.ZodRecord ? false
          : IsEnumerable<NonNullable<z.input<Unwrap<S>>>> extends true ? false
            : true

type RequiredKeys<Shape> = { [K in keyof Shape]: NeedsExample<Shape[K]> extends true ? K : never }[keyof Shape]
type OptionalKeys<Shape> = Exclude<keyof Shape, RequiredKeys<Shape>>

/** What `examples` takes for one prop: a value or a fake, objects and arrays per field and per element. */
export type ExampleFor<S>
  = Unwrap<S> extends infer U
    ? U extends AnyObject ? ObjectExamples<U['shape']> | Fake<z.input<U>>
      : U extends z.ZodArray<infer E> ? ReadonlyArray<ExampleFor<E>> | Fake<z.input<U>>
        : NonNullable<z.input<U>> | Fake<NonNullable<z.input<U>>>
    : never

type Simplify<T> = { [K in keyof T]: T[K] } & {}

/** `examples` for an object shape: required for every field with a free value, optional for the rest. */
export type ObjectExamples<Shape> = Simplify<
  { [K in RequiredKeys<Shape>]-?: ExampleFor<Shape[K]> }
  & { [K in OptionalKeys<Shape>]?: ExampleFor<Shape[K]> }
>

/** The shape of a component's object schema, looking through optional, default and transforms. */
export type ShapeOf<S> = Unwrap<S> extends AnyObject ? Unwrap<S>['shape'] : never

/** The `examples` of a component schema. */
export type Examples<S extends z.ZodType> = ObjectExamples<ShapeOf<S>>

/** Content of a slot: fixed HTML or a fake. */
export type SlotContent = string | Fake<string>

/** Props of a named case, values as in `examples`. `undefined` leaves a prop out. */
export type CaseProps<S extends z.ZodType> = { [K in keyof ShapeOf<S>]?: ExampleFor<ShapeOf<S>[K]> }

/** A case that is always tested. The props it does not name come from `examples` and the matrix. */
export interface NamedCase<S extends z.ZodType = z.ZodType> {
  props: CaseProps<S>
  slots?: Record<string, SlotContent>
}

export interface ComponentSchemaDefinition<Name extends string = string, Schema extends z.ZodType = z.ZodType> {
  /** Where the mixin sits in the explorer, `/` nests folders. `defineComponent('<name>', props)` in the mixin picks it. */
  name: Name
  schema: Schema
  /**
   * The value source of the test cases and the explorer's starting values. Every prop with a free
   * value (string, number, array, object without default) must be named, fixed or as a fake.
   * Enums, booleans, literals, props with a default, records and fragments with {@link withFake}
   * may be left out. Named, they only set the explorer's start, the cases still combine all values.
   */
  examples: Examples<Schema>
  /** Content of the template's slots by name, `default` is the default block. Without an entry a slot gets a placeholder. */
  slots?: Record<string, SlotContent>
  /** Cases by name that are always tested, e.g. a bug from a ticket. */
  cases?: Record<string, NamedCase<Schema>>
  /** Coverage of components above the full-product limit: 2 covers every value pair of two dimensions (default), 3 every triple. */
  strength?: 1 | 2 | 3
}

export function defineComponent<const Name extends string, Schema extends z.ZodType>(
  definition: ComponentSchemaDefinition<Name, Schema>,
): ComponentSchemaDefinition<Name, Schema> {
  return definition
}

type FakeRegistry = WeakMap<object, Fake<unknown>>

/** The same key in the shim copy, so both see one registry. */
const FAKES_KEY = Symbol.for('kss-modern.fakes')

function getFakeRegistry(): FakeRegistry {
  const store = globalThis as typeof globalThis & { [FAKES_KEY]?: FakeRegistry }
  return store[FAKES_KEY] ??= new WeakMap()
}

/**
 * Attach a fake to a shared schema fragment. A prop using the fragment needs no entry in
 * `examples`, but may still have one. The fake is checked against the fragment's input type.
 */
export function withFake<Schema extends z.ZodType>(schema: Schema, fake: Fake<z.input<Schema>>): Schema & HasOwnFake {
  getFakeRegistry().set(schema, fake)
  return schema as Schema & HasOwnFake
}

const TRANSPARENT_WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault'])

interface ZodInternals {
  _zod?: { parent?: ZodInternals, def?: { type?: string, innerType?: ZodInternals } }
}

/**
 * The fake {@link withFake} attached to `schema`. Looks through `.optional()`, `.nullable()`,
 * `.default()` and `.prefault()`, and through clones like `.describe()` and `.meta()`.
 */
export function getFake(schema: unknown): Fake<unknown> | undefined {
  const registry = getFakeRegistry()
  let current = typeof schema === 'object' && schema !== null ? schema as ZodInternals : undefined
  while (current) {
    // a clone points at its original through `_zod.parent`, like zod's own registries read it
    for (let candidate: ZodInternals | undefined = current; candidate; candidate = candidate._zod?.parent) {
      const fake = registry.get(candidate)
      if (fake)
        return fake
    }
    const def = current._zod?.def
    current = def?.type && TRANSPARENT_WRAPPERS.has(def.type) ? def.innerType : undefined
  }
  return undefined
}
