/**
 * Applying a theme to a preview's own document — the one step shared by the parent (the theme
 * dropdowns in `client/lib/preview-theme.ts`, which reach into a loaded iframe) and by a preview
 * as it loads (`client/fullpage.ts`, which reads its theme off `data-theme-class` or `?theme=`).
 *
 * A theme is a class list on <html> plus, when the `themes` styleguide option gave it stylesheets,
 * the `<link data-theme-css>` tags for that class list. Those links are emitted into every preview
 * document up front (see `lib/templates/fullpage.ts`) and parked at `media="not all"`, so switching
 * a theme on or off is only an attribute flip — no request, no flash.
 *
 * This module is a leaf on purpose: `client/fullpage.ts` is its own bundle and must not pull in the
 * dropdowns' selection logic to reuse it.
 */

/** Attribute on a preview's `<link>` holding the theme class list the stylesheet belongs to. */
const THEME_CSS_ATTRIBUTE = 'data-theme-css'

/** A theme value as written to `data-theme-class` / `?theme=`: a space-separated class list. */
export function splitClasses(value: string): string[] {
  return value.split(/\s+/).filter(Boolean)
}

/**
 * Swap `previous` for `themeClass` on a preview document. Only the classes a theme put there are
 * removed, so a static `htmlclass` that happens to equal a theme class is never stripped.
 */
export function applyThemeToDocument(doc: Document, themeClass: string, previous = ''): void {
  doc.documentElement.classList.remove(...splitClasses(previous))
  doc.documentElement.classList.add(...splitClasses(themeClass))

  doc.querySelectorAll<HTMLLinkElement>(`link[${THEME_CSS_ATTRIBUTE}]`).forEach((link) => {
    link.media = link.getAttribute(THEME_CSS_ATTRIBUTE) === themeClass ? 'all' : 'not all'
  })
}
