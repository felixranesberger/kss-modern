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
 * same block without rendering, see `./schema.ts`. Safe to import from the browser.
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

/**
 * Parse `props` with `definition.schema` and return the parsed data. Throws a
 * {@link ComponentPropsError} for invalid props and a TypeError for a definition without a schema.
 */
export function defineComponent(this: DefineComponentContext | void, definition: ComponentDefinition, props: unknown): unknown {
  const mixin = this && typeof this.mixin === 'string' ? this.mixin : undefined
  const name = typeof definition?.name === 'string' ? definition.name : undefined
  if (typeof definition?.schema?.safeParse !== 'function')
    throw new TypeError(`${getErrorPrefix(name, mixin)}: \`schema\` must be a zod schema`)

  const result = definition.schema.safeParse(props)
  if (result.success)
    return result.data

  throw new ComponentPropsError(formatComponentPropsError(result.error.issues, name, mixin), result.error.issues)
}
