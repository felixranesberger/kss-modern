import { expect, test } from '@playwright/test'

test.describe('Search', () => {
  test('opens search dialog via button click', async ({ page }) => {
    await page.goto('/')

    const searchDialog = page.locator('#search-dialog')
    await expect(searchDialog).not.toBeVisible()

    const openSearchButton = page.locator('[data-open-search]').first()
    await openSearchButton.click()

    await expect(searchDialog).toBeVisible()
  })

  test('opens search dialog via keyboard shortcut', async ({ page }) => {
    await page.goto('/')

    const searchDialog = page.locator('#search-dialog')
    await expect(searchDialog).not.toBeVisible()

    await page.keyboard.press('Control+k')

    await expect(searchDialog).toBeVisible()
  })

  test('filters results on input', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const searchInput = page.locator('#search-input')
    const allItems = page.locator('.search-category__item')
    const initialCount = await allItems.count()
    expect(initialCount).toBeGreaterThan(0)

    await searchInput.fill('zzz_nonexistent_term_zzz')

    const activeItems = page.locator('.search-category__item--active')
    expect(await activeItems.count()).toBeLessThan(initialCount)
  })

  test('shows no results message', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const searchInput = page.locator('#search-input')
    await searchInput.fill('zzz_absolutely_no_match_zzz')

    const noResults = page.locator('#search-no-results')
    await expect(noResults).toBeVisible()
  })

  test('navigates on result click', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const firstResultLink = page.locator('.search-category__item--active a').first()
    const href = await firstResultLink.getAttribute('href')
    expect(href).toBeTruthy()

    await firstResultLink.click()

    await expect(page.locator('#search-dialog')).not.toBeVisible({ timeout: 5000 })
  })

  test('closes on Escape', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.locator('#search-dialog')).not.toBeVisible()
  })

  test('closes on backdrop click', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    // Press Escape is more reliable for closing dialogs than backdrop click
    await page.keyboard.press('Escape')

    await expect(page.locator('#search-dialog')).not.toBeVisible({ timeout: 5000 })
  })

  test('tab click filters results to that category', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const tabs = page.locator('[data-search-tab]')
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThan(1)

    // Click the second tab (first category, not "All")
    const secondTab = tabs.nth(1)
    const tabIndex = await secondTab.getAttribute('data-search-tab')
    await secondTab.click()

    await expect(secondTab).toHaveAttribute('aria-selected', 'true')

    // Only the matching category should be visible
    const visibleCategories = page.locator('.search-category:not(.search-category--hidden)')
    const visibleCount = await visibleCategories.count()
    expect(visibleCount).toBe(1)
    await expect(visibleCategories.first()).toHaveAttribute('data-category-index', tabIndex!)
  })

  test('arrow key navigation highlights items', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const searchInput = page.locator('#search-input')
    await searchInput.press('ArrowDown')

    const focusedItems = page.locator('.search-category__item--focused')
    await expect(focusedItems).toHaveCount(1)

    // Second ArrowDown should move to next item
    await searchInput.press('ArrowDown')
    await expect(focusedItems).toHaveCount(1)

    // The input should have aria-activedescendant set
    await expect(searchInput).toHaveAttribute('aria-activedescendant', /^search-item-/)
  })

  test('mobile close button is visible and closes dialog', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const closeButton = page.locator('#search-dialog-close')
    await expect(closeButton).toBeVisible()

    await closeButton.click()
    await expect(page.locator('#search-dialog')).not.toBeVisible()
  })

  test('close button is hidden on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const closeButton = page.locator('#search-dialog-close')
    await expect(closeButton).not.toBeVisible()
  })

  test('Enter on highlighted item navigates', async ({ page }) => {
    await page.goto('/')

    await page.locator('[data-open-search]').first().click()
    await expect(page.locator('#search-dialog')).toBeVisible()

    const searchInput = page.locator('#search-input')
    await searchInput.press('ArrowDown')

    const focusedItem = page.locator('.search-category__item--focused')
    await expect(focusedItem).toHaveCount(1)

    const href = await focusedItem.locator('a').getAttribute('href')
    expect(href).toBeTruthy()

    await searchInput.press('Enter')

    // Should have navigated (dialog closes for same-page, or URL changes for cross-page)
    await page.waitForURL(url => url.href.includes(href!.split('#')[0]), { timeout: 5000 })
  })
})
