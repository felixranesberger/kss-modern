import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../../../lib/markdown/index'

const fixturesDir = path.resolve(__dirname, '../../../fixtures/markdown')

describe('parseMarkdown', () => {
  it('renders markdown string to HTML', async () => {
    const result = await parseMarkdown({
      markdownContent: 'Hello **world**',
      rootHeadingLevel: 1,
    })

    expect(result).toContain('<strong>world</strong>')
  }, 15_000)

  it('renders markdown file to HTML', async () => {
    const result = await parseMarkdown({
      filePath: path.join(fixturesDir, 'sample.md'),
      rootHeadingLevel: 1,
    })

    expect(result).toContain('<strong>sample</strong>')
    expect(result).toContain('https://example.com')
    expect(result).toContain('<li>')
  }, 15_000)

  it('returns error HTML for missing file path', async () => {
    const result = await parseMarkdown({
      filePath: '/does/not/exist.md',
      rootHeadingLevel: 1,
    })

    expect(result).toContain('Error')
    expect(result).toContain('text-red-600')
  }, 15_000)

  it('shifts H1 down by 1 when rootHeadingLevel is 1', async () => {
    const result = await parseMarkdown({
      markdownContent: '# Top Heading\n\n## Sub Heading',
      rootHeadingLevel: 1,
    })

    // H1 -> H2, H2 -> H3
    expect(result).toContain('<h2')
    expect(result).toContain('Top Heading')
    expect(result).toContain('<h3')
    expect(result).toContain('Sub Heading')
    expect(result).not.toContain('<h1')
  }, 15_000)

  it('shifts headings down by 2 when rootHeadingLevel is 2 and content has H1', async () => {
    const result = await parseMarkdown({
      markdownContent: '# Top Heading\n\n## Sub Heading',
      rootHeadingLevel: 2,
    })

    // H1 -> H3, H2 -> H4
    expect(result).toContain('<h3')
    expect(result).toContain('Top Heading')
    expect(result).toContain('<h4')
    expect(result).toContain('Sub Heading')
    expect(result).not.toContain('<h1')
    expect(result).not.toContain('<h2')
  }, 15_000)

  it('strips "Markdown:" prefix from content strings', async () => {
    const result = await parseMarkdown({
      markdownContent: 'Markdown:Hello **world**',
      rootHeadingLevel: 1,
    })

    expect(result).not.toContain('Markdown:')
    expect(result).toContain('<strong>world</strong>')
  }, 15_000)

  it('renders code blocks with Shiki syntax highlighting', async () => {
    const result = await parseMarkdown({
      markdownContent: '```js\nconst x = 1;\n```',
      rootHeadingLevel: 1,
    })

    expect(result).toContain('<pre')
    expect(result).toContain('<code')
    // Shiki adds class attribute with language/theme info
    expect(result).toContain('shiki')
  }, 15_000)
})
