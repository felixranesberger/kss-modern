import type { A11yReport, A11yReportOptions } from '../../client/lib/a11y-report.ts'
import { expect, test } from '@playwright/test'

// `window.kssAudit` is declared globally by client/preview.ts, which the single
// project-wide tsconfig already pulls in — no local redeclaration needed.

// The audit API exists for automation that drives a real browser, so the parts
// that matter — axe actually running inside every preview iframe, and the
// report surviving the serialization boundary of `page.evaluate` — can only be
// verified here. The merging logic is covered in tests/unit/client.

const AUDIT_TIMEOUT = 120_000

// No readiness polling here on purpose: the API is installed before
// DOMContentLoaded, so every test exercises that contract rather than papering
// over a regression in it.
async function runAudit(page: import('@playwright/test').Page, options: A11yReportOptions = {}): Promise<A11yReport> {
  return page.evaluate(auditOptions => window.kssAudit(auditOptions), options)
}

test.describe('window.kssAudit', () => {
  test.describe.configure({ timeout: AUDIT_TIMEOUT })

  // The preview bundle is a deferred module script, so the API is installed
  // before DOMContentLoaded — automation may call it straight after navigating,
  // without polling for readiness first. Keep it that way.
  test('is callable right after navigation, without waiting for readiness', async ({ page }) => {
    await page.goto('/preview-3.10.html', { waitUntil: 'domcontentloaded' })

    const report = await page.evaluate(() => window.kssAudit({ modifiers: false }))
    expect(report.sections.length).toBeGreaterThan(0)
    expect(report.sections[0].status).toBe('audited')
  })

  test('reports every preview on the page with its source file', async ({ page }) => {
    await page.goto('/preview-3.10.html')

    const report = await runAudit(page)

    expect(report.sections.length).toBeGreaterThan(0)
    expect(report.totals.failed).toBe(0)

    const section = report.sections[0]
    expect(section.status).toBe('audited')
    expect(section.reference).toBe('3.10')
    expect(section.url).toContain('fullpage-3.10.html')
    expect(section.sourceFile).toMatch(/\.(?:css|scss)$/)
    expect(section.sourceLine).toBeGreaterThan(0)

    // axe ran for real: it always evaluates far more rules than it fails
    expect(section.counts.passes + section.counts.inapplicable).toBeGreaterThan(0)
  })

  test('audits modifier previews for color-contrast and tags them', async ({ page }) => {
    await page.goto('/preview-3.10.html')

    const report = await runAudit(page, { include: 'all' })

    const modifierFindings = report.sections
      .flatMap(section => section.findings)
      .filter(finding => finding.modifier)

    expect(modifierFindings.length).toBeGreaterThan(0)
    modifierFindings.forEach((finding) => {
      expect(finding.id).toBe('color-contrast')
      expect(finding.mode).toBeDefined()
    })

    // no modifier preview was skipped
    report.sections.forEach(section => expect(section.warnings).toBeUndefined())
  })

  test('runs across all sections of a page and can be limited to some', async ({ page }) => {
    await page.goto('/preview-3.95.html')

    const full = await runAudit(page, { modifiers: false })
    expect(full.sections.length).toBeGreaterThan(1)

    const wanted = full.sections[1].reference
    const limited = await runAudit(page, { sections: [wanted, '99.99'], modifiers: false })

    expect(limited.sections.map(section => section.reference)).toEqual([wanted])
    expect(limited.unmatchedSections).toEqual(['99.99'])
  })

  test('returns a report that survives serialization to the automation client', async ({ page }) => {
    await page.goto('/preview-3.10.html')

    // page.evaluate structured-clones its result: a Map or DOM node in the
    // report would arrive as `{}` here (or throw), never as usable data
    const report = await runAudit(page, { include: 'all' })

    expect(JSON.parse(JSON.stringify(report))).toEqual(report)

    const findings = report.sections.flatMap(section => section.findings)
    expect(findings.length).toBeGreaterThan(0)
    findings.forEach((finding) => {
      expect(typeof finding.id).toBe('string')
      expect(['axe', 'html-validate']).toContain(finding.source)
      finding.nodes.forEach((node) => {
        expect(node.target === undefined || typeof node.target === 'string').toBe(true)
      })
    })
  })

  test('finds the same violations the audit dialog shows', async ({ page }) => {
    // 3.50 is the modal component: its <template> markup reliably produces
    // html-validate violations, so both paths have something to compare
    await page.goto('/preview-3.50.html')

    const report = await runAudit(page, { modifiers: false })
    const reportedRules = new Set(
      report.sections
        .flatMap(section => section.findings)
        .filter(finding => finding.group === 'violations')
        .map(finding => finding.id),
    )

    await page.locator('[data-code-audit-iframe]').first().click()

    const dialog = page.locator('#code-audit-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    const dialogRules = await dialog
      .locator('details:has(h3:has-text("Violations"))')
      .first()
      .locator('ol > li > details > summary .font-semibold')
      .allInnerTexts()

    expect(dialogRules.length).toBeGreaterThan(0)
    dialogRules.forEach(rule => expect([...reportedRules]).toContain(rule.trim()))
  })
})
