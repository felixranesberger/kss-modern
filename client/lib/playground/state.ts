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

/** The first string anywhere in `value` that carries markup or a script URL, if any. */
export function findUnsafeString(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value.includes('<') || isScriptUrl(value) ? value : undefined
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) {
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
 * URL that contain markup or a `javascript:`/`data:` URL are therefore refused. Typed into the
 * controls, the same values are fine: they only reach the person typing them.
 */
export function readPropsFromUrl(url: URL): { props?: Record<string, unknown>, error?: string } {
  const hashProps = new URLSearchParams(url.hash.slice(1)).get(HASH_KEY)
  const result = parseProps(hashProps ?? url.searchParams.get(HASH_KEY))
  const unsafe = result.props ? findUnsafeString(result.props) : undefined
  if (unsafe !== undefined)
    return { error: `The props from the link were not applied: they contain markup or a script URL (${JSON.stringify(unsafe.slice(0, 40))}). Enter such values in the controls instead.` }
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

/** `values` without the keys whose value equals the field's schema default. */
function omitDefaults(values: Record<string, unknown>, fields: Field[]): Record<string, unknown> {
  const defaults = new Map(fields.filter(field => field.hasDefault).map(field => [field.key, JSON.stringify(field.default)]))
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => defaults.get(key) !== JSON.stringify(value)))
}

/**
 * The Pug call that renders the current props, ready to paste into a template:
 * `+button({ label: 'Save' })`. Props and fields of list entries equal to their schema default are
 * left out.
 */
export function formatPugCall(name: string, props: Record<string, unknown>, fields: Field[] = []): string {
  const shown = omitDefaults(props, fields)
  for (const field of fields) {
    const { items } = field
    if (items?.kind === 'object' && Array.isArray(shown[field.key])) {
      shown[field.key] = (shown[field.key] as unknown[]).map(entry =>
        typeof entry === 'object' && entry !== null ? omitDefaults(entry as Record<string, unknown>, items.fields) : entry,
      )
    }
  }
  return `+${name}(${formatValue(shown)})`
}
