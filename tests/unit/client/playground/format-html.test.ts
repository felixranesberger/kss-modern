import { describe, expect, it } from 'vitest'
import { formatHtml } from '../../../../client/lib/playground/format-html.ts'

describe('formatHtml', () => {
  it('puts one element per line and keeps text-only elements together', () => {
    expect(formatHtml('<div class="stat"><span>Revenue</span><input disabled value="a&quot;b"></div>')).toBe([
      '<div class="stat">',
      '  <span>Revenue</span>',
      '  <input disabled value="a&quot;b">',
      '</div>',
    ].join('\n'))
  })

  it('escapes text and keeps comments', () => {
    expect(formatHtml('<p>a &lt; b</p><!-- note -->')).toBe('<p>a &lt; b</p>\n<!-- note -->')
  })
})
