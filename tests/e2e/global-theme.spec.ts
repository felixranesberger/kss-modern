import { expect, test } from '@playwright/test'

/**
 * The `themes` styleguide option adds a global theme dropdown to the header. Selecting a
 * theme adds its classes to the <html> of every preview iframe on the page — also in
 * sections without a `Themes:` block — and the choice follows the visitor across pages.
 * A section's own dropdown (Card, 3.10) overrides it for that section. The e2e server
 * configures `theme-midnight` / `theme-sunrise` (tests/e2e/serve.ts).
 */

const globalSelect = 'header [data-global-theme-select]'
const alertSection = '#section-3-20'
const alertPreviews = `${alertSection} iframe.preview-iframe`
const cardSelect = '#section-3-10 [data-section-theme-select]'
const cardPreviews = '#section-3-10 iframe.preview-iframe'

test.describe('Global theme dropdown', () => {
  test('offers a default option plus one option per configured theme', async ({ page }) => {
    await page.goto('/')

    const select = page.locator(globalSelect)
    await expect(select).toBeVisible()
    await expect(select.locator('option')).toHaveText(['Default', 'Midnight', 'Sunrise'])
    expect(await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)))
      .toEqual(['', 'theme-midnight', 'theme-sunrise'])
  })

  test('applies the theme class to every preview, also in sections without a Themes block', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-section-theme-select]')).toHaveCount(0)

    const previews = page.locator(alertPreviews)
    // base + three modifiers
    await expect(previews).toHaveCount(4)

    await page.locator(globalSelect).selectOption('theme-midnight')

    for (const preview of await previews.all()) {
      await expect(preview).toHaveAttribute('data-theme-class', 'theme-midnight')
      await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-midnight/)
    }
  })

  test('switching themes swaps the class, and Default removes it', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    const select = page.locator(globalSelect)
    const baseRoot = page.locator(alertPreviews).first().contentFrame().locator('html')

    await select.selectOption('theme-midnight')
    await expect(baseRoot).toHaveClass(/theme-midnight/)

    await select.selectOption('theme-sunrise')
    await expect(baseRoot).toHaveClass(/theme-sunrise/)
    await expect(baseRoot).not.toHaveClass(/theme-midnight/)

    await select.selectOption('')
    await expect(baseRoot).not.toHaveClass(/theme-sunrise/)
    await expect(page.locator(alertPreviews).first()).not.toHaveAttribute('data-theme-class', /.+/)
  })

  test('follows the visitor across pages and reloads', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await page.locator(globalSelect).selectOption('theme-sunrise')

    expect(await page.evaluate(() => localStorage.getItem('in2global-theme'))).toBe('theme-sunrise')

    // another page (Badge) — no Themes block of its own
    await page.goto('/preview-3.60.html', { waitUntil: 'networkidle' })

    await expect(page.locator(globalSelect)).toHaveValue('theme-sunrise')
    const previews = page.locator('iframe.preview-iframe')
    expect(await previews.count()).toBeGreaterThan(0)
    for (const preview of await previews.all())
      await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-sunrise/)
  })

  test('carries the theme into the fullpage links and the standalone fullpage', async ({ page }) => {
    await page.goto('/preview-3.20.html', { waitUntil: 'networkidle' })
    await page.locator(globalSelect).selectOption('theme-midnight')

    const links = page.locator(`${alertSection} a[href^="fullpage-3.20.html"]`)
    const hrefs = await links.evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href')!))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs)
      expect(new URL(href, 'http://localhost').searchParams.get('theme')).toBe('theme-midnight')

    // the modifier link keeps its own parameter alongside the theme
    const modifierHref = hrefs.find(href => href.includes('modifier='))
    expect(modifierHref).toContain('modifier=.c-alert--')

    await page.goto(hrefs[0])
    await expect(page.locator('html')).toHaveClass(/theme-midnight/)
  })

  test('is overridden by a section\'s own dropdown, which hands back to it on Default', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })
    const cardRoot = page.locator(cardPreviews).first().contentFrame().locator('html')

    await page.locator(globalSelect).selectOption('theme-midnight')
    await expect(cardRoot).toHaveClass(/theme-midnight/)
    await expect(page.locator(cardSelect)).toHaveValue('')

    await page.locator(cardSelect).selectOption('theme-sunrise')
    await expect(cardRoot).toHaveClass(/theme-sunrise/)
    await expect(cardRoot).not.toHaveClass(/theme-midnight/)

    await page.locator(cardSelect).selectOption('')
    await expect(cardRoot).toHaveClass(/theme-midnight/)
    await expect(cardRoot).not.toHaveClass(/theme-sunrise/)
  })
})
