import { beforeEach, describe, expect, it } from 'vitest'
import { applyPreviewThemeClass } from '../../../client/lib/preview-theme.ts'
import initSectionThemeSelects from '../../../client/lib/section-theme-select.ts'

// jsdom gives an about:blank <iframe> a real contentDocument once it is in the
// DOM, which is all the dropdown needs: it only ever touches the preview's root
// classList. The load-time half (the preview reading `data-theme-class` on its
// own) lives in client/fullpage.ts and is covered by tests/e2e/section-theme.spec.ts.
// The interplay with the header's global theme is covered by global-theme-select.test.ts.

const STORAGE_KEY = 'in2section-theme:3.10'

function renderSection() {
  document.body.innerHTML = `
    <section class="styleguide-section" id="section-3-10" data-section-reference="3.10">
      <a class="header-link" href="/fullpage-3.10.html" target="_blank">Open in fullpage</a>
      <select data-section-theme-select>
        <option value="">Default</option>
        <option value="theme-midnight">Midnight</option>
        <option value="theme-a compact">A compact</option>
      </select>
      <iframe class="preview-iframe" data-preview="true" src="about:blank"></iframe>
      <a class="modifier-link" href="/fullpage-3.10.html?modifier=.c-card--primary" target="_blank">Open modifier</a>
      <iframe class="preview-iframe" data-preview="true" data-modifier=".c-card--primary" src="about:blank"></iframe>
      <a class="unrelated" href="https://example.com/fullpage-3.10.html">unrelated</a>
    </section>
  `

  const select = document.querySelector<HTMLSelectElement>('[data-section-theme-select]')!
  const [base, modifier] = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'))
  // the fullpage renders `htmlclass` statically — a theme is layered on top of it
  base.contentDocument!.documentElement.className = 'theme-cards'
  modifier.contentDocument!.documentElement.className = 'theme-cards'

  return { select, base, modifier }
}

function rootClasses(iframe: HTMLIFrameElement) {
  return Array.from(iframe.contentDocument!.documentElement.classList).sort()
}

function selectTheme(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('applyPreviewThemeClass', () => {
  it('records the class list on the iframe and adds it to the preview root', () => {
    const { base } = renderSection()
    applyPreviewThemeClass(base, 'theme-midnight')

    expect(base.getAttribute('data-theme-class')).toBe('theme-midnight')
    expect(rootClasses(base)).toEqual(['theme-cards', 'theme-midnight'])
  })

  it('removes only the classes it previously applied when switching', () => {
    const { base } = renderSection()
    applyPreviewThemeClass(base, 'theme-a compact')
    applyPreviewThemeClass(base, 'theme-midnight')

    expect(base.getAttribute('data-theme-class')).toBe('theme-midnight')
    expect(rootClasses(base)).toEqual(['theme-cards', 'theme-midnight'])
  })

  it('clears the attribute and the classes for the default theme, keeping static classes', () => {
    const { base } = renderSection()
    applyPreviewThemeClass(base, 'theme-midnight')
    applyPreviewThemeClass(base, '')

    expect(base.hasAttribute('data-theme-class')).toBe(false)
    expect(rootClasses(base)).toEqual(['theme-cards'])
  })

  it('still records the attribute when the preview document is not reachable', () => {
    const iframe = document.createElement('iframe') // detached: no contentDocument
    expect(() => applyPreviewThemeClass(iframe, 'theme-midnight')).not.toThrow()
    expect(iframe.getAttribute('data-theme-class')).toBe('theme-midnight')
  })
})

describe('initSectionThemeSelects', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('applies the chosen theme to the base and every modifier preview', () => {
    const { select, base, modifier } = renderSection()
    initSectionThemeSelects([select])

    selectTheme(select, 'theme-midnight')

    expect(base.getAttribute('data-theme-class')).toBe('theme-midnight')
    expect(modifier.getAttribute('data-theme-class')).toBe('theme-midnight')
    expect(rootClasses(base)).toEqual(['theme-cards', 'theme-midnight'])
    expect(rootClasses(modifier)).toEqual(['theme-cards', 'theme-midnight'])
  })

  it('reflects the selection in the section\'s fullpage links only', () => {
    const { select } = renderSection()
    initSectionThemeSelects([select])

    selectTheme(select, 'theme-midnight')

    expect(document.querySelector('.header-link')!.getAttribute('href')).toBe('/fullpage-3.10.html?theme=theme-midnight')
    expect(document.querySelector('.modifier-link')!.getAttribute('href')).toBe('/fullpage-3.10.html?modifier=.c-card--primary&theme=theme-midnight')
    expect(document.querySelector('.unrelated')!.getAttribute('href')).toBe('https://example.com/fullpage-3.10.html')

    selectTheme(select, '')

    expect(document.querySelector('.header-link')!.getAttribute('href')).toBe('/fullpage-3.10.html')
    expect(document.querySelector('.modifier-link')!.getAttribute('href')).toBe('/fullpage-3.10.html?modifier=.c-card--primary')
  })

  it('keeps generated relative fullpage links relative', () => {
    const { select } = renderSection()
    document.querySelector('.header-link')!.setAttribute('href', 'fullpage-3.10.html')
    document.querySelector('.modifier-link')!.setAttribute('href', 'fullpage-3.10.html?modifier=.c-card--primary')
    initSectionThemeSelects([select])

    selectTheme(select, 'theme-midnight')

    expect(document.querySelector('.header-link')!.getAttribute('href')).toBe('fullpage-3.10.html?theme=theme-midnight')
    expect(document.querySelector('.modifier-link')!.getAttribute('href')).toBe('fullpage-3.10.html?modifier=.c-card--primary&theme=theme-midnight')

    selectTheme(select, '')

    expect(document.querySelector('.header-link')!.getAttribute('href')).toBe('fullpage-3.10.html')
  })

  it('remembers the selection per section and forgets it for the default theme', () => {
    const { select } = renderSection()
    initSectionThemeSelects([select])

    selectTheme(select, 'theme-midnight')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('theme-midnight')

    selectTheme(select, '')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores a remembered selection on init', () => {
    localStorage.setItem(STORAGE_KEY, 'theme-a compact')
    const { select, base, modifier } = renderSection()
    initSectionThemeSelects([select])

    expect(select.value).toBe('theme-a compact')
    expect(rootClasses(base)).toEqual(['theme-a', 'compact', 'theme-cards'].sort())
    expect(rootClasses(modifier)).toEqual(['theme-a', 'compact', 'theme-cards'].sort())
    expect(document.querySelector('.header-link')!.getAttribute('href')).toBe('/fullpage-3.10.html?theme=theme-a+compact')
  })

  it('ignores a remembered theme the section no longer offers', () => {
    localStorage.setItem(STORAGE_KEY, 'theme-removed')
    const { select, base } = renderSection()
    initSectionThemeSelects([select])

    expect(select.value).toBe('')
    expect(base.hasAttribute('data-theme-class')).toBe(false)
    expect(rootClasses(base)).toEqual(['theme-cards'])
  })

  it('skips a select that is not inside a section', () => {
    document.body.innerHTML = '<select data-section-theme-select><option value="">Default</option></select>'
    const select = document.querySelector<HTMLSelectElement>('select')!
    expect(() => initSectionThemeSelects([select])).not.toThrow()
  })
})
