import { expect, test } from '@playwright/test'

/**
 * A `themes` entry may carry `css` — stylesheets loaded into a preview while that theme is
 * selected, layered on top of `html.assets.css`. Every preview document holds a `<link>` for each
 * from the start, parked at `media="not all"`, so selecting the theme is a request-free flip.
 *
 * The e2e server gives Midnight `/e2e-theme-midnight.css` and Sunrise none (tests/e2e/serve.ts).
 * That stylesheet's rule is unscoped (`body { background-color: rgb(11, 22, 33) }`), so it shows
 * up if and only if the link was activated.
 */

const THEMED_BACKGROUND = 'rgb(11, 22, 33)'

const globalSelect = 'header [data-global-theme-select]'
const alertPreviews = '#section-3-20 iframe.preview-iframe'
const cardSelect = '#section-3-10 [data-section-theme-select]'
const cardPreviews = '#section-3-10 iframe.preview-iframe'

test.describe('Theme stylesheets', () => {
  test('parks every theme stylesheet inert until its theme is selected', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })

    const link = page.locator(alertPreviews).first().contentFrame().locator('link[data-theme-css]')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveAttribute('data-theme-css', 'theme-midnight')
    await expect(link).toHaveAttribute('media', 'not all')
    await expect(link).toHaveAttribute('href', '/e2e-theme-midnight.css')
  })

  test('activates the stylesheet in every preview when the global theme is selected', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })

    const previews = page.locator(alertPreviews)
    await expect(previews).toHaveCount(4)

    for (const preview of await previews.all())
      await expect(preview.contentFrame().locator('body')).not.toHaveCSS('background-color', THEMED_BACKGROUND)

    await page.locator(globalSelect).selectOption('theme-midnight')

    for (const preview of await previews.all()) {
      await expect(preview.contentFrame().locator('link[data-theme-css]')).toHaveAttribute('media', 'all')
      await expect(preview.contentFrame().locator('body')).toHaveCSS('background-color', THEMED_BACKGROUND)
    }
  })

  test('deactivates it again for a theme without css and for Default', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    const select = page.locator(globalSelect)
    const body = page.locator(alertPreviews).first().contentFrame().locator('body')

    await select.selectOption('theme-midnight')
    await expect(body).toHaveCSS('background-color', THEMED_BACKGROUND)

    // Sunrise declares no css — Midnight's stylesheet must go inert again
    await select.selectOption('theme-sunrise')
    await expect(body).not.toHaveCSS('background-color', THEMED_BACKGROUND)

    await select.selectOption('theme-midnight')
    await expect(body).toHaveCSS('background-color', THEMED_BACKGROUND)

    await select.selectOption('')
    await expect(body).not.toHaveCSS('background-color', THEMED_BACKGROUND)
  })

  test('survives a preview reload, and reaches a standalone fullpage via ?theme=', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await page.locator(globalSelect).selectOption('theme-midnight')

    // a fresh page load restores the theme from localStorage, previews included
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator(alertPreviews).first().contentFrame().locator('body'))
      .toHaveCSS('background-color', THEMED_BACKGROUND)

    await page.goto('/fullpage-3.20.html?theme=theme-midnight')
    await expect(page.locator('body')).toHaveCSS('background-color', THEMED_BACKGROUND)

    await page.goto('/fullpage-3.20.html')
    await expect(page.locator('body')).not.toHaveCSS('background-color', THEMED_BACKGROUND)
  })

  test('follows a section override rather than the global theme', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })
    const cardBody = page.locator(cardPreviews).first().contentFrame().locator('body')

    // the section picks Sunrise (no css) while the global theme is Midnight (css)
    await page.locator(globalSelect).selectOption('theme-midnight')
    await expect(cardBody).toHaveCSS('background-color', THEMED_BACKGROUND)

    await page.locator(cardSelect).selectOption('theme-sunrise')
    await expect(cardBody).not.toHaveCSS('background-color', THEMED_BACKGROUND)

    await page.locator(cardSelect).selectOption('')
    await expect(cardBody).toHaveCSS('background-color', THEMED_BACKGROUND)
  })
})
