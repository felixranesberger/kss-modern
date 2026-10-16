import { expect, test } from '@playwright/test'

/**
 * The standalone mixin page. Its project CSS (`tests/fixtures/mixin-e2e/project.css`) resets every
 * element, sets a 5px root font size, red buttons and hides form controls; none of it may reach the
 * controls panel, while the component itself gets all of it.
 */
const PAGE = '/mixin-e2e/mixins-button-standalone.html'

function withProps(props: unknown, extra = ''): string {
  return `${PAGE}?props=${encodeURIComponent(JSON.stringify(props))}${extra}`
}

test.describe('Standalone mixin page', () => {
  test('renders without any styleguide UI', async ({ page }) => {
    await page.goto(PAGE)
    await expect(page.locator('[data-kss-mixin-root] button')).toHaveText('Save')
    await expect(page.locator('header, aside, #search-dialog')).toHaveCount(0)
    await expect(page.locator('link[href*="styleguide-assets/style"]')).toHaveCount(0)
  })

  test('keeps aggressive project CSS out of the controls panel', async ({ page }) => {
    await page.goto(PAGE)
    await expect(page.locator('[data-kss-mixin-root] button')).toHaveText('Save')

    const styles = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('[data-kss-playground-panel]')!
      const shadow = host.shadowRoot!
      const panel = shadow.querySelector('.c-panel')!
      const reset = [...shadow.querySelectorAll('button')].find(button => button.textContent === 'Reset')!
      const input = shadow.querySelector('input')!
      const component = document.querySelector('[data-kss-mixin-root] button')!
      return {
        hostPosition: getComputedStyle(host).position,
        panelFontSize: getComputedStyle(panel).fontSize,
        panelFontFamily: getComputedStyle(panel).fontFamily,
        resetBackground: getComputedStyle(reset).backgroundColor,
        inputDisplay: getComputedStyle(input).display,
        componentBackground: getComputedStyle(component).backgroundColor,
      }
    })

    expect(styles.hostPosition).toBe('fixed')
    expect(styles.panelFontSize).toBe('13px')
    expect(styles.panelFontFamily).not.toBe('serif')
    expect(styles.resetBackground).not.toBe('rgb(255, 0, 0)')
    expect(styles.inputDisplay).toBe('block')
    // the project's CSS does reach the component
    expect(styles.componentBackground).toBe('rgb(255, 0, 0)')
  })

  test('controls=0 renders the component markup only', async ({ page }) => {
    await page.goto(`${PAGE}?controls=0`)
    const root = page.locator('[data-kss-mixin-root]')
    await expect(root.locator('button')).toHaveText('Save')

    expect(await root.innerHTML()).toBe('<!-- START BUTTON--><button class="btn btn--primary" type="button" data-count="0">Save</button><!-- END BUTTON-->')
    await expect(page.locator('[data-kss-playground-panel]')).toHaveCount(0)
    const visibleBodyChildren = await page.evaluate(() =>
      [...document.body.children].filter(element => !['SCRIPT', 'TEMPLATE'].includes(element.tagName)).length,
    )
    expect(visibleBodyChildren).toBe(1)
  })

  test('controls=0 shows a minimal error for invalid props', async ({ page }) => {
    await page.goto(withProps({ label: '', variant: 'nope' }, '&controls=0'))
    const error = page.locator('[data-kss-playground-error]')
    await expect(error).toBeVisible()
    await expect(error).toContainText('variant')
  })

  test('restores the props from ?props= and keeps the hash in sync', async ({ page }) => {
    await page.goto(withProps({ label: 'Hello', variant: 'danger', icon: 'plus' }))
    const component = page.locator('[data-kss-mixin-root] button')
    await expect(component).toHaveText('Hello')
    await expect(component).toHaveClass(/btn--danger/)
    await expect(component.locator('svg[data-name="plus"]')).toHaveCount(1)
    await expect(page.getByRole('combobox', { name: 'variant' })).toHaveValue('"danger"')

    await page.getByRole('textbox', { name: 'label' }).fill('Edited')
    await expect(component).toHaveText('Edited')
    const hash = new URLSearchParams(new URL(page.url()).hash.slice(1))
    expect(JSON.parse(hash.get('props')!)).toMatchObject({ label: 'Edited', variant: 'danger' })
  })

  test('does not render props from a link that carry markup', async ({ page }) => {
    await page.goto(withProps({ label: '<img src=x onerror="document.title=1">' }, '&controls=0'))
    await expect(page.locator('[data-kss-playground-error]')).toContainText('not applied')
    await expect(page.locator('[data-kss-mixin-root] img')).toHaveCount(0)
  })

  test('shows invalid ?props= in the panel', async ({ page }) => {
    await page.goto(withProps({ label: 'Hi', count: 42 }))
    const error = page.locator('[data-field="count"] .c-field__error')
    await expect(error).toBeVisible()
    await expect(error).toContainText(/9/)
  })

  test('starts the project JS after the component and tells it about re-renders', async ({ page }) => {
    await page.goto(PAGE)
    await expect(page.locator('html')).toHaveAttribute('data-project-ready', 'true')

    await page.getByRole('textbox', { name: 'label' }).fill('Again')
    await expect(page.locator('html')).toHaveAttribute('data-renders', /\d+/)
  })

  test('toggles the panel with the keyboard shortcut and remembers it', async ({ page }) => {
    await page.goto(PAGE)
    const panel = page.locator('[data-kss-playground-panel] .c-panel')
    await expect(panel).toBeVisible()

    await page.keyboard.press('Alt+Shift+KeyP')
    await expect(panel).toBeHidden()
    await expect(page.getByRole('button', { name: /show the controls/i })).toBeVisible()

    await page.reload()
    await expect(page.locator('[data-kss-mixin-root] button')).toHaveText('Save')
    await expect(panel).toBeHidden()
  })

  test('renders a mixin declared with defineComponent', async ({ page }) => {
    await page.goto(`/mixin-e2e/mixins-moleculenotice-standalone.html?controls=0&props=${encodeURIComponent(JSON.stringify({ text: 'Hello', tone: 'warning' }))}`)
    const root = page.locator('[data-kss-mixin-root]')
    await expect(root.locator('.notice')).toHaveText('Hello')
    expect(await root.innerHTML()).toBe('<!-- START NOTICE--><p class="notice notice--warning">Hello</p><!-- END NOTICE-->')
  })
})
