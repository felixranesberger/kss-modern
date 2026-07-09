import { expect, test } from '@playwright/test'

/**
 * Verifies that the styleguide theme actually reaches the preview iframe's own
 * document, so light-dark() inside a preview resolves to the selected theme.
 * Regression guard for the bug where the theme was only applied as a class on the
 * <iframe> element (which does not cascade into the embedded document), leaving
 * previews stuck on their light appearance.
 */

// Injects a probe element using light-dark() into the first preview iframe and
// returns its resolved color. Red = light value, blue = dark value.
async function previewLightDarkColor(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-preview="true"]')
      ?? document.querySelector<HTMLIFrameElement>('iframe')
    const doc = iframe?.contentDocument
    if (!doc?.body)
      return null
    const probe = doc.createElement('div')
    probe.style.color = 'light-dark(rgb(255, 0, 0), rgb(0, 0, 255))'
    doc.body.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
}

test.describe('theme propagation into preview iframes', () => {
  test('dark theme resolves light-dark() to its dark value in the preview', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('in2theme', 'dark'))
    await page.goto('/preview-3.50.html', { waitUntil: 'networkidle' })
    await expect.poll(() => previewLightDarkColor(page), { timeout: 15000 }).toBe('rgb(0, 0, 255)')
  })

  test('light theme resolves light-dark() to its light value in the preview', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('in2theme', 'light'))
    await page.goto('/preview-3.50.html', { waitUntil: 'networkidle' })
    await expect.poll(() => previewLightDarkColor(page), { timeout: 15000 }).toBe('rgb(255, 0, 0)')
  })

  test('switching the theme to dark updates an already-loaded preview', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('in2theme', 'light'))
    await page.goto('/preview-3.50.html', { waitUntil: 'networkidle' })
    await expect.poll(() => previewLightDarkColor(page), { timeout: 15000 }).toBe('rgb(255, 0, 0)')

    // select the dark radio in the theme switcher
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="theme"][value="dark"]')
      if (!input)
        throw new Error('dark theme radio not found')
      input.checked = true
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await expect.poll(() => previewLightDarkColor(page), { timeout: 15000 }).toBe('rgb(0, 0, 255)')
  })
})
