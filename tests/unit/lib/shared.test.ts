import { describe, expect, it } from 'vitest'
import { ensureStartingSlash, fixAccessibilityIssues, generateId, htmlToSearchText, replaceWrapperContent, sanitizeSpecialCharacters, slugify, stripPugErrorOverlay } from '../../../lib/shared'

const overlay = (attrs = '') => `<pug-error-overlay${attrs}></pug-error-overlay>`

describe('stripPugErrorOverlay', () => {
  it('removes the overlay element, leaving the surrounding content', () => {
    const html = `<section>content</section>${overlay(' error-id="1.4"')}`
    expect(stripPugErrorOverlay(html)).toBe('<section>content</section>')
  })

  it('leaves markup without an overlay untouched', () => {
    const html = '<section>just content</section>'
    expect(stripPugErrorOverlay(html)).toBe(html)
  })

  it('removes every overlay element, even when one is embedded mid-document', () => {
    const html = `a${overlay(' error-id="1.1"')}b${overlay(' error-id="1.2"')}`
    expect(stripPugErrorOverlay(html)).toBe('ab')
  })

  it('removes the overlay without touching a real custom element with a shared name prefix', () => {
    const html = `${overlay(' error-id="1.4"')}<pug-error-overlay-legend>keep</pug-error-overlay-legend>`
    expect(stripPugErrorOverlay(html)).toBe('<pug-error-overlay-legend>keep</pug-error-overlay-legend>')
  })
})

describe('htmlToSearchText', () => {
  it('strips tags and collapses whitespace from rendered-markdown descriptions', () => {
    const html = '<p>A <strong>primary</strong> button</p>\n<p>for the main action</p>'
    expect(htmlToSearchText(html)).toBe('A primary button for the main action')
  })

  it('decodes the entities the markdown renderer emits', () => {
    expect(htmlToSearchText('<code>a &amp; b &lt;tag&gt;</code>')).toBe('a & b <tag>')
  })

  it('returns an empty string for markup with no text content', () => {
    expect(htmlToSearchText('<hr>')).toBe('')
  })

  it('leaves plain text untouched', () => {
    expect(htmlToSearchText('Just a heading')).toBe('Just a heading')
  })
})

describe('slugify', () => {
  it('lowercases and turns spaces into dashes', () => {
    expect(slugify('Test Styleguide')).toBe('test-styleguide')
  })

  it('collapses punctuation and runs of separators into a single dash', () => {
    expect(slugify('ACME / Web Kit!')).toBe('acme-web-kit')
  })

  it('trims leading and trailing dashes', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
  })
})

describe('fixAccessibilityIssues', () => {
  it('normalizes disabled="disabled" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<input disabled="disabled">')).toBe('<input disabled>')
  })

  it('normalizes disabled="" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<input disabled="">')).toBe('<input disabled>')
  })

  it('normalizes checked="checked" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<input checked="checked">')).toBe('<input checked>')
  })

  it('normalizes checked="" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<input checked="">')).toBe('<input checked>')
  })

  it('normalizes required="required" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<input required="required">')).toBe('<input required>')
  })

  it('normalizes selected="selected" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<option selected="selected">')).toBe('<option selected>')
  })

  it('normalizes multiple="multiple" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<select multiple="multiple">')).toBe('<select multiple>')
  })

  it('normalizes readonly="readonly" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<input readonly="readonly">')).toBe('<input readonly>')
  })

  it('normalizes open="open" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<details open="open">')).toBe('<details open>')
  })

  it('normalizes open="" to standalone attribute', () => {
    expect(fixAccessibilityIssues('<details open="">')).toBe('<details open>')
  })

  it('handles multiple boolean attributes in one string', () => {
    const input = '<input disabled="disabled" required="required" checked="">'
    const expected = '<input disabled required checked>'
    expect(fixAccessibilityIssues(input)).toBe(expected)
  })

  it('leaves non-boolean attributes untouched', () => {
    const input = '<input type="text" class="field">'
    expect(fixAccessibilityIssues(input)).toBe(input)
  })
})

describe('sanitizeSpecialCharacters', () => {
  it('encodes greater-than sign', () => {
    expect(sanitizeSpecialCharacters('a > b')).toBe('a &gt; b')
  })

  it('encodes less-than sign', () => {
    expect(sanitizeSpecialCharacters('a < b')).toBe('a &lt; b')
  })

  it('encodes ampersand', () => {
    expect(sanitizeSpecialCharacters('a & b')).toBe('a &amp; b')
  })

  it('encodes double quotes', () => {
    expect(sanitizeSpecialCharacters('"hello"')).toBe('&quot;hello&quot;')
  })

  it('encodes single quotes', () => {
    expect(sanitizeSpecialCharacters('it\'s')).toBe('it&#039;s')
  })

  it('encodes all special characters', () => {
    expect(sanitizeSpecialCharacters('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;',
    )
  })
})

describe('ensureStartingSlash', () => {
  it('adds slash prefix when missing', () => {
    expect(ensureStartingSlash('path/to/file')).toBe('/path/to/file')
  })

  it('does not double slash when already present', () => {
    expect(ensureStartingSlash('/path/to/file')).toBe('/path/to/file')
  })

  it('handles empty string', () => {
    expect(ensureStartingSlash('')).toBe('/')
  })
})

describe('generateId', () => {
  it('returns incrementing numbers', () => {
    const first = generateId()
    const second = generateId()
    expect(second).toBe(first + 1)
  })
})

describe('replaceWrapperContent', () => {
  it('substitutes the self-closing <wrapper-content/> token', () => {
    expect(replaceWrapperContent('<nav><wrapper-content/></nav>', '<a>x</a>')).toBe('<nav><a>x</a></nav>')
  })

  it('substitutes the {{wrapper-content}} token', () => {
    expect(replaceWrapperContent('<div>{{wrapper-content}}</div>', '<p>x</p>')).toBe('<div><p>x</p></div>')
  })

  it('tolerates whitespace inside either token', () => {
    expect(replaceWrapperContent('<div>{{ wrapper-content }}</div>', 'C')).toBe('<div>C</div>')
    expect(replaceWrapperContent('<div><wrapper-content /></div>', 'C')).toBe('<div>C</div>')
  })

  it('inserts $-sequences in the content verbatim (not as replacement patterns)', () => {
    expect(replaceWrapperContent('<i>{{wrapper-content}}</i>', 'price $5 & $&')).toBe('<i>price $5 & $&</i>')
  })

  it('returns the wrapper unchanged when no slot is present', () => {
    expect(replaceWrapperContent('<div>no slot</div>', 'C')).toBe('<div>no slot</div>')
  })
})
