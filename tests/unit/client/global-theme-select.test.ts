import { beforeEach, describe, expect, it } from 'vitest'
import initGlobalThemeSelect from '../../../client/lib/global-theme-select.ts'
import initSectionThemeSelects from '../../../client/lib/section-theme-select.ts'

// jsdom gives an about:blank <iframe> a real contentDocument once it is in the DOM, which
// is all the dropdowns need: they only ever touch the preview's root classList. The
// load-time half (a preview reading `data-theme-class` on its own) lives in
// client/fullpage.ts and is covered by tests/e2e/global-theme.spec.ts.

const STORAGE_KEY = 'in2global-theme'

function renderPage() {
  document.body.innerHTML = `
    <header>
      <select data-global-theme-select>
        <option value="">Default</option>
        <option value="theme-midnight">Midnight</option>
        <option value="theme-sunrise">Sunrise</option>
      </select>
    </header>
    <section class="styleguide-section" id="section-3-10" data-section-reference="3.10">
      <a class="card-link" href="/fullpage-3.10.html" target="_blank">Open in fullpage</a>
      <select data-section-theme-select>
        <option value="">Default</option>
        <option value="theme-sunrise">Sunrise</option>
      </select>
      <iframe class="preview-iframe" data-preview="true" src="about:blank"></iframe>
      <iframe class="preview-iframe" data-preview="true" data-modifier=".c-card--primary" src="about:blank"></iframe>
    </section>
    <section class="styleguide-section" id="section-3-20" data-section-reference="3.20">
      <a class="alert-link" href="/fullpage-3.20.html?modifier=.c-alert--error" target="_blank">Open modifier</a>
      <iframe class="preview-iframe" data-preview="true" data-modifier=".c-alert--error" src="about:blank"></iframe>
    </section>
  `

  const globalSelect = document.querySelector<HTMLSelectElement>('[data-global-theme-select]')!
  const sectionSelect = document.querySelector<HTMLSelectElement>('[data-section-theme-select]')!
  const card = Array.from(document.querySelectorAll<HTMLIFrameElement>('#section-3-10 iframe'))
  const alert = document.querySelector<HTMLIFrameElement>('#section-3-20 iframe')!

  return { globalSelect, sectionSelect, card, alert }
}

function rootClasses(iframe: HTMLIFrameElement) {
  return Array.from(iframe.contentDocument!.documentElement.classList).sort()
}

function selectTheme(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function href(selector: string) {
  return document.querySelector(selector)!.getAttribute('href')
}

describe('initGlobalThemeSelect', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('applies the chosen theme to every preview on the page', () => {
    const { globalSelect, card, alert } = renderPage()
    initGlobalThemeSelect(globalSelect)

    selectTheme(globalSelect, 'theme-midnight')

    for (const iframe of [...card, alert]) {
      expect(iframe.getAttribute('data-theme-class')).toBe('theme-midnight')
      expect(rootClasses(iframe)).toEqual(['theme-midnight'])
    }
  })

  it('swaps the class when switching and removes it for Default', () => {
    const { globalSelect, alert } = renderPage()
    initGlobalThemeSelect(globalSelect)

    selectTheme(globalSelect, 'theme-midnight')
    selectTheme(globalSelect, 'theme-sunrise')
    expect(rootClasses(alert)).toEqual(['theme-sunrise'])

    selectTheme(globalSelect, '')
    expect(alert.hasAttribute('data-theme-class')).toBe(false)
    expect(rootClasses(alert)).toEqual([])
  })

  it('reflects the theme in every fullpage link, keeping other parameters', () => {
    const { globalSelect } = renderPage()
    initGlobalThemeSelect(globalSelect)

    selectTheme(globalSelect, 'theme-midnight')
    expect(href('.card-link')).toBe('/fullpage-3.10.html?theme=theme-midnight')
    expect(href('.alert-link')).toBe('/fullpage-3.20.html?modifier=.c-alert--error&theme=theme-midnight')

    selectTheme(globalSelect, '')
    expect(href('.card-link')).toBe('/fullpage-3.10.html')
    expect(href('.alert-link')).toBe('/fullpage-3.20.html?modifier=.c-alert--error')
  })

  it('remembers the selection and forgets it for the default theme', () => {
    const { globalSelect } = renderPage()
    initGlobalThemeSelect(globalSelect)

    selectTheme(globalSelect, 'theme-sunrise')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('theme-sunrise')

    selectTheme(globalSelect, '')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores a remembered selection on init', () => {
    localStorage.setItem(STORAGE_KEY, 'theme-sunrise')
    const { globalSelect, card, alert } = renderPage()
    initGlobalThemeSelect(globalSelect)

    expect(globalSelect.value).toBe('theme-sunrise')
    for (const iframe of [...card, alert])
      expect(rootClasses(iframe)).toEqual(['theme-sunrise'])
    expect(href('.card-link')).toBe('/fullpage-3.10.html?theme=theme-sunrise')
  })

  it('ignores a remembered theme the dropdown no longer offers', () => {
    localStorage.setItem(STORAGE_KEY, 'theme-removed')
    const { globalSelect, alert } = renderPage()
    initGlobalThemeSelect(globalSelect)

    expect(globalSelect.value).toBe('')
    expect(alert.hasAttribute('data-theme-class')).toBe(false)
    expect(rootClasses(alert)).toEqual([])
  })
})

describe('global and section theme together', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lets a section\'s own selection override the global theme for that section only', () => {
    const { globalSelect, sectionSelect, card, alert } = renderPage()
    initGlobalThemeSelect(globalSelect)
    initSectionThemeSelects([sectionSelect])

    selectTheme(globalSelect, 'theme-midnight')
    selectTheme(sectionSelect, 'theme-sunrise')

    for (const iframe of card)
      expect(rootClasses(iframe)).toEqual(['theme-sunrise'])
    expect(rootClasses(alert)).toEqual(['theme-midnight'])
    expect(href('.card-link')).toBe('/fullpage-3.10.html?theme=theme-sunrise')
    expect(href('.alert-link')).toBe('/fullpage-3.20.html?modifier=.c-alert--error&theme=theme-midnight')
  })

  it('keeps a section override when the global theme changes', () => {
    const { globalSelect, sectionSelect, card, alert } = renderPage()
    initGlobalThemeSelect(globalSelect)
    initSectionThemeSelects([sectionSelect])

    selectTheme(sectionSelect, 'theme-sunrise')
    selectTheme(globalSelect, 'theme-midnight')

    for (const iframe of card)
      expect(rootClasses(iframe)).toEqual(['theme-sunrise'])
    expect(rootClasses(alert)).toEqual(['theme-midnight'])
  })

  it('returns a section to the global theme when its dropdown goes back to Default', () => {
    const { globalSelect, sectionSelect, card } = renderPage()
    initGlobalThemeSelect(globalSelect)
    initSectionThemeSelects([sectionSelect])

    selectTheme(globalSelect, 'theme-midnight')
    selectTheme(sectionSelect, 'theme-sunrise')
    selectTheme(sectionSelect, '')

    for (const iframe of card) {
      expect(iframe.getAttribute('data-theme-class')).toBe('theme-midnight')
      expect(rootClasses(iframe)).toEqual(['theme-midnight'])
    }
    expect(href('.card-link')).toBe('/fullpage-3.10.html?theme=theme-midnight')
  })

  it('resolves remembered selections the same way regardless of init order', () => {
    localStorage.setItem(STORAGE_KEY, 'theme-midnight')
    localStorage.setItem('in2section-theme:3.10', 'theme-sunrise')

    const { globalSelect, sectionSelect, card, alert } = renderPage()
    initSectionThemeSelects([sectionSelect])
    initGlobalThemeSelect(globalSelect)

    for (const iframe of card)
      expect(rootClasses(iframe)).toEqual(['theme-sunrise'])
    expect(rootClasses(alert)).toEqual(['theme-midnight'])
  })
})

describe('reloadPreviewsOnThemeChange', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-reload-previews-on-theme-change')
  })

  function trackReloads(iframes: HTMLIFrameElement[]) {
    const reloaded: HTMLIFrameElement[] = []
    for (const iframe of iframes) {
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: { location: { reload: () => reloaded.push(iframe) } },
      })
    }
    return reloaded
  }

  it('reloads every repainted preview when the shell opts in', () => {
    document.documentElement.setAttribute('data-reload-previews-on-theme-change', '')
    const { globalSelect, card, alert } = renderPage()
    const reloaded = trackReloads([...card, alert])
    initGlobalThemeSelect(globalSelect)

    selectTheme(globalSelect, 'theme-midnight')

    expect(reloaded).toEqual([...card, alert])
    // the reloading document applies the theme itself, off the attribute already written
    expect(alert.getAttribute('data-theme-class')).toBe('theme-midnight')
  })

  it('swaps in place, without reloading, when the shell does not opt in', () => {
    const { globalSelect, card, alert } = renderPage()
    const reloaded = trackReloads([...card, alert])
    initGlobalThemeSelect(globalSelect)

    selectTheme(globalSelect, 'theme-midnight')

    expect(reloaded).toEqual([])
    expect(rootClasses(alert)).toEqual(['theme-midnight'])
  })

  it('never reloads on the initial restore, only on a visitor change', () => {
    document.documentElement.setAttribute('data-reload-previews-on-theme-change', '')
    localStorage.setItem(STORAGE_KEY, 'theme-sunrise')
    const { globalSelect, card, alert } = renderPage()
    const reloaded = trackReloads([...card, alert])

    initGlobalThemeSelect(globalSelect)

    expect(reloaded).toEqual([])
    expect(rootClasses(alert)).toEqual(['theme-sunrise'])
  })

  it('reloads only the section that changed, not the whole page', () => {
    document.documentElement.setAttribute('data-reload-previews-on-theme-change', '')
    const { globalSelect, sectionSelect, card, alert } = renderPage()
    const reloaded = trackReloads([...card, alert])
    initGlobalThemeSelect(globalSelect)
    initSectionThemeSelects([sectionSelect])

    selectTheme(sectionSelect, 'theme-sunrise')

    expect(reloaded).toEqual(card)
  })
})
