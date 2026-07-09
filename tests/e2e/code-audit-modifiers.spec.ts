import { expect, test } from '@playwright/test'

/**
 * The single audit button scans the base component AND each modifier variant for
 * color-contrast (modifiers are pure class swaps, so only colors can differ).
 * Findings from a modifier are tagged with the modifier class.
 * The alert (Styleguide 3.20) has `.c-alert--warning`, `.c-alert--error` and a
 * deliberately inaccessible `.c-alert--low-contrast` variant.
 */
test.describe('Code Audit — modifier variants', () => {
  test('scans modifier variants and tags their color-contrast findings', async ({ page }) => {
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
    await expect(auditResults).toContainText('color-contrast')

    // each modifier variant's color-contrast result is present and tagged with
    // its modifier class
    const warning = auditResults.locator('summary:has-text("color-contrast"):has-text(".c-alert--warning")')
    const error = auditResults.locator('summary:has-text("color-contrast"):has-text(".c-alert--error")')
    expect(await warning.count()).toBeGreaterThan(0)
    expect(await error.count()).toBeGreaterThan(0)

    // modifier findings still carry the per-scheme mode badge (dark mode enabled)
    const modifierWithMode = auditResults.locator(
      'summary:has-text(".c-alert--error"):has-text("dark mode"), summary:has-text(".c-alert--error"):has-text("light mode")',
    )
    expect(await modifierWithMode.count()).toBeGreaterThan(0)

    // a modifier badge must only ever appear on a color-contrast entry
    const modifierBadged = auditResults.locator('summary:has-text(".c-alert--")')
    const modifierBadgedContrast = auditResults.locator('summary:has-text("color-contrast"):has-text(".c-alert--")')
    expect(await modifierBadged.count()).toBe(await modifierBadgedContrast.count())

    // the deliberately inaccessible modifier is scanned and tagged too. (The e2e
    // harness serves no component CSS — assets.css is empty in serve.ts — so the
    // alert is unstyled here and this lands in passes; with the real stylesheet
    // loaded its ~1.8:1 grey-on-near-white fails. The contrast → violation path is
    // covered by color-contrast-schemes.spec.ts.)
    const lowContrast = auditResults.locator('summary:has-text("color-contrast"):has-text(".c-alert--low-contrast")')
    expect(await lowContrast.count()).toBeGreaterThan(0)

    expect(pageErrors).toHaveLength(0)
  })
})
