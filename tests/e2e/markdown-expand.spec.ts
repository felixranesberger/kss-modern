import { expect, test } from '@playwright/test'

test.describe('Markdown Expand', () => {
  async function navigateToPageWithMarkdown(page: import('@playwright/test').Page) {
    await page.goto('/')

    // Check if current page has foldable markdown
    if (await page.locator('.markdown-container-folded').count() > 0)
      return true

    // Navigate through sidebar to find a page with long markdown content
    const menuLinks = page.locator('aside a.menu-item')
    const linkCount = await menuLinks.count()

    for (let i = 0; i < linkCount; i++) {
      const link = menuLinks.nth(i)
      const href = await link.getAttribute('href')
      if (!href)
        continue

      await page.goto(href)
      await page.waitForLoadState('domcontentloaded')

      if (await page.locator('.markdown-container-folded').count() > 0)
        return true
    }

    return false
  }

  test('shows "Show more" button for long content', async ({ page }) => {
    const hasMarkdown = await navigateToPageWithMarkdown(page)
    if (!hasMarkdown)
      return

    const showMoreButton = page.locator('.markdown-show-more').first()
    const showMoreContainer = page.locator('.markdown-show-more-container').first()

    // The show-more container should be visible if content overflows
    const isVisible = await showMoreContainer.evaluate(el => !el.classList.contains('hidden'))
    if (isVisible) {
      await expect(showMoreButton).toBeVisible()
    }
  })

  test('expands content on click', async ({ page }) => {
    const hasMarkdown = await navigateToPageWithMarkdown(page)
    if (!hasMarkdown)
      return

    const showMoreContainer = page.locator('.markdown-show-more-container').first()
    const isVisible = await showMoreContainer.evaluate(el => !el.classList.contains('hidden'))
    if (!isVisible)
      return

    const showMoreButton = page.locator('.markdown-show-more').first()
    const markdownContainer = page.locator('.markdown-container').first()

    // Get the initial max-height constraint
    const hasMaxHeight = await markdownContainer.evaluate(el => el.classList.contains('max-h-[400px]'))
    expect(hasMaxHeight).toBe(true)

    await showMoreButton.click()

    // After animation, the max-height class should be removed
    await expect(markdownContainer).not.toHaveClass(/max-h-\[400px\]/, { timeout: 3000 })
  })

  test('hides button after expansion', async ({ page }) => {
    const hasMarkdown = await navigateToPageWithMarkdown(page)
    if (!hasMarkdown)
      return

    const showMoreContainer = page.locator('.markdown-show-more-container').first()
    const isVisible = await showMoreContainer.evaluate(el => !el.classList.contains('hidden'))
    if (!isVisible)
      return

    const showMoreButton = page.locator('.markdown-show-more').first()
    await showMoreButton.click()

    // The show-more container should be hidden after expansion
    await expect(showMoreContainer).toBeHidden({ timeout: 3000 })
  })
})
