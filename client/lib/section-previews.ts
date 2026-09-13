/**
 * How a section's previews are found in the DOM (markup: `lib/templates/preview.ts`).
 *
 * The report and the audit dialog must audit the same previews — an e2e test
 * asserts they report the same violations — so the selectors live in one place.
 */

/** A component section on the preview page. */
export const SECTION_SELECTOR = '.styleguide-section'

/** Every preview iframe — base and modifier variants alike. */
export const PREVIEW_IFRAME_SELECTOR = 'iframe.preview-iframe'

export interface SectionPreviews {
  /** The section's base preview, absent for colour/icon/description-only sections. */
  base: HTMLIFrameElement | null
  /** One preview per modifier variant, in document order. */
  modifiers: HTMLIFrameElement[]
}

export function getSectionPreviews(section: ParentNode | null | undefined): SectionPreviews {
  return {
    base: section?.querySelector<HTMLIFrameElement>(`${PREVIEW_IFRAME_SELECTOR}:not([data-modifier])`) ?? null,
    modifiers: Array.from(section?.querySelectorAll<HTMLIFrameElement>(`${PREVIEW_IFRAME_SELECTOR}[data-modifier]`) ?? []),
  }
}
