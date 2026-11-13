import { expect, test } from '@playwright/test'

/**
 * The mixin explorer (`mixins.html`). Built by `tests/e2e/serve.ts` from
 * `tests/fixtures/mixin-e2e/` into `/mixin-e2e/`.
 */
const EXPLORER = '/mixin-e2e/mixins.html'

test.describe('Mixin explorer', () => {
  test('lists only mixins with a schema and selects the first playground', async ({ page }) => {
    await page.goto(EXPLORER)

    // icon and legacy declare no schema, so they are not public
    const list = page.getByRole('navigation', { name: 'Mixins' })
    await expect(list.locator('[data-explorer-item]')).toHaveText([/Button/, /Tag/, /Notice/, /Card/, /Teaser/])
    await expect(list.locator('[data-explorer-item="button"]')).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('[data-explorer-name]')).toHaveText('Button')
    await expect(page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')).toHaveText('Save')
  })

  test('nests mixins in folders by their mixinName', async ({ page }) => {
    await page.goto(EXPLORER)
    const list = page.getByRole('navigation', { name: 'Mixins' })

    await expect(list.locator('[data-explorer-folder] > details > summary')).toHaveText([/atoms/, /molecules/, /labels/, /organisms/])
    const labels = list.locator('[data-explorer-folder]', { hasText: 'labels' }).last()
    await expect(labels.locator('[data-explorer-item]')).toHaveText([/Tag/])
    await expect(page.locator('[data-explorer-path]')).toHaveText('atoms')

    await list.locator('[data-explorer-item="tag"]').click()
    await expect(page.locator('[data-explorer-path]')).toHaveText('molecules / labels')

    // a collapsed folder hides its mixins
    await list.locator('summary', { hasText: 'atoms' }).click()
    await expect(list.locator('[data-explorer-item="button"]')).toBeHidden()
  })

  test('lists the public mixins a section uses and links them to the explorer', async ({ page }) => {
    await page.goto('/mixin-e2e/index.html')
    const usage = page.locator('[data-mixin-usage]').first()
    await expect(usage.locator('a').first()).toBeHidden()

    await usage.locator('summary').click()
    // the card's buttons come from an internal helper; they show up directly under the card
    await expect(usage.locator('a')).toHaveText([/atoms \/ Button/, /organisms \/ Card/, /molecules \/ labels \/ Tag/, /atoms \/ Button[\s\S]*×2/])

    await usage.getByRole('link', { name: /organisms \/ Card/ }).click()
    await expect(page).toHaveURL(/mixins\.html#mixin=card$/)
    await expect(page.locator('[data-explorer-name]')).toHaveText('Card')
  })

  test('is linked from the sidebar of every page', async ({ page }) => {
    await page.goto('/mixin-e2e/index.html')
    await expect(page.locator('aside nav a[href="mixins.html"]')).toHaveCount(1)
  })

  test('filters the list', async ({ page }) => {
    await page.goto(EXPLORER)
    await page.getByLabel('Filter mixins').fill('ta')

    await expect(page.locator('[data-explorer-item="tag"]')).toBeVisible()
    await expect(page.locator('[data-explorer-item="button"]')).toBeHidden()

    await page.getByLabel('Filter mixins').fill('nothing-like-this')
    await expect(page.locator('[data-explorer-no-match]')).toBeVisible()
  })

  test('re-renders the preview when a select and a text input change', async ({ page }) => {
    await page.goto(EXPLORER)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')
    await expect(preview).toHaveText('Save')

    await page.getByRole('textbox', { name: 'label' }).fill('Publish')
    await page.getByRole('combobox', { name: 'variant' }).selectOption({ label: 'ghost' })

    await expect(preview).toHaveText('Publish')
    await expect(preview).toHaveClass(/btn--ghost/)

    await page.getByRole('tab', { name: 'Pug call' }).click()
    await expect(page.locator('[data-playground-pug-call]')).toHaveText('+button({ label: \'Publish\', variant: \'ghost\' })')
  })

  test('shows validation issues next to the control and keeps the last render', async ({ page }) => {
    await page.goto(EXPLORER)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')
    await expect(preview).toHaveText('Save')

    const label = page.getByRole('textbox', { name: 'label' })
    await label.fill('')

    const error = page.locator('[data-field="label"] .c-field__error')
    await expect(error).toBeVisible()
    await expect(error).toHaveText('Must not be empty')
    await expect(label).toHaveAttribute('aria-invalid', 'true')
    await expect(preview).toHaveText('Save')

    await label.fill('Back')
    await expect(error).toBeHidden()
    await expect(preview).toHaveText('Back')
  })

  test('switches mixins without a reload and shows the schema description', async ({ page }) => {
    await page.goto(EXPLORER)
    await expect(page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')).toHaveText('Save')
    await expect(page.locator('[data-explorer-description]')).toHaveText('A button for the main action')

    await page.locator('[data-explorer-item="tag"]').click()
    await expect(page).toHaveURL(/#mixin=tag$/)
    await expect(page.locator('[data-explorer-name]')).toHaveText('Tag')
    await expect(page.locator('[data-explorer-description]')).toHaveText('Short label for filters and categories')
    await expect(page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] span.tag')).toHaveText('New')
    await expect(page.getByRole('textbox', { name: 'text' })).toHaveValue('New')
  })

  test('leaves an optional prop out when its control is empty', async ({ page }) => {
    await page.goto(EXPLORER)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')
    const pugCall = page.locator('[data-playground-pug-call]')

    await page.getByRole('textbox', { name: 'icon' }).fill('plus')
    await expect(preview.locator('svg[data-name="plus"]')).toHaveCount(1)
    await page.getByRole('textbox', { name: 'icon' }).fill('')
    await expect(preview.locator('svg')).toHaveCount(0)

    // the empty choice of a prop with a default lets the mixin fall back to it
    await page.getByRole('combobox', { name: 'variant' }).selectOption({ label: 'ghost' })
    await expect(preview).toHaveClass(/btn--ghost/)
    await page.getByRole('combobox', { name: 'variant' }).selectOption({ label: '—' })
    await expect(preview).toHaveClass(/btn--primary/)
    await expect(pugCall).not.toContainText('variant')
  })

  test('checks the schema constraints at the field before rendering', async ({ page }) => {
    await page.goto(EXPLORER)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')
    await expect(preview).toHaveAttribute('data-count', '0')

    const count = page.getByRole('spinbutton', { name: 'count' })
    await expect(count).toHaveAttribute('max', '9')
    await count.fill('12')
    await expect(page.locator('[data-field="count"] .c-field__error')).toHaveText('Must be at most 9')
    await expect(preview).toHaveAttribute('data-count', '0')

    await count.fill('4')
    await expect(page.locator('[data-field="count"] .c-field__error')).toBeHidden()
    await expect(preview).toHaveAttribute('data-count', '4')
  })

  test('edits an array prop with the list editor', async ({ page }) => {
    await page.goto(`${EXPLORER}#mixin=tag`)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] .tag')
    await expect(preview).toHaveText('New')

    const addEntry = page.getByRole('button', { name: 'Add entry' })
    await addEntry.click()
    // a fresh entry is empty, which `.min(1)` forbids
    await expect(page.locator('[data-field="extras"] .c-field__error')).toHaveText('Entry 1: Must not be empty')

    await page.getByRole('textbox', { name: 'extras entry 1' }).fill('Beta')
    await addEntry.click()
    await page.getByRole('textbox', { name: 'extras entry 2' }).fill('Hot')
    await expect(preview.locator('.tag__extra')).toHaveText(['Beta', 'Hot'])
    await expect(addEntry).toBeDisabled()

    await page.getByRole('button', { name: 'Move entry 2 up' }).click()
    await expect(preview.locator('.tag__extra')).toHaveText(['Hot', 'Beta'])

    await page.getByRole('button', { name: 'Remove entry 1' }).click()
    await expect(preview.locator('.tag__extra')).toHaveText(['Beta'])
    await expect(addEntry).toBeEnabled()
  })

  test('edits an array of objects with one group of fields per entry', async ({ page }) => {
    await page.goto(`${EXPLORER}#mixin=card`)
    const links = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] .card__links a')
    await expect(links).toHaveCount(0)

    const addEntry = page.locator('[data-field="links"]').getByRole('button', { name: 'Add entry' })
    await addEntry.click()
    const firstEntry = page.getByRole('group', { name: 'links entry 1' })
    await expect(firstEntry.getByRole('textbox', { name: 'text' })).toBeFocused()
    // a fresh entry has an empty text, which `.min(1)` forbids
    await expect(page.locator('[data-field="links"] .c-field__error')).toHaveText('Entry 1: text: Must not be empty')

    await firstEntry.getByRole('textbox', { name: 'text' }).fill('Docs')
    await firstEntry.getByRole('textbox', { name: 'href' }).fill('/docs')
    await expect(links).toHaveText(['Docs'])
    await expect(links).toHaveAttribute('href', '/docs')

    await addEntry.click()
    const secondEntry = page.getByRole('group', { name: 'links entry 2' })
    await secondEntry.getByRole('textbox', { name: 'text' }).fill('Blog')
    await secondEntry.getByRole('textbox', { name: 'href' }).fill('https://example.test')
    await secondEntry.getByRole('combobox', { name: 'isExternal' }).selectOption({ label: 'true' })
    await expect(links).toHaveText(['Docs', 'Blog'])
    await expect(links.nth(1)).toHaveAttribute('target', '_blank')

    await page.getByRole('button', { name: 'Move entry 2 up' }).click()
    await expect(links).toHaveText(['Blog', 'Docs'])

    await page.getByRole('tab', { name: 'Pug call' }).click()
    await expect(page.locator('[data-playground-pug-call]')).toHaveText('+card({ title: \'Card title\', links: [{ text: \'Blog\', href: \'https://example.test\', isExternal: true }, { text: \'Docs\', href: \'/docs\' }] })')
  })

  test('edits an object prop as a group of fields behind a switch', async ({ page }) => {
    await page.goto(`${EXPLORER}#mixin=card`)
    const cta = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] .card__cta')
    const group = page.locator('[data-field="cta"]')
    await expect(group.locator('.c-field__help')).toHaveText('Call to action below the links')
    await expect(group.getByRole('textbox')).toHaveCount(0)

    await group.getByRole('checkbox', { name: 'Pass cta' }).check()
    // the fields start from their examples and defaults, text has neither and `.min(1)` forbids it empty
    await expect(page.locator('[data-field="cta.text"] .c-field__error')).toHaveText('Must not be empty')
    await expect(group.getByRole('textbox', { name: 'href' })).toHaveValue('/more')

    await group.getByRole('textbox', { name: 'text' }).fill('Read more')
    await expect(cta).toHaveText('Read more')
    await expect(cta).toHaveAttribute('href', '/more')
    await expect(page.locator('[data-field="cta.text"] .c-field__error')).toBeHidden()

    await group.getByRole('combobox', { name: 'variant' }).selectOption({ label: 'ghost' })
    await expect(cta).toHaveClass(/card__cta--ghost/)

    await page.getByRole('tab', { name: 'Pug call' }).click()
    await expect(page.locator('[data-playground-pug-call]')).toHaveText('+card({ title: \'Card title\', cta: { text: \'Read more\', href: \'/more\', variant: \'ghost\' } })')
    await page.getByRole('tab', { name: 'Controls' }).click()

    await group.getByRole('checkbox', { name: 'Pass cta' }).uncheck()
    await expect(cta).toHaveCount(0)
  })

  test('plays a mixin whose schema lives in a .schema.ts file and shows the transformed output', async ({ page }) => {
    await page.goto(`${EXPLORER}#mixin=teaser`)
    const teaser = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] .teaser')
    await expect(page.locator('[data-explorer-description]')).toHaveText('Teaser whose schema lives in a .schema.ts file')
    await expect(teaser.locator('h3')).toHaveText('Teaser title')
    await expect(teaser).not.toHaveClass(/teaser--highlight/)

    await page.getByRole('combobox', { name: 'variant' }).selectOption({ label: 'highlight' })
    await expect(teaser).toHaveClass(/teaser--highlight/)

    await page.getByRole('tab', { name: 'Output' }).click()
    const output = page.locator('[data-playground-output]')
    await expect(output).toContainText('"isHighlighted": true')
    await expect(output).toContainText('"hasCta": false')
  })

  test('edits an object nested in an object prop', async ({ page }) => {
    await page.goto(`${EXPLORER}#mixin=teaser`)
    const byline = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] .teaser__byline')
    await page.locator('[data-field="byline"]').getByRole('checkbox', { name: 'Pass byline' }).check()
    await expect(page.locator('[data-field="byline.author.name"] .c-field__error')).toHaveText('Must not be empty')

    await page.locator('[data-field="byline.author.name"]').getByRole('textbox').fill('Ada')
    await expect(byline).toHaveText('Ada')
    await expect(page.locator('[data-field="byline.author.name"] .c-field__error')).toBeHidden()
  })

  test('edits a record prop with a key-value editor', async ({ page }) => {
    await page.goto(EXPLORER)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')
    const editor = page.locator('[data-field="attributes"]')

    await editor.getByRole('button', { name: 'Add entry' }).click()
    await expect(page.getByRole('textbox', { name: 'attributes key 1' })).toBeFocused()
    await page.getByRole('textbox', { name: 'attributes key 1' }).fill('data-open')
    await expect(page.getByRole('combobox', { name: 'attributes value 1 type' })).toHaveValue('true')
    await expect(preview).toHaveAttribute('data-open', '')

    await editor.getByRole('button', { name: 'Add entry' }).click()
    await page.getByRole('textbox', { name: 'attributes key 2' }).fill('data-label')
    await page.getByRole('combobox', { name: 'attributes value 2 type' }).selectOption('string')
    await page.getByRole('textbox', { name: 'attributes value 2' }).fill('Hello')
    await expect(preview).toHaveAttribute('data-label', 'Hello')

    await page.getByRole('textbox', { name: 'attributes key 1' }).fill('class')
    await expect(editor.locator('.c-field__error')).toHaveText('Key "class": Must match ^data-[a-z-]+$')

    await page.getByRole('button', { name: 'Remove entry 1' }).click()
    await page.getByRole('tab', { name: 'Pug call' }).click()
    await expect(page.locator('[data-playground-pug-call]')).toHaveText('+button({ label: \'Save\', attributes: { \'data-label\': \'Hello\' } })')
  })

  test('restores mixin and props from the URL hash', async ({ page }) => {
    await page.goto(EXPLORER)
    await page.getByRole('textbox', { name: 'label' }).fill('Shared')
    await page.getByRole('combobox', { name: 'variant' }).selectOption({ label: 'danger' })
    await expect(page).toHaveURL(/#mixin=button&props=/)

    const second = await page.context().newPage()
    await second.goto(page.url())

    await expect(second.getByRole('textbox', { name: 'label' })).toHaveValue('Shared')
    await expect(second.getByRole('combobox', { name: 'variant' })).toHaveValue('"danger"')
    const preview = second.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')
    await expect(preview).toHaveText('Shared')
    await expect(preview).toHaveClass(/btn--danger/)
  })

  test('plays a mixin declared with defineComponent and shows its issues at the control', async ({ page }) => {
    await page.goto(`${EXPLORER}#mixin=moleculenotice`)
    const preview = page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] .notice')
    await expect(page.locator('[data-explorer-name]')).toHaveText('Notice')
    await expect(page.locator('[data-explorer-path]')).toHaveText('molecules')
    await expect(page.locator('[data-explorer-description]')).toHaveText('A short status notice')
    await expect(preview).toHaveText('Saved')

    await page.getByRole('combobox', { name: 'tone' }).selectOption({ label: 'warning' })
    await expect(preview).toHaveClass(/notice--warning/)

    // `.refine()` is not checked while typing: the error comes from defineComponent at render time
    const text = page.getByRole('textbox', { name: 'text' })
    await text.fill('forbidden')
    const error = page.locator('[data-field="text"] .c-field__error')
    await expect(error).toHaveText('Must not be "forbidden"')
    await expect(preview).toHaveText('Saved')

    await text.fill('Done')
    await expect(error).toBeHidden()
    await expect(preview).toHaveText('Done')
  })

  test('marks a defineComponent mixin in section markup with the markers of its name', async ({ page }) => {
    await page.goto('/mixin-e2e/fullpage-1.2.html')
    await expect(page.locator('.notice')).toHaveText('Section notice')
    expect(await page.content()).toContain('<!-- START NOTICE--><p class="notice notice--warning">Section notice</p><!-- END NOTICE-->')
  })

  test('runs the audit on the selected mixin', async ({ page }) => {
    await page.goto(EXPLORER)
    await expect(page.frameLocator('#mixin-explorer-preview').locator('[data-kss-mixin-root] button')).toHaveText('Save')

    await page.locator('[data-code-audit-iframe="mixin-explorer-preview"]').click()
    await expect(page.locator('#code-audit-dialog')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#code-audit-dialog .audit-results')).not.toBeEmpty()
  })
})
