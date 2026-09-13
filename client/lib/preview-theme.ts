import { PREVIEW_IFRAME_SELECTOR, SECTION_SELECTOR } from './section-previews.ts'
import { applyThemeToDocument } from './theme-document.ts'

/**
 * Theme classes on preview documents — the shared half of the header's global theme
 * dropdown (`client/lib/global-theme-select.ts`) and the per-section dropdowns
 * (`client/lib/section-theme-select.ts`).
 *
 * A theme is a class list such as `theme-midnight` that a project scopes its token
 * overrides to. Applying one adds the classes to the <html> element of preview iframes,
 * so a component is shown re-themed without a rebuild. Two selections feed into that:
 *
 * - the global theme (the `themes` styleguide option) is the baseline for every preview
 *   on the page;
 * - a section's own `Themes:` dropdown overrides it for that section's previews — its
 *   "Default" option means "follow the global theme".
 *
 * The dropdowns themselves hold that state: the effective theme of a preview is read
 * back off the selects, so the two modules need no shared bookkeeping and can init in
 * either order.
 *
 * The parent applies the classes directly to already-loaded previews and records them
 * in `data-theme-class` on the <iframe>; `client/fullpage.ts` reads that attribute when
 * a preview (re)loads, so the selection survives the iframe's own document being replaced.
 * "Open in fullpage" links carry the effective theme as `?theme=` for the same reason.
 */

/** Attribute on a preview <iframe> holding the class list currently applied to its document root. */
const THEME_CLASS_ATTRIBUTE = 'data-theme-class'

/** Query parameter a standalone fullpage reads the theme class list from. */
const THEME_URL_PARAM = 'theme'

/** localStorage key of the global theme selection. */
export const GLOBAL_THEME_STORAGE_KEY = 'in2global-theme'

/** localStorage key prefix of a section's theme selection; the section reference follows. */
export const SECTION_THEME_STORAGE_KEY_PREFIX = 'in2section-theme:'

const GLOBAL_THEME_SELECT_SELECTOR = '[data-global-theme-select]'
const SECTION_THEME_SELECT_SELECTOR = '[data-section-theme-select]'

const FULLPAGE_LINK_SELECTOR = 'a[href^="/fullpage-"]'

/**
 * Swap the theme on a preview iframe's own document — classes plus any themed stylesheets.
 * The class list currently applied is recorded in `data-theme-class`, which is also what a
 * reloading preview reads back (`client/fullpage.ts`).
 */
export function applyPreviewThemeClass(iframe: HTMLIFrameElement, themeClass: string): void {
  const previous = iframe.getAttribute(THEME_CLASS_ATTRIBUTE) ?? ''
  if (previous === themeClass)
    return

  if (themeClass)
    iframe.setAttribute(THEME_CLASS_ATTRIBUTE, themeClass)
  else
    iframe.removeAttribute(THEME_CLASS_ATTRIBUTE)

  const doc = iframe.contentDocument
  if (doc)
    applyThemeToDocument(doc, themeClass, previous)
}

/** Reflect a theme in an "Open in fullpage" link via `?theme=`; the empty theme drops the parameter. */
function updateFullpageLink(link: HTMLAnchorElement, themeClass: string): void {
  const url = new URL(link.getAttribute('href')!, window.location.href)

  if (themeClass)
    url.searchParams.set(THEME_URL_PARAM, themeClass)
  else
    url.searchParams.delete(THEME_URL_PARAM)

  const href = `${url.pathname}${url.search}${url.hash}`
  if (href !== link.getAttribute('href'))
    link.setAttribute('href', href)
}

/**
 * The theme a preview inside `section` (or outside any section) currently shows: the
 * section's own selection if it has a dropdown set to something other than "Default",
 * otherwise the global one.
 */
function getEffectiveThemeClass(section: Element | null): string {
  const sectionSelect = section?.querySelector<HTMLSelectElement>(SECTION_THEME_SELECT_SELECTOR)
  const globalSelect = document.querySelector<HTMLSelectElement>(GLOBAL_THEME_SELECT_SELECTOR)

  return sectionSelect?.value || globalSelect?.value || ''
}

/** Paint the effective theme onto every preview iframe and fullpage link under `scope`. */
export function applyThemeClasses(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLIFrameElement>(PREVIEW_IFRAME_SELECTOR).forEach((iframe) => {
    applyPreviewThemeClass(iframe, getEffectiveThemeClass(iframe.closest(SECTION_SELECTOR)))
  })

  scope.querySelectorAll<HTMLAnchorElement>(FULLPAGE_LINK_SELECTOR).forEach((link) => {
    updateFullpageLink(link, getEffectiveThemeClass(link.closest(SECTION_SELECTOR)))
  })
}

// --- persistence -------------------------------------------------------------------------

function readStoredTheme(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function writeStoredTheme(key: string, themeClass: string): void {
  try {
    if (themeClass)
      localStorage.setItem(key, themeClass)
    else
      localStorage.removeItem(key)
  }
  catch {
    // storage unavailable (private mode, blocked) — the selection still applies for this page view
  }
}

/**
 * Restore a dropdown's remembered selection (ignoring a stored value it no longer offers) and
 * keep it remembered. Painting is left to the caller, which does it once for all dropdowns.
 */
export function initThemeSelect(select: HTMLSelectElement, storageKey: string, scope: ParentNode): void {
  const stored = readStoredTheme(storageKey)
  if (stored && Array.from(select.options).some(option => option.value === stored))
    select.value = stored

  select.addEventListener('change', () => {
    writeStoredTheme(storageKey, select.value)
    applyThemeClasses(scope)
  })
}
