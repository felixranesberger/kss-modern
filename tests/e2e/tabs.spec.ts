import { expect, test } from '@playwright/test'

test.describe('Tabs', () => {
  test('switches tab panel on click', async ({ page }) => {
    await page.goto('/')

    const tabsContainer = page.locator('.tabs').first()
    const hasTabs = await tabsContainer.count() > 0
    if (!hasTabs)
      return

    const tabTriggers = tabsContainer.locator('[role="tab"]')
    const tabPanels = tabsContainer.locator('[role="tabpanel"]')
    const triggerCount = await tabTriggers.count()

    if (triggerCount < 2)
      return

    // First panel should be visible, second hidden
    await expect(tabPanels.nth(0)).toBeVisible()
    await expect(tabPanels.nth(1)).toBeHidden()

    // Click second tab
    await tabTriggers.nth(1).click()

    // Second panel visible, first hidden
    await expect(tabPanels.nth(1)).toBeVisible()
    await expect(tabPanels.nth(0)).toBeHidden()
  })

  test('sets aria-selected on active tab', async ({ page }) => {
    await page.goto('/')

    const tabsContainer = page.locator('.tabs').first()
    const hasTabs = await tabsContainer.count() > 0
    if (!hasTabs)
      return

    const tabTriggers = tabsContainer.locator('[role="tab"]')
    const triggerCount = await tabTriggers.count()

    if (triggerCount < 2)
      return

    // First tab should be selected by default
    await expect(tabTriggers.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(tabTriggers.nth(1)).toHaveAttribute('aria-selected', 'false')

    // Click second tab
    await tabTriggers.nth(1).click()

    await expect(tabTriggers.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(tabTriggers.nth(0)).toHaveAttribute('aria-selected', 'false')
  })

  test('shows iframe in preview tab', async ({ page }) => {
    await page.goto('/')

    const previewIframe = page.locator('.preview-iframe').first()
    const hasPreviewIframe = await previewIframe.count() > 0

    if (!hasPreviewIframe)
      return

    await expect(previewIframe).toHaveAttribute('src', /.+/)
    await expect(previewIframe).toHaveAttribute('data-preview', 'true')
  })

  test('shows highlighted code in code tab', async ({ page }) => {
    await page.goto('/')

    // Code is inside a <details> element
    const codeDetails = page.locator('details:has(.code-highlight)').first()
    const hasCode = await codeDetails.count() > 0

    if (!hasCode)
      return

    // Open the details element
    await codeDetails.locator('summary').click()

    const codeHighlight = codeDetails.locator('.code-highlight')
    await expect(codeHighlight).toBeVisible()
    await expect(codeHighlight).toHaveAttribute('data-source-code', /.+/)
  })
})
