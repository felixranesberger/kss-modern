import { expect, test } from '@playwright/test'

test.describe('Styleguide Loading', () => {
  test('loads without critical errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Only fail on uncaught page errors (not console.error from library code)
    expect(errors).toEqual([])
  })

  test('displays title in header', async ({ page }) => {
    await page.goto('/')

    const header = page.locator('header')
    await expect(header).toBeVisible()

    const headerLink = header.locator('a').first()
    await expect(headerLink).toBeVisible()
    await expect(headerLink).toHaveAttribute('href', '/')
  })

  test('has sidebar navigation with sections', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Sidebar may be inside a nav or aside element
    const menuItems = page.locator('.menu-item')
    expect(await menuItems.count()).toBeGreaterThan(0)
  })

  test('renders main content area', async ({ page }) => {
    await page.goto('/')

    const sections = page.locator('.styleguide-section')
    expect(await sections.count()).toBeGreaterThan(0)
  })

  test('loads styleguide assets', async ({ page }) => {
    const assetUrls: string[] = []
    page.on('response', (response) => {
      const url = response.url()
      if (url.includes('styleguide-assets/') && response.status() < 400) {
        assetUrls.push(url)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // At least CSS and JS assets should have loaded
    expect(assetUrls.length).toBeGreaterThan(0)
  })
})
