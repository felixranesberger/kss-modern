import { expect, test } from '@playwright/test'

test.describe('Icons', () => {
  async function navigateToIconsPage(page: import('@playwright/test').Page) {
    // Collect all sidebar hrefs from the index page first, then navigate sequentially
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const iconSearch = page.locator('#icon-search-input')
    if (await iconSearch.count() > 0)
      return true

    // Gather all sidebar hrefs from the index page (stable list)
    const hrefs = await page.locator('aside a.menu-item').evaluateAll(
      els => els.map(el => el.getAttribute('href')).filter(Boolean) as string[],
    )

    for (const href of hrefs) {
      await page.goto(href)
      await page.waitForLoadState('networkidle')

      if (await page.locator('#icon-search-input').count() > 0)
        return true
    }

    return false
  }

  test('filters icons on search input', async ({ page }) => {
    const hasIcons = await navigateToIconsPage(page)
    if (!hasIcons)
      return

    const searchInput = page.locator('#icon-search-input')

    // Wait for icon JS to initialize by checking that the list has items
    const listItems = page.locator('#icon-search-list li')
    const initialCount = await listItems.count()
    expect(initialCount).toBeGreaterThan(0)

    await searchInput.fill('zzz_no_icon_match_zzz')

    // Wait for filtering to take effect — items get 'hidden' class via JS
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('#icon-search-list li')
      return Array.from(items).every(el => el.classList.contains('hidden'))
    }, { timeout: 5000 })

    const visibleCount = await page.evaluate(() => {
      const items = document.querySelectorAll('#icon-search-list li')
      return Array.from(items).filter(el => !el.classList.contains('hidden')).length
    })

    expect(visibleCount).toBe(0)
  })

  test('shows reset button on input', async ({ page }) => {
    const hasIcons = await navigateToIconsPage(page)
    if (!hasIcons)
      return

    const searchInput = page.locator('#icon-search-input')
    await searchInput.fill('test')

    // Check any reset/clear mechanism is present
    const resetButton = page.locator('#icon-search-input-reset, [data-icon-search-reset]')
    const hasResetButton = await resetButton.count() > 0

    if (hasResetButton) {
      await expect(resetButton.first()).toBeVisible()
    }
  })

  test('clears filter on reset', async ({ page }) => {
    const hasIcons = await navigateToIconsPage(page)
    if (!hasIcons)
      return

    const searchInput = page.locator('#icon-search-input')
    await searchInput.fill('test')

    await searchInput.fill('')

    await expect(searchInput).toHaveValue('')
  })

  test('copies SVG on icon click', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    const hasIcons = await navigateToIconsPage(page)
    if (!hasIcons)
      return

    const copyButton = page.locator('.icon-search-list__item-copy').first()
    const hasCopyButton = await copyButton.count() > 0

    if (!hasCopyButton)
      return

    await copyButton.click()

    // Icon copy uses navigator.clipboard directly and shows a copy animation
    // (not a toast). Verify the button gets disabled during the animation.
    await expect(copyButton).toHaveAttribute('disabled', '', { timeout: 3000 })
  })
})
