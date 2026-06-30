import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getSearchHtml } from '../../../lib/templates/preview.ts'

/**
 * Drives the real search module against the real `getSearchHtml` template: types into the input and
 * asserts what the user ends up seeing — which items survive the fuzzy filter, where the match is
 * highlighted (label vs. the hint), the subsection deep-link, typo tolerance, and the empty state.
 * motion is stubbed because we're exercising matching/highlighting, not the open/close animations.
 */

vi.mock('motion', () => ({
  animate: () => ({
    then: (cb?: () => void) => {
      cb?.()
      return Promise.resolve()
    },
  }),
  spring: 'spring',
}))

const sections = [
  {
    title: 'Components',
    items: [
      {
        label: 'Button',
        href: '/button.html',
        searchKeywords: [
          { keywords: ['Button', 'A clickable element'] },
          { id: 'section-1-1', keywords: ['Primary button', 'The main call to action'] },
        ],
      },
      {
        label: 'Forms',
        href: '/forms.html',
        searchKeywords: [
          { keywords: ['Forms', 'Form controls'] },
          { id: 'section-2-1', keywords: ['Checkbox', 'A box you can tick'] },
        ],
      },
      {
        label: 'Sidebar',
        href: '/sidebar.html',
        searchKeywords: [
          { keywords: ['Sidebar', 'Wraps content in a <nav> landmark element'] },
        ],
      },
    ],
  },
  {
    title: 'Foundations',
    items: [
      {
        label: 'Colors',
        href: '/colors.html',
        searchKeywords: [
          { keywords: ['Colors', 'The brand color palette and usage guidelines'] },
        ],
      },
    ],
  },
]

let searchInput: HTMLInputElement

beforeAll(async () => {
  document.body.innerHTML = `<button data-open-search type="button">Search</button>${getSearchHtml(sections)}`
  await import('../../../client/lib/search.ts')
  searchInput = document.querySelector<HTMLInputElement>('#search-input')!
})

function type(value: string) {
  searchInput.value = value
  searchInput.dispatchEvent(new Event('input', { bubbles: true }))
}

function item(label: string): HTMLElement {
  const items = [...document.querySelectorAll<HTMLElement>('.search-category__item')]
  const found = items.find(el => el.querySelector('[data-search-label]')?.textContent === label)
  if (!found)
    throw new Error(`No search item with label "${label}"`)
  return found
}

const isActive = (el: HTMLElement) => el.classList.contains('search-category__item--active')
const labelHtml = (el: HTMLElement) => el.querySelector('[data-search-label]')!.innerHTML
const hint = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-type="search-hint"]')!
const link = (el: HTMLElement) => el.querySelector('a')!

describe('styleguide search (uFuzzy)', () => {
  it('highlights the matched part of the title when the label matches', () => {
    type('colors')

    expect(isActive(item('Colors'))).toBe(true)
    expect(isActive(item('Button'))).toBe(false)
    expect(labelHtml(item('Colors'))).toContain('<mark')
    expect(hint(item('Colors')).innerHTML).toBe('')
  })

  it('surfaces a subsection match in the hint and deep-links to it', () => {
    type('checkbox')

    const forms = item('Forms')
    expect(isActive(forms)).toBe(true)
    expect(hint(forms).textContent).toContain('Checkbox')
    expect(hint(forms).innerHTML).toContain('<mark')
    // the visible title stays untouched; only the hint explains the match
    expect(labelHtml(forms)).toBe('Forms')
    expect(link(forms).getAttribute('href')).toContain('#section-2-1')
  })

  it('shows a highlighted snippet when only the description matches', () => {
    type('palette')

    const colors = item('Colors')
    expect(isActive(colors)).toBe(true)
    expect(hint(colors).innerHTML).toContain('<mark')
    expect(hint(colors).textContent?.toLowerCase()).toContain('palette')
  })

  it('renders documented HTML tags in the excerpt as code chips, with the match still highlighted', () => {
    type('landmark')

    const sidebar = item('Sidebar')
    expect(isActive(sidebar)).toBe(true)
    // the documented "<nav>" tag becomes a code chip rather than stripped or escaped-looking text
    expect(hint(sidebar).querySelector('code')?.textContent).toBe('<nav>')
    // and the actual query term is still highlighted
    expect(hint(sidebar).innerHTML).toContain('<mark')
    // Hybrid: a body-only match never rewrites the title
    expect(labelHtml(sidebar)).toBe('Sidebar')
  })

  it('tolerates a single-character typo', () => {
    type('buton')

    expect(isActive(item('Button'))).toBe(true)
  })

  it('shows the empty state and hides the list when nothing matches', () => {
    type('zzzqqq')

    const anyActive = [...document.querySelectorAll<HTMLElement>('.search-category__item')].some(isActive)
    expect(anyActive).toBe(false)
    expect(document.querySelector('#search-no-results')!.classList.contains('hidden')).toBe(false)
    expect(document.querySelector('#search-list')!.classList.contains('hidden')).toBe(true)
  })

  it('restores every item, clears hints and resets hrefs when the query is cleared', () => {
    type('checkbox')
    type('')

    const items = [...document.querySelectorAll<HTMLElement>('.search-category__item')]
    expect(items.every(isActive)).toBe(true)
    expect(hint(item('Forms')).textContent).toBe('')
    expect(link(item('Forms')).getAttribute('href')).toBe('/forms.html')
  })
})
