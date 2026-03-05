import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * querySelectorAnywhere is defined as a side-effect in client/fullpage.ts on window.
 * We replicate the function here to test it in isolation without triggering
 * fullpage.ts side effects (iframe detection, axe-core imports, etc.).
 */
function querySelectorAnywhere(selector: string): Element | null {
  const element = document.querySelector(selector)
  if (element)
    return element

  // check if the selector root resolves to a <template> element
  const combinatorIndex = selector.search(/\s*[>+~ ]\s*/)
  if (combinatorIndex > 0) {
    const rootPart = selector.slice(0, combinatorIndex)
    const rootElement = document.querySelector(rootPart)
    if (rootElement instanceof HTMLTemplateElement) {
      const rest = selector.slice(combinatorIndex).replace(/^\s*>\s*/, '')
      const match = rootElement.content.querySelector(rest)
      if (match)
        return match
    }
  }

  // search through all templates for a match
  const templates = document.querySelectorAll<HTMLTemplateElement>('template')
  for (const template of templates) {
    const match = template.content.querySelector(selector)
    if (match)
      return match
  }

  return null
}

describe('querySelectorAnywhere', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('finds elements in the regular DOM', () => {
    document.body.innerHTML = '<div id="regular"><button>Click</button></div>'

    const result = querySelectorAnywhere('#regular > button')
    expect(result).not.toBeNull()
    expect(result?.tagName).toBe('BUTTON')
  })

  it('finds elements inside <template> content when selector has no "template" keyword', () => {
    document.body.innerHTML = `
      <template>
        <div id="mobile-menu">
          <div>
            <button>Menu</button>
          </div>
        </div>
      </template>
    `

    const result = querySelectorAnywhere('#mobile-menu > div > button')
    expect(result).not.toBeNull()
    expect(result?.tagName).toBe('BUTTON')
  })

  it('finds elements when selector root is a named <template> with child combinator', () => {
    document.body.innerHTML = `
      <template id="modal-template">
        <div class="c-modal">
          <div class="c-modal__dialog">
            <div class="c-modal__actions">
              <button class="btn btn--primary">Confirm</button>
              <button class="btn">Cancel</button>
            </div>
          </div>
        </div>
      </template>
    `

    const result = querySelectorAnywhere('#modal-template > div > div:nth-child(1) > div > button:nth-child(1)')
    expect(result).not.toBeNull()
    expect(result?.textContent).toBe('Confirm')

    const second = querySelectorAnywhere('#modal-template > div > div:nth-child(1) > div > button:nth-child(2)')
    expect(second).not.toBeNull()
    expect(second?.textContent).toBe('Cancel')
  })

  it('returns null when element does not exist anywhere', () => {
    document.body.innerHTML = `
      <template><div id="exists"></div></template>
    `

    const result = querySelectorAnywhere('#does-not-exist')
    expect(result).toBeNull()
  })

  it('prefers regular DOM over template content', () => {
    document.body.innerHTML = `
      <div class="target" data-source="dom">DOM</div>
      <template>
        <div class="target" data-source="template">Template</div>
      </template>
    `

    const result = querySelectorAnywhere('.target')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('data-source')).toBe('dom')
  })

  it('searches across multiple templates', () => {
    document.body.innerHTML = `
      <template>
        <div id="first-template">First</div>
      </template>
      <template>
        <div id="second-template">Second</div>
      </template>
    `

    const first = querySelectorAnywhere('#first-template')
    expect(first).not.toBeNull()
    expect(first?.textContent).toBe('First')

    const second = querySelectorAnywhere('#second-template')
    expect(second).not.toBeNull()
    expect(second?.textContent).toBe('Second')
  })

  it('handles nested elements inside template with complex selectors', () => {
    document.body.innerHTML = `
      <template>
        <nav id="mobile-menu-service-for-students">
          <div>
            <button type="button">Toggle</button>
          </div>
        </nav>
      </template>
    `

    const result = querySelectorAnywhere('#mobile-menu-service-for-students > div > button')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('type')).toBe('button')
  })

  it('returns null when no templates exist and element is not in DOM', () => {
    document.body.innerHTML = '<div id="only-this"></div>'

    const result = querySelectorAnywhere('#missing')
    expect(result).toBeNull()
  })
})
