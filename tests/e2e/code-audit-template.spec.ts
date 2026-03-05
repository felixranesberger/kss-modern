import { expect, test } from '@playwright/test'

test.describe('Code Audit — <template> tag content', () => {
  test('audits content inside <template> tags without errors', async ({ page }) => {
    // Navigate to the modal component page (Styleguide 3.50)
    await page.goto('/preview-3.50.html')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    await expect(auditButton).toBeVisible()

    // Open the code details to make the audit button interactable
    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    // Listen for console errors before clicking
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await auditButton.click()

    // Wait for audit dialog to appear
    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 30000 })

    // Verify the audit results rendered without throwing
    const auditResults = dialog.locator('.audit-results')
    await expect(auditResults).toBeVisible()

    // There should be no "Element not found for selector" errors
    const selectorErrors = [
      ...consoleErrors.filter(e => e.includes('Element not found for selector')),
      ...pageErrors.filter(e => e.includes('Element not found for selector')),
    ]
    expect(selectorErrors).toHaveLength(0)
  })

  test('reports html-validate violations for buttons without type inside <template>', async ({ page }) => {
    await page.goto('/preview-3.50.html')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    await expect(auditButton).toBeVisible()

    // Open the code details first
    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    await auditButton.click()

    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 30000 })

    // The violations section should exist and contain results
    const violationsSection = dialog.locator('details:has(h3:has-text("Violations"))').first()
    await expect(violationsSection).toBeVisible()

    // Should have at least one violation (buttons without type attribute)
    const violationItems = violationsSection.locator('ol > li')
    await expect(violationItems.first()).toBeVisible()
  })

  test('affected node buttons in <template> violations are clickable', async ({ page }) => {
    await page.goto('/preview-3.50.html')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    await expect(auditButton).toBeVisible()

    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    await auditButton.click()

    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 30000 })

    // Open the violations section
    const violationsSection = dialog.locator('details:has(h3:has-text("Violations"))').first()
    await expect(violationsSection).toBeVisible()

    // Open the first violation detail
    const firstViolation = violationsSection.locator('ol > li details').first()
    await firstViolation.locator('summary').click()

    // Find an affected node button and click it — should not throw
    const nodeButton = firstViolation.locator('button').first()
    if (await nodeButton.count() > 0) {
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))

      await nodeButton.click()

      expect(pageErrors).toHaveLength(0)
    }
  })
})
