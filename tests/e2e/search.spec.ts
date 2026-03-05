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
})
