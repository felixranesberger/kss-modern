import { applyThemeClasses, GLOBAL_THEME_STORAGE_KEY, initThemeSelect } from './preview-theme.ts'

/**
 * The header's global theme dropdown (markup: `renderGlobalThemeSelect` in
 * `lib/templates/preview.ts`, options from the `themes` styleguide option).
 *
 * The selection is the baseline theme of every preview on every page — a section's own
 * dropdown overrides it for that section — and is remembered across pages and sessions.
 * How the classes reach the previews is `client/lib/preview-theme.ts`.
 */
export default function initGlobalThemeSelect(select: HTMLSelectElement): void {
  initThemeSelect(select, GLOBAL_THEME_STORAGE_KEY, document)
  applyThemeClasses()
}
