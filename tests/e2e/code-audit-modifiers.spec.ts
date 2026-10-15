import { expect, test } from '@playwright/test'

/**
 * The single audit button runs the full audit on the base component AND on each modifier
 * variant. Findings from a modifier are tagged with the modifier class, and the ones the base
 * already has are left out. The alert (Styleguide 3.20) has `.c-alert--warning`,
 * `.c-alert--error` and a deliberately inaccessible `.c-alert--low-contrast` variant, which sets
 * its colors inline because the e2e harness serves no component CSS.
 */
test.describe('Code Audit — modifier variants', () => {
  test('audits modifier variants and tags only their own findings', async ({ page }) => {
    await page.goto('/preview-3.20.html')

    const auditButton = page.locator('[data-code-audit-iframe]').first()
    await expect(auditButton).toBeVisible()

    const codeDetails = page.locator('details:has([data-code-audit-iframe])').first()
    if (await codeDetails.count() > 0)
      await codeDetails.locator('summary').click()

    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await auditButton.click()

    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 30000 })

    const auditResults = dialog.locator('.audit-results')
    await expect(auditResults).toBeVisible()

    // the low-contrast variant fails color-contrast, tagged with its modifier and color scheme
    const lowContrast = auditResults.locator('summary:has-text("color-contrast"):has-text(".c-alert--low-contrast")')
    expect(await lowContrast.count()).toBeGreaterThan(0)
    const lowContrastWithMode = auditResults.locator(
      'summary:has-text(".c-alert--low-contrast"):has-text("dark mode"), summary:has-text(".c-alert--low-contrast"):has-text("light mode")',
    )
    expect(await lowContrastWithMode.count()).toBeGreaterThan(0)

    // warning and error render like the base without the stylesheet, so they add nothing
    expect(await auditResults.locator('summary:has-text(".c-alert--warning"), summary:has-text(".c-alert--error")').count()).toBe(0)

    expect(pageErrors).toHaveLength(0)
  })
})
