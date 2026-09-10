import { getSectionPreviews, SECTION_SELECTOR } from './section-previews.ts'

/**
 * Per-section theme dropdown (markup: `renderThemeSelect` in `lib/templates/preview.ts`).
 *
 * A section's `Themes:` entries are alternative theme contexts — classes such as
 * `theme-midnight` that a project scopes its token overrides to. Selecting one adds
 * those classes to the <html> element of every preview iframe in the section (the
 * base preview and each modifier variant), so the component is shown re-themed
 * without a rebuild. "Default" (the empty option) restores the unthemed preview.
 *
 * The parent applies the classes directly to already-loaded previews and records
 * them in `data-theme-class` on the <iframe>; `client/fullpage.ts` reads that
 * attribute when a preview (re)loads, so the selection survives the iframe's own
 * document being replaced. "Open in fullpage" links carry the selection as
 * `?theme=` for the same reason.
 */

/** Attribute on a preview <iframe> holding the class list currently applied to its document root. */
export const THEME_CLASS_ATTRIBUTE = 'data-theme-class'

/** Query parameter a standalone fullpage reads the theme class list from. */
export const THEME_URL_PARAM = 'theme'

const STORAGE_KEY_PREFIX = 'in2section-theme:'

function splitClasses(value: string | null | undefined): string[] {
  return (value ?? '').split(/\s+/).filter(Boolean)
}

/**
 * Swap the theme classes on a preview iframe's own document root. Only the classes
 * this module previously applied (recorded in `data-theme-class`) are removed, so a
 * static `htmlclass` that happens to equal a theme class is never stripped.
 */
export function applyPreviewThemeClass(iframe: HTMLIFrameElement, themeClass: string): void {
  const previous = iframe.getAttribute(THEME_CLASS_ATTRIBUTE)

  if (themeClass)
    iframe.setAttribute(THEME_CLASS_ATTRIBUTE, themeClass)
  else
    iframe.removeAttribute(THEME_CLASS_ATTRIBUTE)

  const root = iframe.contentDocument?.documentElement
  if (!root)
    return

  root.classList.remove(...splitClasses(previous))
  root.classList.add(...splitClasses(themeClass))
}

/** Reflect the selection in the section's "Open in fullpage" links via `?theme=`. */
function updateFullpageLinks(section: HTMLElement, themeClass: string): void {
  section.querySelectorAll<HTMLAnchorElement>('a[href^="/fullpage-"]').forEach((link) => {
    const url = new URL(link.getAttribute('href')!, window.location.href)

    if (themeClass)
      url.searchParams.set(THEME_URL_PARAM, themeClass)
    else
      url.searchParams.delete(THEME_URL_PARAM)

    link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`)
  })
}

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

function hasOption(select: HTMLSelectElement, value: string): boolean {
  return Array.from(select.options).some(option => option.value === value)
}

export default function initSectionThemeSelects(selects: Iterable<HTMLSelectElement>): void {
  for (const select of selects) {
    const section = select.closest<HTMLElement>(SECTION_SELECTOR)
    if (!section)
      continue

    const reference = section.getAttribute('data-section-reference') ?? section.id
    const storageKey = `${STORAGE_KEY_PREFIX}${reference}`

    const apply = (themeClass: string) => {
      const { base, modifiers } = getSectionPreviews(section)
      const previews = base ? [base, ...modifiers] : modifiers
      previews.forEach(iframe => applyPreviewThemeClass(iframe, themeClass))
      updateFullpageLinks(section, themeClass)
    }

    // restore the remembered selection — ignore a stored value the section no longer offers
    const stored = readStoredTheme(storageKey)
    if (stored && hasOption(select, stored))
      select.value = stored

    if (select.value)
      apply(select.value)

    select.addEventListener('change', () => {
      writeStoredTheme(storageKey, select.value)
      apply(select.value)
    })
  }
}
