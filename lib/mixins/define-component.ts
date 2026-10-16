/**
 * `defineComponent`, the template local a public mixin declares itself with:
 *
 * ```pug
 * mixin atomButton(props)
 *   -
 *     const p = defineComponent({
 *       name: 'atoms/Button',
 *       schema: z.strictObject({ label: z.string() }),
 *     }, props)
 * ```
 *
 * At render time it parses `props` with the schema and returns the parsed data. The build reads the
 * same block without rendering, see `./schema.ts`.
 *
 * A mixin whose schema lives in a `<file>.schema.ts` next to its `.pug` file passes the component's
 * name instead, `defineComponent('atoms/Button', props)`, and the definition comes from the
 * registry of those files, see `./schema-registry.ts`. Safe to import from the browser.
 */

/** A zod issue, reduced to what the error message and the playground need. */
export interface ComponentPropsIssue {
  path: PropertyKey[]
  message: string
}

interface SafeParseSchema {
  safeParse: (input: unknown) => { success: true, data: unknown } | { success: false, error: { issues: ComponentPropsIssue[] } }
}

export interface ComponentDefinition {
  /** Where the mixin sits in the explorer, `/` nests folders. The last segment names its START/END markers. */
  name?: string
  schema: SafeParseSchema
  /**
   * Demo values per prop, only for a definition in a `.schema.ts` file: the explorer starts with
   * them, like with `.meta({ examples })`. They are never defaults.
   */
  examples?: Record<string, unknown>
}

/** The definitions of the `.schema.ts` files by component name. */
export type ComponentRegistry = ReadonlyMap<string, ComponentDefinition>

function isComponentDefinition(value: unknown): value is ComponentDefinition & { name: string } {
  const candidate = value as Partial<ComponentDefinition> | null
  return typeof candidate === 'object' && candidate !== null && typeof candidate.name === 'string'
    && typeof candidate.schema?.safeParse === 'function'
}

/**
 * The component definitions among the exports of `.schema.ts` modules: every export that is an
 * object with a string `name` and a zod `schema`. Throws when two exports share a name.
 */
export function collectComponentDefinitions(modules: [file: string, exports: Record<string, unknown>][]): Map<string, ComponentDefinition> {
  const registry = new Map<string, ComponentDefinition>()
  const files = new Map<string, string>()
  for (const [file, exports] of modules) {
    for (const value of Object.values(exports)) {
      if (!isComponentDefinition(value))
        continue
      const previous = files.get(value.name)
      if (previous !== undefined && registry.get(value.name) !== value)
        throw new Error(`The component "${value.name}" is defined in ${previous} and in ${file}`)
      registry.set(value.name, value)
      files.set(value.name, file)
    }
  }
  return registry
}

/** What the marker plugin passes as `this`, so an error can name the Pug mixin as well. */
export interface DefineComponentContext {
  mixin?: string
}

/** Thrown for invalid props. `issues` are zod's, so the playground shows them at the matching control. */
export class ComponentPropsError extends Error {
  readonly issues: ComponentPropsIssue[]

  constructor(message: string, issues: ComponentPropsIssue[]) {
    super(message)
    this.name = 'ComponentPropsError'
    this.issues = issues
  }
}

/** `links[0].text`; symbols are left out. */
export function formatIssuePath(path: PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number')
      return `${formatted}[${segment}]`
    if (typeof segment === 'symbol')
      return formatted
    return formatted ? `${formatted}.${segment}` : segment
  }, '')
}

function getErrorPrefix(name?: string, mixin?: string): string {
  return [name, mixin ? `(+${mixin})` : undefined].filter(Boolean).join(' ') || 'defineComponent'
}

/** One line per issue: `atoms/Button (+atomButton): label: Invalid input`. */
export function formatComponentPropsError(issues: ComponentPropsIssue[], name?: string, mixin?: string): string {
  const prefix = getErrorPrefix(name, mixin)
  return issues
    .map((issue) => {
      const path = formatIssuePath(issue.path)
      return path ? `${prefix}: ${path}: ${issue.message}` : `${prefix}: ${issue.message}`
    })
    .join('\n')
}

export type DefineComponent = (this: DefineComponentContext | void, definition: ComponentDefinition | string, props: unknown) => unknown

export interface DefineComponentOptions {
  /** Resolves `defineComponent('atoms/Button', props)`. */
  registry?: ComponentRegistry
  /** Called with every component name resolved through `registry`. */
  onResolve?: (name: string) => void
  /** Called with every parsed result, so the playground can show what the template received. */
  onParse?: (data: unknown, name?: string) => void
}

/** A `defineComponent` with a registry of `.schema.ts` definitions and hooks, see the options. */
export function createDefineComponent({ registry, onResolve, onParse }: DefineComponentOptions = {}): DefineComponent {
  return function (this: DefineComponentContext | void, definitionOrName: ComponentDefinition | string, props: unknown): unknown {
    const mixin = this && typeof this.mixin === 'string' ? this.mixin : undefined
    let definition = definitionOrName as ComponentDefinition | undefined
    if (typeof definitionOrName === 'string') {
      definition = registry?.get(definitionOrName)
      if (!definition)
        throw new TypeError(`${getErrorPrefix(definitionOrName, mixin)}: no .schema.ts file defines the component "${definitionOrName}"`)
      onResolve?.(definitionOrName)
    }

    const name = typeof definition?.name === 'string' ? definition.name : undefined
    if (typeof definition?.schema?.safeParse !== 'function')
      throw new TypeError(`${getErrorPrefix(name, mixin)}: \`schema\` must be a zod schema`)

    const result = definition.schema.safeParse(props)
    if (result.success) {
      onParse?.(result.data, name)
      return result.data
    }

    throw new ComponentPropsError(formatComponentPropsError(result.error.issues, name, mixin), result.error.issues)
  }
}

/**
 * Parse `props` with `definition.schema` and return the parsed data. Throws a
 * {@link ComponentPropsError} for invalid props and a TypeError for a definition without a schema
 * or a component name, which needs the registry of {@link createDefineComponent}.
 */
export const defineComponent: DefineComponent = createDefineComponent()
