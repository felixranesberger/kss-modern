import { describe, expect, it } from 'vitest'
import { ensureStartingSlash, fixAccessibilityIssues, generateId, replaceWrapperContent, sanitizeSpecialCharacters } from '../../../lib/shared'

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
