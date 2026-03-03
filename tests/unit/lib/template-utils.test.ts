import { describe, expect, it } from 'vitest'
import { attrs, each, escape, html, ifElse, when } from '../../../lib/template-utils'

describe('escape', () => {
  it('escapes ampersands', () => {
    expect(escape('a & b')).toBe('a &amp; b')
  })

  it('escapes less-than signs', () => {
    expect(escape('<div>')).toBe('&lt;div&gt;')
  })

  it('escapes greater-than signs', () => {
    expect(escape('a > b')).toBe('a &gt; b')
  })

  it('escapes double quotes', () => {
    expect(escape('"hello"')).toBe('&quot;hello&quot;')
  })

  it('escapes single quotes', () => {
    expect(escape("it's")).toBe('it&#39;s')
  })

  it('escapes all special characters at once', () => {
    expect(escape('<a href="x" class=\'y\'>&</a>')).toBe(
      '&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('converts non-string values to string', () => {
    expect(escape(42)).toBe('42')
    expect(escape(null)).toBe('null')
    expect(escape(undefined)).toBe('undefined')
  })
})

describe('when', () => {
  it('returns content when condition is truthy', () => {
    expect(when(true, () => '<p>yes</p>')).toBe('<p>yes</p>')
  })

  it('returns content for truthy non-boolean values', () => {
    expect(when('nonempty', () => 'shown')).toBe('shown')
    expect(when(1, () => 'shown')).toBe('shown')
  })

  it('returns empty string when condition is falsy', () => {
    expect(when(false, () => '<p>no</p>')).toBe('')
    expect(when(0, () => 'hidden')).toBe('')
    expect(when('', () => 'hidden')).toBe('')
    expect(when(null, () => 'hidden')).toBe('')
    expect(when(undefined, () => 'hidden')).toBe('')
  })
})

describe('ifElse', () => {
  it('returns truthy branch when condition is truthy', () => {
    expect(ifElse(true, 'yes', 'no')).toBe('yes')
  })

  it('returns falsy branch when condition is falsy', () => {
    expect(ifElse(false, 'yes', 'no')).toBe('no')
  })

  it('defaults falsy branch to empty string', () => {
    expect(ifElse(false, 'yes')).toBe('')
  })

  it('treats various falsy values correctly', () => {
    expect(ifElse(0, 'yes', 'no')).toBe('no')
    expect(ifElse('', 'yes', 'no')).toBe('no')
    expect(ifElse(null, 'yes', 'no')).toBe('no')
    expect(ifElse(undefined, 'yes', 'no')).toBe('no')
  })
})

describe('attrs', () => {
  it('converts object entries to HTML attribute string', () => {
    expect(attrs({ id: 'main', class: 'active' })).toBe('id="main" class="active"')
  })

  it('handles numeric values', () => {
    expect(attrs({ tabindex: 0 })).toBe('tabindex="0"')
  })

  it('renders true as standalone attribute (no value)', () => {
    expect(attrs({ disabled: true })).toBe('disabled')
  })

  it('filters out null values', () => {
    expect(attrs({ id: 'x', class: null })).toBe('id="x"')
  })

  it('filters out undefined values', () => {
    expect(attrs({ id: 'x', class: undefined })).toBe('id="x"')
  })

  it('filters out false values', () => {
    expect(attrs({ id: 'x', hidden: false })).toBe('id="x"')
  })

  it('returns empty string for empty object', () => {
    expect(attrs({})).toBe('')
  })

  it('handles mixed value types', () => {
    const result = attrs({ id: 'el', disabled: true, class: null, tabindex: 1 })
    expect(result).toBe('id="el" disabled tabindex="1"')
  })
})

describe('each', () => {
  it('maps items to HTML and joins without separator', () => {
    const result = each(['a', 'b', 'c'], item => `<li>${item}</li>`)
    expect(result).toBe('<li>a</li><li>b</li><li>c</li>')
  })

  it('provides index to callback', () => {
    const result = each(['x', 'y'], (item, i) => `${i}:${item}`)
    expect(result).toBe('0:x1:y')
  })

  it('returns empty string for empty array', () => {
    expect(each([], () => 'content')).toBe('')
  })
})

describe('html tagged template', () => {
  it('auto-escapes interpolated string values', () => {
    const userInput = '<script>alert("xss")</script>'
    const result = html`<p>${userInput}</p>`
    expect(result).toBe('<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>')
  })

  it('auto-escapes numeric values', () => {
    const num = 42
    const result = html`<span>${num}</span>`
    expect(result).toBe('<span>42</span>')
  })

  it('passes RawHTML objects through without escaping', () => {
    const raw = { raw: '<strong>bold</strong>' }
    const result = html`<div>${raw}</div>`
    expect(result).toBe('<div><strong>bold</strong></div>')
  })

  it('renders null as empty string', () => {
    const result = html`<span>${null}</span>`
    expect(result).toBe('<span></span>')
  })

  it('renders undefined as empty string', () => {
    const result = html`<span>${undefined}</span>`
    expect(result).toBe('<span></span>')
  })

  it('handles multiple interpolations', () => {
    const name = 'O\'Brien'
    const raw = { raw: '<em>hi</em>' }
    const result = html`<p>${name} ${raw}</p>`
    expect(result).toBe('<p>O&#39;Brien <em>hi</em></p>')
  })

  it('handles template with no interpolations', () => {
    const result = html`<div>static</div>`
    expect(result).toBe('<div>static</div>')
  })
})
