import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryWithinTemplates } from '../../../client/lib/query-within-templates.ts'

// `window.querySelectorAnywhere` (defined in client/fullpage.ts) is just this call against the
// document; we exercise the underlying helper directly to avoid fullpage.ts's load-time side effects.
function querySelectorAnywhere(selector: string): Element | null {
  return queryWithinTemplates(document, selector)
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

  it('finds an element inside a <template> nested in the middle of the selector path', () => {
    // regression: external-content-consent-solution wraps an iframe in a <template>
    // several levels deep in the light DOM
    document.body.innerHTML = `
      <div id="slider-198405-slide-0">
        <figure>
          <external-content-consent-solution>
            <button type="button">Accept</button>
            <template>
              <iframe src="https://example.com"></iframe>
            </template>
          </external-content-consent-solution>
        </figure>
      </div>
    `

    const result = querySelectorAnywhere(
      '#slider-198405-slide-0 > figure > external-content-consent-solution > template:nth-child(2) > iframe',
    )
    expect(result).not.toBeNull()
    expect(result?.tagName).toBe('IFRAME')
  })

  it('finds an element inside a <template> nested within another <template>', () => {
    document.body.innerHTML = `
      <div id="outer">
        <template id="outer-template">
          <section>
            <template>
              <span class="deep">Deep</span>
            </template>
          </section>
        </template>
      </div>
    `

    const result = querySelectorAnywhere(
      '#outer > #outer-template > section > template > span.deep',
    )
    expect(result).not.toBeNull()
    expect(result?.textContent).toBe('Deep')
  })

  it('returns null when no templates exist and element is not in DOM', () => {
    document.body.innerHTML = '<div id="only-this"></div>'

    const result = querySelectorAnywhere('#missing')
    expect(result).toBeNull()
  })

  it('returns null for a missing selector instead of throwing', () => {
    document.body.innerHTML = '<div id="regular"></div>'

    // html-validate messages can lack a selector; the helper must not crash on it
    expect(queryWithinTemplates(document, undefined as unknown as string)).toBeNull()
    expect(queryWithinTemplates(document, null as unknown as string)).toBeNull()
    expect(queryWithinTemplates(document, '')).toBeNull()
  })
})
