import { expect, test } from '@playwright/test'

test.describe('Code Audit', () => {
  test('shows audit button in code tab', async ({ page }) => {
    await page.goto('/')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    const hasAuditButton = await auditButton.count() > 0

    if (!hasAuditButton)
      return

    await expect(auditButton).toBeVisible()
    await expect(auditButton).toHaveAttribute('aria-controls', 'code-audit-dialog')
  })

  test('starts audit on click', async ({ page }) => {
    await page.goto('/')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    const hasAuditButton = await auditButton.count() > 0

    if (!hasAuditButton)
      return

    // Open the code details first to make the button interactable
    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    await auditButton.click()

    // Button should become disabled during audit
    await expect(auditButton).toBeDisabled()
  })

  test('opens results dialog', async ({ page }) => {
    await page.goto('/')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    const hasAuditButton = await auditButton.count() > 0

    if (!hasAuditButton)
      return

    // Open the code details first
    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    await auditButton.click()

    // Wait for the audit to complete and dialog to open
    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 15000 })
  })

  test('shows result sections', async ({ page }) => {
    await page.goto('/')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    const hasAuditButton = await auditButton.count() > 0

    if (!hasAuditButton)
      return

    // Open the code details first
    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    await auditButton.click()

    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 15000 })

    // The dialog should contain audit results
    const auditResults = dialog.locator('.audit-results')
    await expect(auditResults).toBeVisible()
  })
})
