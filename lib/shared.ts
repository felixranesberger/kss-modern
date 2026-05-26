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

  const omitValue = ['required', 'disabled', 'checked', 'selected', 'multiple', 'readonly', 'open']
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
