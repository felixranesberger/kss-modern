import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../lib/markdown/index.ts'

const fixturesDir = path.resolve('tests/fixtures/markdown')

describe('markdown rendering pipeline', () => {
  it('renders basic markdown to HTML', async () => {
    const result = await parseMarkdown({
      markdownContent: 'Hello **world**',
      rootHeadingLevel: 1,
    })
    expect(result).toContain('<strong>world</strong>')
    expect(result).toContain('Hello')
  }, 30_000)

  it('renders markdown file', async () => {
    const result = await parseMarkdown({
      filePath: path.join(fixturesDir, 'sample.md'),
      rootHeadingLevel: 1,
    })
    expect(result).toContain('<strong>sample</strong>')
    expect(result).toContain('List item 1')
    expect(result).toContain('List item 2')
    expect(result).toContain('href="https://example.com"')
  }, 30_000)

  it('renders markdown with alert component', async () => {
    const result = await parseMarkdown({
      filePath: path.join(fixturesDir, 'with-components.md'),
      rootHeadingLevel: 1,
    })
    expect(result).toContain('info')
    expect(result).toContain('Note')
    expect(result).toContain('This is an info alert')
  }, 30_000)

  it('renders markdown with accordion component', async () => {
    const result = await parseMarkdown({
      filePath: path.join(fixturesDir, 'with-components.md'),
      rootHeadingLevel: 1,
    })
    expect(result).toContain('FAQ')
    expect(result).toContain('accordion')
    expect(result).toContain('This is the accordion content')
  }, 30_000)

  it('code blocks get syntax highlighting', async () => {
    const result = await parseMarkdown({
      markdownContent: '```javascript\nconst x = 1;\n```',
      rootHeadingLevel: 1,
    })
    expect(result).toContain('shiki')
    expect(result).toContain('const')
  }, 30_000)

  it('heading levels are shifted correctly', async () => {
    const result = await parseMarkdown({
      filePath: path.join(fixturesDir, 'with-headings.md'),
      rootHeadingLevel: 2,
    })
    // with-headings.md has h1 (#) and rootHeadingLevel=2, so h1 shifts to h3, h2 to h4, h3 to h5
    expect(result).not.toContain('<h1')
    expect(result).not.toContain('<h2')
    expect(result).toContain('<h3')
    expect(result).toContain('<h4')
    expect(result).toContain('<h5')
  }, 30_000)
})
