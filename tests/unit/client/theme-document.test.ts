import { beforeEach, describe, expect, it } from 'vitest'
import { applyThemeToDocument } from '../../../client/lib/theme-document.ts'

// A preview document carries a `<link data-theme-css>` per themed stylesheet, parked at
// `media="not all"` (see lib/templates/fullpage.ts). Applying a theme flips the matching ones
// to `media="all"` and everything else back, so no request is made and nothing flashes.

function renderPreviewDocument() {
  document.head.innerHTML = `
    <link rel="stylesheet" href="/styles/main.css">
    <link rel="stylesheet" href="/themes/midnight.css" media="not all" data-theme-css="theme-midnight">
    <link rel="stylesheet" href="/themes/a.css" media="not all" data-theme-css="theme-a compact">
    <link rel="stylesheet" href="/themes/compact.css" media="not all" data-theme-css="theme-a compact">
  `
  document.documentElement.className = ''
}

function activeThemeStylesheets() {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-theme-css]'))
    .filter(link => link.media === 'all')
    .map(link => link.getAttribute('href'))
}

describe('applyThemeToDocument', () => {
  beforeEach(renderPreviewDocument)

  it('activates only the stylesheets of the applied theme', () => {
    applyThemeToDocument(document, 'theme-midnight')
    expect(activeThemeStylesheets()).toEqual(['/themes/midnight.css'])
  })

  it('activates every stylesheet of a multi-class theme', () => {
    applyThemeToDocument(document, 'theme-a compact')
    expect(activeThemeStylesheets()).toEqual(['/themes/a.css', '/themes/compact.css'])
  })

  it('deactivates the previous theme stylesheets when switching', () => {
    applyThemeToDocument(document, 'theme-midnight')
    applyThemeToDocument(document, 'theme-a compact', 'theme-midnight')

    expect(activeThemeStylesheets()).toEqual(['/themes/a.css', '/themes/compact.css'])
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false)
  })

  it('deactivates every theme stylesheet for the default theme', () => {
    applyThemeToDocument(document, 'theme-midnight')
    applyThemeToDocument(document, '', 'theme-midnight')

    expect(activeThemeStylesheets()).toEqual([])
    expect(Array.from(document.documentElement.classList)).toEqual([])
  })

  it('never touches the regular stylesheets', () => {
    applyThemeToDocument(document, 'theme-midnight')
    const main = document.querySelector<HTMLLinkElement>('link[href="/styles/main.css"]')!
    expect(main.media).toBe('')
  })

  it('applies a theme with no stylesheets as classes alone', () => {
    applyThemeToDocument(document, 'theme-plain')

    expect(document.documentElement.classList.contains('theme-plain')).toBe(true)
    expect(activeThemeStylesheets()).toEqual([])
  })

  it('keeps a static htmlclass that happens to equal a theme class', () => {
    document.documentElement.className = 'theme-midnight'

    // applied with no previous theme, so the dropdown removes nothing it did not add
    applyThemeToDocument(document, 'theme-a compact')
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true)
  })
})
