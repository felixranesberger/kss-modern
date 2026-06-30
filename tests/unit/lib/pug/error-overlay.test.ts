import { describe, expect, it } from 'vitest'
import { renderPugErrorOverlay } from '../../../../lib/pug/error-overlay.ts'
import { stripPugErrorOverlay } from '../../../../lib/shared.ts'

const error = {
  id: '1.4',
  file: '/abs/path/section.pug',
  message: 'Cannot find module "_missing.pug"',
}

describe('renderPugErrorOverlay', () => {
  it('carries the section id, file and message as attributes on the overlay element', () => {
    const html = renderPugErrorOverlay(error)
    expect(html).toContain('<pug-error-overlay')
    expect(html).toContain('error-id="1.4"')
    expect(html).toContain('error-file="/abs/path/section.pug"')
    expect(html).toContain('Cannot find module') // inside error-message="…"
  })

  it('omits the file line when no file is reported', () => {
    const html = renderPugErrorOverlay({ id: '2.1', message: 'boom' })
    expect(html).toContain('boom')
    expect(html).not.toContain('/abs/path')
  })

  it('escapes the message so a pug error string cannot inject markup', () => {
    const html = renderPugErrorOverlay({ id: '2.1', message: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  it('emits only the bare element — the definition lives in the bundled client, not inline', () => {
    const html = renderPugErrorOverlay(error)
    expect(html).toContain('<pug-error-overlay')
    expect(html).not.toContain('<script') // no inlined registration script
    expect(html).not.toContain('customElements') // the element is defined in the fullpage bundle
  })

  const overlayTag = (html: string) => html.match(/<pug-error-overlay[^>]*>/)![0]

  it('layers the component over the last good render when one exists', () => {
    const last = '<section class="c-card"><h2>Live content</h2></section>'
    const html = renderPugErrorOverlay(error, last)
    // the previous render stays in the light DOM (verbatim, not escaped) so the preview keeps
    // its content and the component paints over it
    expect(html.indexOf(last)).toBeGreaterThanOrEqual(0)
    expect(html.indexOf(last)).toBeLessThan(html.indexOf('<pug-error-overlay'))
    expect(overlayTag(html)).not.toContain('data-empty') // content present -> no min-height filler
  })

  it('marks the component empty so it carries height when there is no previous render', () => {
    const html = renderPugErrorOverlay(error)
    expect(overlayTag(html)).toContain('data-empty')
    expect(html).not.toContain('Live content')
  })

  it('emits the overlay so it can be stripped from the code view / a11y audit, keeping the content', () => {
    const last = '<section class="c-card"><h2>Live content</h2></section>'
    // stripping leaves only the last good render — nothing of the overlay element survives
    expect(stripPugErrorOverlay(renderPugErrorOverlay(error, last))).toBe(last)
    expect(stripPugErrorOverlay(renderPugErrorOverlay(error))).toBe('')
    // sanity: the unstripped output really did contain the overlay
    expect(renderPugErrorOverlay(error, last)).toContain('<pug-error-overlay')
  })
})
