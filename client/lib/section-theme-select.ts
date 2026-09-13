import { applyThemeClasses, initThemeSelect, SECTION_THEME_STORAGE_KEY_PREFIX } from './preview-theme.ts'
import { SECTION_SELECTOR } from './section-previews.ts'

/**
 * Per-section theme dropdown (markup: `renderThemeSelect` in `lib/templates/preview.ts`).
 *
 * A section's `Themes:` entries are alternative theme contexts for its previews — the
 * base preview and each modifier variant. The selection overrides the global theme for
 * this section; "Default" (the empty option) follows the global theme again. It is
 * remembered per section. How the classes reach the previews is `client/lib/preview-theme.ts`.
 */
export default function initSectionThemeSelects(selects: Iterable<HTMLSelectElement>): void {
  for (const select of selects) {
    const section = select.closest<HTMLElement>(SECTION_SELECTOR)
    if (!section)
      continue

    const reference = section.getAttribute('data-section-reference') ?? section.id
    initThemeSelect(select, `${SECTION_THEME_STORAGE_KEY_PREFIX}${reference}`, section)
  }

  // one paint for all of them, once every select holds its restored value
  applyThemeClasses()
}
