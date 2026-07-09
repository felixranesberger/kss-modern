import { expect, test } from '@playwright/test'

test.describe('Code Audit — color-contrast per color scheme', () => {
  test('runs color-contrast in both light and dark mode', async ({ page }) => {
    await page.goto('/preview-3.50.html')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    await expect(auditButton).toBeVisible()

    // Open the code details to make the audit button interactable
    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0) {
      await codeDetails.locator('summary').click()
    }

    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await auditButton.click()

    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 30000 })

    const auditResults = dialog.locator('.audit-results')
    await expect(auditResults).toBeVisible()

    // color-contrast is enabled again and reported for the page's text
    await expect(auditResults).toContainText('color-contrast')

    // The styleguide supports dark mode (object theme, dark mode not deactivated),
    // so the rule is evaluated once per scheme and each result is labeled — and
    // the mode badge must sit on the color-contrast entry itself, not just appear
    // somewhere in the dialog.
    const colorContrastLight = auditResults.locator('summary:has-text("color-contrast"):has-text("light mode")')
    const colorContrastDark = auditResults.locator('summary:has-text("color-contrast"):has-text("dark mode")')
    expect(await colorContrastLight.count()).toBeGreaterThan(0)
    expect(await colorContrastDark.count()).toBeGreaterThan(0)

    // only color-contrast is per-scheme: every mode-badged entry must be one
    const allModeBadged = auditResults.locator('summary:has-text("light mode"), summary:has-text("dark mode")')
    const colorContrastModeBadged = auditResults.locator(
      'summary:has-text("color-contrast"):has-text("light mode"), summary:has-text("color-contrast"):has-text("dark mode")',
    )
    expect(await allModeBadged.count()).toBe(await colorContrastModeBadged.count())

    // forcing color-scheme / running axe multiple times must not throw
    expect(pageErrors).toHaveLength(0)
  })
})
