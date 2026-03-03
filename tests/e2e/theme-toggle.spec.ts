import { expect, test } from '@playwright/test'

test.describe('Theme Toggle', () => {
  test('has theme toggle controls', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Theme radio inputs should exist
    const themeInputs = page.locator('input[name="theme"]')
    expect(await themeInputs.count()).toBe(3) // normal, light, dark
  })

  test('switches to light theme', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('label[for="light"]').click()

    await expect(page.locator('body')).toHaveClass(/theme-light/)
  })

  test('switches to dark theme', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('label[for="dark"]').click()

    await expect(page.locator('body')).toHaveClass(/theme-dark/)
  })

  test('persists theme after reload', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('label[for="dark"]').click()
    await expect(page.locator('body')).toHaveClass(/theme-dark/)

    const storedTheme = await page.evaluate(() => localStorage.getItem('in2theme'))
    expect(storedTheme).toBe('dark')

    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toHaveClass(/theme-dark/)
  })

  test('applies theme to iframes', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('label[for="dark"]').click()
    await expect(page.locator('body')).toHaveClass(/theme-dark/)

    const iframes = page.locator('iframe')
    const iframeCount = await iframes.count()

    if (iframeCount > 0) {
      const frame = iframes.first()
      const frameElement = await frame.contentFrame()
      if (frameElement) {
        await expect(frameElement.locator('body')).toHaveClass(/theme-dark/, { timeout: 5000 })
      }
    }
  })

  test('returns to system theme', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('label[for="dark"]').click()
    await expect(page.locator('body')).toHaveClass(/theme-dark/)

    await page.locator('label[for="normal"]').click()

    await expect(page.locator('body')).not.toHaveClass(/theme-dark/)
  })
})
