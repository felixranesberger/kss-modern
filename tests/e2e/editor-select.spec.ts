import { expect, test } from '@playwright/test'

test.describe('Editor Select', () => {
  test('shows editor select form', async ({ page }) => {
    await page.goto('/')

    const editorForm = page.locator('.editor-select')
    // Editor select is only visible if launchInEditor is configured
    const hasEditorSelect = await editorForm.count() > 0

    if (!hasEditorSelect)
      return

    await expect(editorForm).toBeVisible()
  })

  test('selects VSCode editor', async ({ page }) => {
    await page.goto('/')

    const editorForm = page.locator('.editor-select')
    if (await editorForm.count() === 0)
      return

    const vscodeRadio = page.locator('input[name="editor"][value="vscode"]')
    await vscodeRadio.check({ force: true })

    const body = page.locator('body')
    await expect(body).toHaveClass(/editor-vscode/)
  })

  test('selects PHPStorm editor', async ({ page }) => {
    await page.goto('/')

    const editorForm = page.locator('.editor-select')
    if (await editorForm.count() === 0)
      return

    const phpstormRadio = page.locator('input[name="editor"][value="phpstorm"]')
    await phpstormRadio.check({ force: true })

    const body = page.locator('body')
    await expect(body).toHaveClass(/editor-phpstorm/)
  })

  test('persists selection after reload', async ({ page }) => {
    await page.goto('/')

    const editorForm = page.locator('.editor-select')
    if (await editorForm.count() === 0)
      return

    const vscodeRadio = page.locator('input[name="editor"][value="vscode"]')
    await vscodeRadio.check({ force: true })

    // Verify localStorage was set
    const storedEditor = await page.evaluate(() => localStorage.getItem('in2editor'))
    expect(storedEditor).toBe('vscode')

    // Reload and check persistence
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('body')).toHaveClass(/editor-vscode/)
  })
})
