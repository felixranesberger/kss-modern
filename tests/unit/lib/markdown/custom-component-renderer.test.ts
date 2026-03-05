import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../../../lib/markdown/index'

describe('markdownItComponent plugin', () => {
  it('renders alert component from markdown', async () => {
    const result = await parseMarkdown({
      markdownContent: ':::alert{type="warning" title="Watch out"}\nSomething important\n:::',
      rootHeadingLevel: 1,
    })

    expect(result).toContain('role="alert"')
    expect(result).toContain('Watch out')
    expect(result).toContain('Something important')
  }, 15_000)

  it('renders accordion component from markdown', async () => {
    const result = await parseMarkdown({
      markdownContent: ':::accordion{title="FAQ"}\nAnswer here\n:::',
      rootHeadingLevel: 1,
    })

    expect(result).toContain('<details')
    expect(result).toContain('<summary')
    expect(result).toContain('FAQ')
    expect(result).toContain('Answer here')
  }, 15_000)

  it('renders component with mixed markdown content', async () => {
    const result = await parseMarkdown({
      markdownContent: ':::alert{type="info"}\n**Bold** and *italic*\n:::',
      rootHeadingLevel: 1,
    })

    expect(result).toContain('<strong>Bold</strong>')
    expect(result).toContain('<em>italic</em>')
  }, 15_000)

  it('ignores unknown component names', async () => {
    const result = await parseMarkdown({
      markdownContent: ':::unknown{type="info"}\nContent\n:::',
      rootHeadingLevel: 1,
    })

    // Unknown component is not rendered as a component, it remains as text
    expect(result).toContain(':::unknown')
  }, 15_000)
})
