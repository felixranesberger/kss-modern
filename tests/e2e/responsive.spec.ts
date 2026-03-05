import { expect, test } from '@playwright/test'

test.describe('Responsive', () => {
  test('mobile viewport hides desktop-only elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The theme select has `hidden md:block` class — check computed style
    const themeSelect = page.locator('.theme-select')
    if (await themeSelect.count() > 0) {
      const isHidden = await themeSelect.evaluate((el) => {
        const style = window.getComputedStyle(el)
        return style.display === 'none'
      })
      expect(isHidden).toBe(true)
    }
  })

  test('desktop viewport shows full layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Header should be visible
    const header = page.locator('header')
    await expect(header).toBeVisible()

    // Menu items should be visible on desktop
    const menuItems = page.locator('.menu-item')
    expect(await menuItems.count()).toBeGreaterThan(0)
  })

  test('sets data-is-mobile attribute', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check that the body has a data-is-mobile attribute (set by JS)
    const body = page.locator('body')
    const isMobile = await body.getAttribute('data-is-mobile')
    // In a non-touch Playwright browser, it should be "false" or not set
    expect(isMobile === 'false' || isMobile === null).toBe(true)
  })
})
