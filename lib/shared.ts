/**
 * Pure helpers safe to import from any environment (server, browser, worker).
 * No Node-only or browser-only imports.
 */

/**
 * An `<insert-vite-pug src="…" modifierClass="…">` tag, where the optional `modifierClass` may sit
 * on the next line. Shared by the parser (parse-time dependency discovery) and the pug compiler
 * (compile-time tag expansion); both consume it only via `String.prototype.match`, which resets
 * `lastIndex`, so the single global instance is safe to reuse.
 */
// eslint-disable-next-line regexp/no-super-linear-backtracking
export const INSERT_VITE_PUG_TAG_RE = /<insert-vite-pug src="(.+?)".*(?:[\n\r\u2028\u2029]\s*)?(modifierClass="(.+?)")? *><\/insert-vite-pug>/g

/** The `src="…"` attribute of an `<insert-vite-pug>` tag. */
export const PUG_SRC_RE = /src="(.+?)"/

/** The optional `modifierClass="…"` attribute of an `<insert-vite-pug>` tag. */
export const PUG_MODIFIER_CLASS_RE = /modifierClass="(.+?)"/

/**
 * Tag name of the dev-only pug compile-error overlay. The custom element itself lives in
 * `client/lib/pug-error-overlay.ts` (bundled into the fullpage client the preview always loads);
 * `renderPugErrorOverlay` emits just this tag, layered over the section's last good render. All its
 * attributes are HTML-escaped, so the element is always a single self-contained tag with no literal
 * `>` inside — which is what lets `stripPugErrorOverlay` match it with a tag-bounded regex.
 */
export const PUG_ERROR_OVERLAY_TAG = 'pug-error-overlay'

const PUG_ERROR_OVERLAY_RE = new RegExp(`<${PUG_ERROR_OVERLAY_TAG}\\b[^>]*></${PUG_ERROR_OVERLAY_TAG}>`, 'g')

/**
 * Remove every pug error overlay element from `html`, leaving the section's real content untouched, so
 * the overlay never reaches anything that treats the markup as the section's source — the code-copy
 * value, the "show code" view, and the html-validate audit. (The live-DOM axe audit excludes the
 * element by tag name instead.)
 */
export function stripPugErrorOverlay(html: string): string {
  return html.replace(PUG_ERROR_OVERLAY_RE, '')
}

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
