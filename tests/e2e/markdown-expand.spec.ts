import { expect, test } from '@playwright/test'

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

test.describe('Markdown Expand', () => {

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

test.describe('Markdown Expand - Details Toggle', () => {
  test('recalculates overflow when details element is toggled', async ({ page }) => {
    const hasMarkdown = await navigateToPageWithMarkdown(page)
    if (!hasMarkdown)
      return

    // Find a folded markdown container that has a <details> element inside
    const foldedContainers = page.locator('.markdown-container-folded')
    const count = await foldedContainers.count()

    let targetContainer: ReturnType<typeof foldedContainers.nth> | null = null
    for (let i = 0; i < count; i++) {
      const container = foldedContainers.nth(i)
      if (await container.locator('.markdown-container details').count() > 0) {
        targetContainer = container
        break
      }
    }

    if (!targetContainer)
      return

    const markdownContainer = targetContainer.locator('.markdown-container')
    const showMoreContainer = targetContainer.locator('.markdown-show-more-container')
    const details = targetContainer.locator('.markdown-container details').first()

    // Record initial state
    const initiallyVisible = await showMoreContainer.evaluate(el => !el.classList.contains('hidden'))

    // Open the details element
    await details.locator('summary').click()
    await expect(details).toHaveAttribute('open', '')

    // After toggling, handleOverflow should have re-evaluated —
    // the show-more button visibility should reflect the new content height
    const isOverflowingAfterOpen = await markdownContainer.evaluate(
      el => el.scrollHeight > el.clientHeight,
    )

    if (isOverflowingAfterOpen) {
      await expect(showMoreContainer).not.toHaveClass(/\bhidden\b/)
    }

    // Close the details element again
    await details.locator('summary').click()
    await expect(details).not.toHaveAttribute('open', '')

    // Overflow state should return to initial
    if (!initiallyVisible) {
      const stillOverflowing = await markdownContainer.evaluate(
        el => el.scrollHeight > el.clientHeight,
      )
      if (!stillOverflowing) {
        await expect(showMoreContainer).toHaveClass(/\bhidden\b/)
      }
    }
  })
})
