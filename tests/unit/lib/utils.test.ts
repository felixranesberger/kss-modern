import path from 'node:path'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'
import { ensureStartingSlash, fixAccessibilityIssues, generateId, logicalWriteFile, sanitizeSpecialCharacters } from '../../../lib/utils'

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
  it('encodes greater-than sign (then double-encodes the ampersand)', () => {
    // > becomes &gt; then & in &gt; becomes &amp;gt;
    expect(sanitizeSpecialCharacters('a > b')).toBe('a &amp;gt; b')
  })

  it('encodes less-than sign (then double-encodes the ampersand)', () => {
    // < becomes &lt; then & in &lt; becomes &amp;lt;
    expect(sanitizeSpecialCharacters('a < b')).toBe('a &amp;lt; b')
  })

  it('encodes ampersand', () => {
    expect(sanitizeSpecialCharacters('a & b')).toBe('a &amp; b')
  })

  it('encodes double quotes', () => {
    expect(sanitizeSpecialCharacters('"hello"')).toBe('&quot;hello&quot;')
  })

  it('encodes single quotes', () => {
    expect(sanitizeSpecialCharacters("it's")).toBe('it&#039;s')
  })

  it('encodes all special characters reflecting replacement order', () => {
    // Replacement order: > -> &gt;, < -> &lt;, & -> &amp;, " -> &quot;, ' -> &#039;
    // The & in &gt; and &lt; gets double-encoded to &amp;gt; and &amp;lt;
    expect(sanitizeSpecialCharacters('<a href="x">&</a>')).toBe(
      '&amp;lt;a href=&quot;x&quot;&amp;gt;&amp;&amp;lt;/a&amp;gt;',
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

describe('logicalWriteFile', () => {
  it('writes a new file when it does not exist', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'new-file.txt')

    await logicalWriteFile(filePath, 'hello world')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('hello world')

    await fs.remove(tmpDir)
  })

  it('skips write if content is unchanged', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'existing.txt')

    await fs.writeFile(filePath, 'same content')
    const statBefore = await fs.stat(filePath)

    // Small delay to ensure mtime would differ if written
    await new Promise(resolve => setTimeout(resolve, 50))
    await logicalWriteFile(filePath, 'same content')

    const statAfter = await fs.stat(filePath)
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs)

    await fs.remove(tmpDir)
  })

  it('overwrites file if content has changed', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'changing.txt')

    await fs.writeFile(filePath, 'old content')
    await logicalWriteFile(filePath, 'new content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('new content')

    await fs.remove(tmpDir)
  })

  it('creates intermediate directories if needed', async () => {
    const tmpDir = await fs.mkdtemp(path.join('/tmp', 'utils-test-'))
    const filePath = path.join(tmpDir, 'nested', 'dir', 'file.txt')

    await logicalWriteFile(filePath, 'deep content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('deep content')

    await fs.remove(tmpDir)
  })
})
