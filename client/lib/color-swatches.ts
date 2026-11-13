import type { ResolvedColor } from './color-resolver.ts'
import type { CopyPopoverItem } from './copy-popover.ts'
import { formatHex, formatHsl, formatOklch, formatRgb } from './color-formats.ts'
import { getCustomPropertyName, resolveColor } from './color-resolver.ts'
import { toggleCopyPopover } from './copy-popover.ts'

/**
 * Color swatches of a `Colors:` block (markup: `getMainContentColors` in `lib/templates/preview.ts`).
 * A click opens the copy popover with the color in every format. A `var(--token)` swatch is resolved
 * first (`client/lib/color-resolver.ts`), so it lists the token and its current value.
 */

const SWATCH_SELECTOR = 'button[data-color-value]'
const GLOBAL_THEME_SELECT_SELECTOR = '[data-global-theme-select]'

let latestRequest = 0

function getCopyGroups(value: string, resolved: ResolvedColor | null): CopyPopoverItem[][] {
  const propertyName = getCustomPropertyName(value)
  const tokenItems: CopyPopoverItem[] = propertyName
    ? [{ label: 'Variable', value }, { label: 'Property', value: propertyName }]
    : []

  if (!resolved)
    return [tokenItems.length > 0 ? tokenItems : [{ label: 'Value', value }]]

  const formatItems: CopyPopoverItem[] = [
    { label: 'HEX', value: formatHex(resolved.rgba) },
    { label: 'RGB', value: formatRgb(resolved.rgba) },
    { label: 'HSL', value: formatHsl(resolved.rgba) },
  ]
  if (resolved.oklch)
    formatItems.push({ label: 'OKLCH', value: formatOklch(resolved.oklch) })

  return [tokenItems, formatItems]
}

export default (swatchLists: NodeListOf<HTMLElement>) => {
  swatchLists.forEach((list) => {
    const resolverSrc = list.dataset.colorResolver
    const swatches = list.querySelectorAll<HTMLButtonElement>(SWATCH_SELECTOR)

    // The swatch's inline `var()` only paints if the UI defines the token, so paint the resolved value
    let paintedThemeKey = ''
    const paintCustomPropertySwatches = () => {
      const themeKey = `${getComputedStyle(document.body).colorScheme}|${document.querySelector<HTMLSelectElement>(GLOBAL_THEME_SELECT_SELECTOR)?.value ?? ''}`
      if (themeKey === paintedThemeKey)
        return
      paintedThemeKey = themeKey

      swatches.forEach(async (swatch) => {
        const value = swatch.dataset.colorValue ?? ''
        if (getCustomPropertyName(value) === null)
          return

        const resolved = await resolveColor(value, resolverSrc)
        swatch.style.backgroundColor = resolved?.computed ?? value
      })
    }

    swatches.forEach((swatch) => {
      const value = swatch.dataset.colorValue ?? ''

      swatch.addEventListener('click', async (event) => {
        // A slower resolve of an earlier click must not open over a later one
        const request = ++latestRequest
        const resolved = await resolveColor(value, resolverSrc)
        if (request !== latestRequest)
          return

        toggleCopyPopover(swatch, {
          heading: swatch.dataset.colorName ?? value,
          subheading: swatch.dataset.colorName ? value : undefined,
          description: swatch.dataset.colorDescription,
          preview: resolved?.computed,
          groups: getCopyGroups(value, resolved),
          copiedLabel: swatch.dataset.copiedLabel,
          failedLabel: swatch.dataset.copyFailedLabel,
        }, event.detail === 0)
      })
    })

    if (!resolverSrc)
      return

    paintCustomPropertySwatches()

    // The resolved value follows the light/dark toggle (a class on <body>) and the global theme
    new MutationObserver(paintCustomPropertySwatches)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] })
    document.querySelector(GLOBAL_THEME_SELECT_SELECTOR)
      ?.addEventListener('change', paintCustomPropertySwatches)
  })
}
