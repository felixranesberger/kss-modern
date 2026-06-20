/**
 * Pure helpers safe to import from any environment (server, browser, worker).
 * No Node-only or browser-only imports.
 */

/**
 * Pug outputs some semantic issues that throw accessibility errors.
 * This function fixes them.
 */
export function fixAccessibilityIssues(html: string): string {
  let parsedMarkup = html

  const omitValue = [
    'allowfullscreen',
    'async',
    'autofocus',
    'autoplay',
    'checked',
    'controls',
    'default',
    'defer',
    'disabled',
    'formnovalidate',
    'inert',
    'ismap',
    'itemscope',
    'loop',
    'multiple',
    'muted',
    'nomodule',
    'novalidate',
    'open',
    'playsinline',
    'readonly',
    'required',
    'reversed',
    'selected',
  ]

  omitValue.forEach((value) => {
    parsedMarkup = parsedMarkup
      .replaceAll(`${value}="${value}"`, value)
      .replaceAll(`${value}=""`, value)
  })

  return parsedMarkup
}

/**
 * Convert special characters to HTML entities
 */
export function sanitizeSpecialCharacters(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

export function ensureStartingSlash(input: string): string {
  return input.startsWith('/') ? input : `/${input}`
}

// A `Wrapper:` slot may be written as either `<wrapper-content/>` or `{{wrapper-content}}`
// (whitespace around the token is tolerated). Both forms appear across real styleguides.
const WRAPPER_CONTENT_RE = /<wrapper-content\s*\/>|\{\{\s*wrapper-content\s*\}\}/g

/**
 * Substitute a section's markup into its wrapper at the wrapper-content slot. A replacer function is
 * used so `$`-sequences in the markup (e.g. `$&`, `$1`) are inserted verbatim rather than treated as
 * replacement patterns. Returns the wrapper unchanged when it has no recognised slot.
 */
export function replaceWrapperContent(wrapper: string, content: string): string {
  return wrapper.replace(WRAPPER_CONTENT_RE, () => content)
}

function* idGenerator(): Generator<number, never, unknown> {
  let id = 0

  while (true) {
    yield id++
  }
}

const idGen = idGenerator()

export function generateId(): number {
  const { value } = idGen.next()
  return value
}
