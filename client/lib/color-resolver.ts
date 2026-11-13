import type { Oklch, Rgba } from './color-formats.ts'
import { parseComputedColor, parseOklch } from './color-formats.ts'
import { applyThemeToDocument } from './theme-document.ts'

/**
 * Resolves a color as written in a `Colors:` block (`#2563eb`, `hsl(…)`, `oklch(…)`, `var(--token)`).
 * The browser does the conversion: relative color syntax computes the color as `color(srgb …)` and
 * as `oklch(…)`, whatever notation it was written in.
 *
 * A literal resolves in the styleguide UI itself. A `var(--token)` resolves there too when the
 * project defines the property for the UI (`type: 'overwriteStyleguide'`). Otherwise it resolves in
 * a hidden document that loads only the preview stylesheets (`lib/templates/fullpage.ts`,
 * `generateColorResolverFile`). That document follows the styleguide's color scheme and global
 * theme, so `light-dark()` and theme-scoped tokens resolve to what the previews show.
 */

const CUSTOM_PROPERTY_RE = /^var\(\s*(--[\w-]+)\s*\)$/

const GLOBAL_THEME_SELECT_SELECTOR = '[data-global-theme-select]'

export function getCustomPropertyName(value: string): string | null {
  return CUSTOM_PROPERTY_RE.exec(value.trim())?.[1] ?? null
}

export interface ResolvedColor {
  /** The color as the browser computes it, for painting the swatch. */
  computed: string
  /** sRGB channels, clipped to the sRGB gamut. */
  rgba: Rgba
  /** `null` in browsers without relative color syntax. */
  oklch: Oklch | null
}

/** Compute `value` as a color inside `doc`, or `null` if a custom property it uses is undefined there. */
function computeColor(doc: Document, value: string): ResolvedColor | null {
  const probe = doc.createElement('span')
  doc.body.append(probe)
  const style = doc.defaultView?.getComputedStyle(probe)

  const compute = (expression: string) => {
    probe.style.color = ''
    probe.style.color = expression
    // An expression the browser rejects leaves the property empty and inherits; tell the two apart
    return probe.style.color === '' ? null : style?.color ?? null
  }

  const propertyName = getCustomPropertyName(value)
  const computed = compute(value)
  const isDefined = propertyName === null || (style?.getPropertyValue(propertyName).trim() ?? '') !== ''
  const srgb = compute(`color(from ${value} srgb r g b / alpha)`)
  const oklch = compute(`oklch(from ${value} l c h / alpha)`)
  probe.remove()

  const rgba = parseComputedColor(srgb ?? '') ?? parseComputedColor(computed ?? '')
  if (!isDefined || computed === null || rgba === null)
    return null

  return { computed, rgba, oklch: oklch === null ? null : parseOklch(oklch) }
}

let resolverDocument: Promise<Document | null> | undefined
let appliedThemeClass = ''

function loadResolverDocument(src: string): Promise<Document | null> {
  resolverDocument ??= new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.src = src
    iframe.title = 'Color resolver'
    iframe.tabIndex = -1
    iframe.setAttribute('aria-hidden', 'true')
    // Not `display: none`: some engines skip style resolution in undisplayed frames
    iframe.style.cssText = 'position: fixed; inline-size: 0; block-size: 0; border: 0; visibility: hidden; pointer-events: none;'

    iframe.addEventListener('load', () => resolve(iframe.contentDocument), { once: true })
    iframe.addEventListener('error', () => resolve(null), { once: true })
    document.body.append(iframe)
  })

  return resolverDocument
}

/** Mirror the styleguide's current color scheme and global theme onto the resolver document. */
function syncResolverTheme(doc: Document): void {
  doc.documentElement.style.colorScheme = getComputedStyle(document.body).colorScheme

  const themeClass = document.querySelector<HTMLSelectElement>(GLOBAL_THEME_SELECT_SELECTOR)?.value ?? ''
  applyThemeToDocument(doc, themeClass, appliedThemeClass)
  appliedThemeClass = themeClass
}

/**
 * Resolve `value` to sRGB. `resolverSrc` is the hidden document used for custom properties the
 * styleguide UI doesn't define; without it such a color resolves to `null`.
 */
export async function resolveColor(value: string, resolverSrc?: string): Promise<ResolvedColor | null> {
  const resolvedInUi = computeColor(document, value)
  if (resolvedInUi || !resolverSrc || getCustomPropertyName(value) === null)
    return resolvedInUi

  const doc = await loadResolverDocument(resolverSrc)
  if (!doc?.body)
    return null

  syncResolverTheme(doc)
  return computeColor(doc, value)
}
