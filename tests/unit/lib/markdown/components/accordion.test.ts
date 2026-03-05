import { describe, expect, it } from 'vitest'
import { accordionRenderer } from '../../../../../lib/markdown/plugins/components/accordion'

describe('accordionRenderer', () => {
  it('defaults title to "Click to expand"', () => {
    const result = accordionRenderer('<p>Content</p>', {})

    expect(result).toContain('Click to expand')
  })

  it('renders custom title in summary', () => {
    const result = accordionRenderer('<p>Content</p>', { title: 'My FAQ' })

    expect(result).toContain('My FAQ')
    expect(result).not.toContain('Click to expand')
  })

  it('adds open attribute when open=true', () => {
    const result = accordionRenderer('<p>Content</p>', { open: true })

    expect(result).toContain(' open')
    // Verify it's on the details element
    expect(result).toMatch(/<details[^>]* open/)
  })

  it('does not add open attribute when open=false (default)', () => {
    const result = accordionRenderer('<p>Content</p>', {})

    // The details tag should not have the open attribute
    expect(result).not.toMatch(/<details[^>]* open/)
  })

  it('renders body content in the content div', () => {
    const result = accordionRenderer('<p>Accordion body</p>', {})

    expect(result).toContain('<p>Accordion body</p>')
  })

  it('uses details/summary HTML elements', () => {
    const result = accordionRenderer('<p>Content</p>', {})

    expect(result).toContain('<details')
    expect(result).toContain('</details>')
    expect(result).toContain('<summary')
    expect(result).toContain('</summary>')
  })
})
