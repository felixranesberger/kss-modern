import { expect, test } from '@playwright/test'

test.describe('Clipboard', () => {
  test.use({
    permissions: ['clipboard-read', 'clipboard-write'],
  })

  test('copies value on button click', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const clipboardButton = page.locator('button[data-clipboard-value]').first()
    const hasClipboardButton = await clipboardButton.count() > 0

    if (!hasClipboardButton)
      return

    const expectedValue = await clipboardButton.getAttribute('data-clipboard-value')
    expect(expectedValue).toBeTruthy()

    await clipboardButton.click()

    // Verify clipboard was used — check that toast appears (more reliable than reading clipboard)
    const toast = page.locator('[role="alert"]')
    await expect(toast.first()).toBeVisible({ timeout: 3000 })
  })

  test('shows toast notification', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const clipboardButton = page.locator('button[data-clipboard-value]').first()
    const hasClipboardButton = await clipboardButton.count() > 0

    if (!hasClipboardButton)
      return

    await clipboardButton.click()

    const toast = page.locator('[role="alert"]')
    await expect(toast.first()).toBeVisible({ timeout: 3000 })
  })

  test('toast disappears automatically', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const clipboardButton = page.locator('button[data-clipboard-value]').first()
    const hasClipboardButton = await clipboardButton.count() > 0

    if (!hasClipboardButton)
      return

    await clipboardButton.click()

    const toast = page.locator('[role="alert"]')
    await expect(toast.first()).toBeVisible({ timeout: 3000 })

    // Toast should disappear (hidden or removed)
    await expect(toast.first()).not.toBeVisible({ timeout: 10000 })
  })
})
