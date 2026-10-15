/**
 * Props in URLs and as a Pug call. Pure helpers shared by both playground hosts.
 */
import type { Field } from './fields.ts'

const HASH_KEY = 'props'

/** Parse a props JSON string from a URL. Anything that is not a JSON object is reported as an error. */
export function parseProps(raw: string | null): { props?: Record<string, unknown>, error?: string } {
  if (raw === null || raw === '')
    return {}

  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return { error: '`props` must be a JSON object' }
    return { props: value as Record<string, unknown> }
  }
  catch (error) {
    return { error: `\`props\` is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
}

const SCRIPT_URL_RE = /^(?:javascript|vbscript|data):/i

/** Browsers drop control characters and whitespace around and inside a URL scheme, so compare without them. */
function isScriptUrl(value: string): boolean {
  return SCRIPT_URL_RE.test([...value].filter(character => character.charCodeAt(0) > 0x20).join(''))
}

/**
 * Keys a record prop may turn into attribute names: an event handler (`onclick`) or anything that is
 * no plain attribute name would let a link run script through `&attributes`.
 */
const UNSAFE_KEY_RE = /^on|[^\w:.-]/i

/**
 * The first string anywhere in `value` that carries markup or a script URL, or the first object key
 * that could become an event handler or a broken attribute name, if any.
 */
export function findUnsafeString(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value.includes('<') || isScriptUrl(value) ? value : undefined
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (!Array.isArray(value) && UNSAFE_KEY_RE.test(key))
        return key
      const unsafe = findUnsafeString(entry)
      if (unsafe !== undefined)
        return unsafe
    }
  }
  return undefined
}

/**
 * Props from the hash (`#props=…`, kept in sync while editing) or else from `?props=…`.
 *
 * The rendered component is inserted as HTML, so a link is untrusted input: a template that prints
 * a prop unescaped, or puts it into `href`/`src`, would run whatever the link carries. Props from a
 * URL that contain markup, a `javascript:`/`data:` URL or an object key like `onclick` are therefore refused. Typed into the
 * controls, the same values are fine: they only reach the person typing them.
 */
export function readPropsFromUrl(url: URL): { props?: Record<string, unknown>, error?: string } {
  const hashProps = new URLSearchParams(url.hash.slice(1)).get(HASH_KEY)
  const result = parseProps(hashProps ?? url.searchParams.get(HASH_KEY))
  // the prop names themselves are checked by the schema, only what they carry becomes markup
  const unsafe = result.props ? findUnsafeString(Object.values(result.props)) : undefined
  if (unsafe !== undefined)
    return { error: `The props from the link were not applied: they contain markup, a script URL or an attribute name like onclick (${JSON.stringify(unsafe.slice(0, 40))}). Enter such values in the controls instead.` }
  return result
}

/** The current URL with `props` written into its hash, the query string left alone. */
export function writePropsToHash(url: URL, props: Record<string, unknown>): URL {
  const next = new URL(url)
  const hash = new URLSearchParams(next.hash.slice(1))
  hash.set(HASH_KEY, JSON.stringify(props))
  next.hash = hash.toString()
  return next
}

/** The current URL with `props` in its query string, for a reload that has to start from them. */
export function writePropsToQuery(url: URL, props: Record<string, unknown>): URL {
  const next = new URL(url)
  next.searchParams.set(HASH_KEY, JSON.stringify(props))
  next.hash = ''
  return next
}

const IDENTIFIER_RE = /^[A-Z_$][\w$]*$/i

function formatValue(value: unknown): string {
  if (typeof value === 'string')
    return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'').replaceAll('\n', '\\n')}'`

  if (Array.isArray(value))
    return `[${value.map(formatValue).join(', ')}]`

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.length === 0)
      return '{}'
    return `{ ${entries.map(([key, entry]) => `${IDENTIFIER_RE.test(key) ? key : formatValue(key)}: ${formatValue(entry)}`).join(', ')} }`
  }

  return JSON.stringify(value) ?? 'undefined'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `values` without the keys whose value equals the field's schema default, also inside object
 * props and list entries.
 */
function omitDefaults(values: Record<string, unknown>, fields: Field[]): Record<string, unknown> {
  const fieldsByKey = new Map(fields.map(field => [field.key, field]))
  const shown: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    const field = fieldsByKey.get(key)
    const items = field?.items
    if (field?.hasDefault && JSON.stringify(field.default) === JSON.stringify(value))
      continue
    if (field?.kind === 'object' && isPlainObject(value))
      shown[key] = omitDefaults(value, field.fields ?? [])
    else if (items?.kind === 'object' && Array.isArray(value))
      shown[key] = value.map(entry => (isPlainObject(entry) ? omitDefaults(entry, items.fields) : entry))
    else
      shown[key] = value
  }
  return shown
}

/**
 * The Pug call that renders the current props, ready to paste into a template:
 * `+button({ label: 'Save' })`. Props, fields of object props and fields of list entries equal to
 * their schema default are left out.
 */
export function formatPugCall(name: string, props: Record<string, unknown>, fields: Field[] = []): string {
  return `+${name}(${formatValue(omitDefaults(props, fields))})`
}
