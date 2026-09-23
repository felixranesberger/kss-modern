import { expect, test } from '@playwright/test'

/**
 * A section with a `Themes:` block gets a theme dropdown. Selecting a theme adds
 * its classes to the <html> of every preview iframe in that section (base and
 * modifier variants); "Default" removes them again. The example styleguide's Card
 * (3.10) offers `.theme-midnight` / `.theme-sunrise` and has two modifiers; the
 * Hero (3.40) combines a theme with a Figma design, so its dropdown shares the row
 * with the Preview/Design tabs.
 */

const cardSection = '#section-3-10'
const cardSelect = `${cardSection} [data-section-theme-select]`
const cardPreviews = `${cardSection} iframe.preview-iframe`

test.describe('Section theme dropdown', () => {
  test('offers a default option plus one option per theme', async ({ page }) => {
    await page.goto('/preview-3.10.html')

    const select = page.locator(cardSelect)
    await expect(select).toBeVisible()
    await expect(select.locator('option')).toHaveText(['Default', 'Midnight', 'Sunrise'])
    expect(await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)))
      .toEqual(['', 'theme-midnight', 'theme-sunrise'])
  })

  test('is absent on sections without a Themes block', async ({ page }) => {
    await page.goto('/preview-3.20.html')
    await expect(page.locator('[data-section-theme-select]')).toHaveCount(0)
  })

  test('applies the theme class to the base preview and every modifier preview', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })

    const previews = page.locator(cardPreviews)
    // base + two modifiers
    await expect(previews).toHaveCount(3)

    await page.locator(cardSelect).selectOption('theme-midnight')

    for (const preview of await previews.all()) {
      await expect(preview).toHaveAttribute('data-theme-class', 'theme-midnight')
      await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-midnight/)
    }
  })

  test('switching themes swaps the class, and Default removes it', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })
    const select = page.locator(cardSelect)
    const baseRoot = page.locator(cardPreviews).first().contentFrame().locator('html')

    await select.selectOption('theme-midnight')
    await expect(baseRoot).toHaveClass(/theme-midnight/)

    await select.selectOption('theme-sunrise')
    await expect(baseRoot).toHaveClass(/theme-sunrise/)
    await expect(baseRoot).not.toHaveClass(/theme-midnight/)

    await select.selectOption('')
    await expect(baseRoot).not.toHaveClass(/theme-sunrise/)
    await expect(page.locator(cardPreviews).first()).not.toHaveAttribute('data-theme-class', /.+/)
  })

  test('remembers the selection for the section across reloads', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })
    await page.locator(cardSelect).selectOption('theme-midnight')

    expect(await page.evaluate(() => localStorage.getItem('in2section-theme:3.10'))).toBe('theme-midnight')

    await page.reload({ waitUntil: 'networkidle' })

    await expect(page.locator(cardSelect)).toHaveValue('theme-midnight')
    for (const preview of await page.locator(cardPreviews).all())
      await expect(preview.contentFrame().locator('html')).toHaveClass(/theme-midnight/)
  })

  test('carries the theme into the fullpage links and the standalone fullpage', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'networkidle' })
    await page.locator(cardSelect).selectOption('theme-midnight')

    const links = page.locator(`${cardSection} a[href^="fullpage-3.10.html"]`)
    expect(await links.count()).toBeGreaterThan(0)
    for (const href of await links.evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href')!)))
      expect(new URL(href, 'http://localhost').searchParams.get('theme')).toBe('theme-midnight')

    // the modifier link keeps its own parameter alongside the theme
    const modifierHref = await page.locator(`${cardSection} a[href*="modifier="]`).first().getAttribute('href')
    expect(modifierHref).toContain('modifier=.c-card--primary')

    await page.goto('/fullpage-3.10.html?theme=theme-midnight')
    await expect(page.locator('html')).toHaveClass(/theme-midnight/)
  })

  test('shares the row with the Preview/Design tabs when the section has a Figma design', async ({ page }) => {
    await page.goto('/preview-3.40.html')

    const heroSection = page.locator('#section-3-40')
    const tabs = heroSection.locator('.tabs')
    await expect(tabs.locator('[role="tab"]')).toHaveText([/Preview/, /Design/])

    const select = tabs.locator('[data-section-theme-select]')
    await expect(select).toBeVisible()

    // the dropdown sits to the right of the tab triggers, vertically centred on them
    const tablistBox = (await tabs.locator('[role="tablist"]').boundingBox())!
    const selectBox = (await select.boundingBox())!
    expect(selectBox.x).toBeGreaterThan(tablistBox.x + tablistBox.width)
    expect(Math.abs((selectBox.y + selectBox.height / 2) - (tablistBox.y + tablistBox.height / 2))).toBeLessThan(4)

    await select.selectOption('theme-sunrise')
    await expect(heroSection.locator('iframe.preview-iframe').first().contentFrame().locator('html')).toHaveClass(/theme-sunrise/)
  })
})
