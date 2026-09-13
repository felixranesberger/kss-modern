import { expect, test } from '@playwright/test'

/**
 * `reloadPreviewsOnThemeChange` makes a theme change reload the preview iframe instead of swapping
 * classes and stylesheets into the loaded document, so a preview's own scripts run again against
 * the new theme.
 *
 * The shared e2e build leaves the option off (the shell attribute it emits is covered by
 * tests/unit/lib/templates/preview-shell.test.ts), so these tests set the attribute the client
 * reads — `shouldReloadPreviews` in client/lib/preview-theme.ts — and exercise the real reload path
 * in the browser.
 */

const globalSelect = 'header [data-global-theme-select]'
const alertPreviews = '#section-3-20 iframe.preview-iframe'
const cardSelect = '#section-3-10 [data-section-theme-select]'
const cardPreviews = '#section-3-10 iframe.preview-iframe'

function enableReload(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.setAttribute('data-reload-previews-on-theme-change', ''))
}

/** Stamp the preview's current document; the mark is gone once that document has been replaced. */
async function markPreviewDocument(preview: ReturnType<import('@playwright/test').Page['locator']>) {
  await preview.contentFrame().locator('html').evaluate(root => root.setAttribute('data-e2e-generation', '1'))
}

test.describe('Reload previews on theme change', () => {
  test('reloads the preview and still applies the theme to the fresh document', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await enableReload(page)

    const preview = page.locator(alertPreviews).first()
    await markPreviewDocument(preview)

    await page.locator(globalSelect).selectOption('theme-midnight')

    // the marked document is gone — the iframe navigated
    await expect(preview.contentFrame().locator('html')).not.toHaveAttribute('data-e2e-generation', '1')
    // and the replacement picked the theme up off `data-theme-class`
    await expect(preview).toHaveAttribute('data-theme-class', 'theme-midnight')
    await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-midnight/)
  })

  test('activates the theme stylesheet in the reloaded document', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await enableReload(page)

    await page.locator(globalSelect).selectOption('theme-midnight')

    const preview = page.locator(alertPreviews).first()
    await expect(preview.contentFrame().locator('link[data-theme-css]')).toHaveAttribute('media', 'all')
    await expect(preview.contentFrame().locator('body')).toHaveCSS('background-color', 'rgb(11, 22, 33)')
  })

  test('leaves a section alone when its effective theme did not change', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })
    await enableReload(page)

    // the section overrides the global theme, so a later global change is a no-op for it
    await page.locator(cardSelect).selectOption('theme-sunrise')
    await expect(page.locator(cardPreviews).first().contentFrame().locator('html')).toHaveClass(/theme-sunrise/)

    const card = page.locator(cardPreviews).first()
    await markPreviewDocument(card)

    await page.locator(globalSelect).selectOption('theme-midnight')

    await expect(card.contentFrame().locator('html')).toHaveClass(/theme-sunrise/)
    await expect(card.contentFrame().locator('html')).toHaveAttribute('data-e2e-generation', '1')
  })

  test('leaves previews untouched on the initial restore, reloading only on a change', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await page.locator(globalSelect).selectOption('theme-sunrise')

    // a fresh load restores Sunrise from localStorage; with reload armed before any change,
    // the restore itself must not navigate the previews
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.setAttribute('data-reload-previews-on-theme-change', '')
      })
    })
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })

    const preview = page.locator(alertPreviews).first()
    await markPreviewDocument(preview)
    await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-sunrise/)

    // still the document we marked — the restore painted in place
    await expect(preview.contentFrame().locator('html')).toHaveAttribute('data-e2e-generation', '1')
  })

  test('does not reload when the option is off', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })

    const preview = page.locator(alertPreviews).first()
    await markPreviewDocument(preview)

    await page.locator(globalSelect).selectOption('theme-midnight')

    await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-midnight/)
    await expect(preview.contentFrame().locator('html')).toHaveAttribute('data-e2e-generation', '1')
  })
})
