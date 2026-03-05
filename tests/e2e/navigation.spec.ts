import { expect, test } from '@playwright/test'

test.describe('Navigation', () => {
  test('navigates to section on sidebar click', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const initialUrl = page.url()

    // Click a sidebar link — sidebar JS may use hash scrolling or page navigation
    const menuLinks = page.locator('aside a.menu-item')
    const linkCount = await menuLinks.count()

    if (linkCount > 1) {
      const link = menuLinks.nth(1)
      await link.click({ force: true })
      await page.waitForTimeout(500)

      // URL should change (either hash or full page navigation)
      expect(page.url()).not.toBe(initialUrl)
    }
  })

  test('marks active section with active class', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Gather hrefs from the stable index sidebar
    const hrefs = await page.locator('aside a.menu-item').evaluateAll(
      els => els.map(el => el.getAttribute('href')).filter(Boolean) as string[],
    )

    const previewHref = hrefs.find(h => h.includes('preview-'))
    if (previewHref) {
      await page.goto(previewHref)
      await page.waitForLoadState('networkidle')

      // Active item is rendered as a div (not a link)
      const activeItem = page.locator('.menu-item--active')
      expect(await activeItem.count()).toBeGreaterThan(0)
    }
  })

  test('navigates with prev/next controls', async ({ page }) => {
    await page.goto('/')

    const nextLink = page.locator('#styleguide-next')
    const hasNext = await nextLink.count() > 0

    if (hasNext) {
      const nextHref = await nextLink.getAttribute('href')
      expect(nextHref).toBeTruthy()

      await nextLink.click()
      await page.waitForLoadState('domcontentloaded')
      expect(page.url()).toContain(nextHref!.replace(/^\//, ''))

      const prevLink = page.locator('#styleguide-previous')
      const hasPrev = await prevLink.count() > 0

      if (hasPrev) {
        await prevLink.click()
        await page.waitForLoadState('domcontentloaded')
      }
    }
  })

  test('navigates with arrow keys', async ({ page }) => {
    // Start on a preview page that has both prev and next links
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const nextLink = page.locator('#styleguide-next')
    const hasNext = await nextLink.count() > 0

    if (hasNext) {
      // Navigate to next page first so we have a previous link
      const nextHref = await nextLink.getAttribute('href')
      await page.goto(nextHref!)
      await page.waitForLoadState('networkidle')

      const currentUrl = page.url()

      // ArrowRight should navigate to the next section
      const hasNextOnNewPage = await page.locator('#styleguide-next').count() > 0
      if (hasNextOnNewPage) {
        await page.keyboard.press('ArrowRight')
        await page.waitForURL(url => url.href !== currentUrl, { timeout: 5000 })
        expect(page.url()).not.toBe(currentUrl)
      }
    }
  })
})
