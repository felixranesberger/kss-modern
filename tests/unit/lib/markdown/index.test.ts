import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearMarkdownCache, getMarkdownCacheStats, parseMarkdown } from '../../../../lib/markdown/index'

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

describe('parseMarkdown render cache', () => {
  beforeEach(() => {
    clearMarkdownCache()
  })

  it('re-renders identical content from cache without a second render pass', async () => {
    // A code fence forces the expensive Shiki path — exactly what a structural rebuild must not redo.
    const content = 'Cached **body**\n\n```ts\nconst x: number = 1\n```'

    const first = await parseMarkdown({ markdownContent: content, rootHeadingLevel: 1 })
    const cold = getMarkdownCacheStats()
    expect(cold.misses).toBe(1)
    expect(cold.hits).toBe(0)

    const second = await parseMarkdown({ markdownContent: content, rootHeadingLevel: 1 })
    const warm = getMarkdownCacheStats()

    // identical output, served from cache — no extra render (misses unchanged, one new hit)
    expect(second).toBe(first)
    expect(warm.misses).toBe(1)
    expect(warm.hits).toBe(1)
    expect(warm.size).toBe(1)
  }, 15_000)

  it('treats changed content as a fresh render (content is the cache key)', async () => {
    await parseMarkdown({ markdownContent: 'one', rootHeadingLevel: 1 })
    await parseMarkdown({ markdownContent: 'two', rootHeadingLevel: 1 })

    const stats = getMarkdownCacheStats()
    expect(stats.misses).toBe(2)
    expect(stats.hits).toBe(0)
    expect(stats.size).toBe(2)
  }, 15_000)

  it('keys on the post heading-shift source, so the same content at different levels renders once each', async () => {
    // '# Heading' shifts to H2 at level 1 and H3 at level 2 — different final source, different cache slots.
    await parseMarkdown({ markdownContent: '# Heading', rootHeadingLevel: 1 })
    await parseMarkdown({ markdownContent: '# Heading', rootHeadingLevel: 2 })
    expect(getMarkdownCacheStats().misses).toBe(2)

    // but content with no headings shifts to itself at either level, so it shares one cache entry
    clearMarkdownCache()
    await parseMarkdown({ markdownContent: 'no headings here', rootHeadingLevel: 1 })
    await parseMarkdown({ markdownContent: 'no headings here', rootHeadingLevel: 2 })
    const stats = getMarkdownCacheStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
  }, 15_000)

  it('caches identical file-based descriptions across builds', async () => {
    const args = { filePath: path.join(fixturesDir, 'sample.md'), rootHeadingLevel: 1 } as const

    const first = await parseMarkdown(args)
    const second = await parseMarkdown(args)

    expect(second).toBe(first)
    const stats = getMarkdownCacheStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
  }, 15_000)

  it('clear() resets counters and cached sources', async () => {
    await parseMarkdown({ markdownContent: 'anything', rootHeadingLevel: 1 })
    clearMarkdownCache()
    expect(getMarkdownCacheStats()).toEqual({ hits: 0, misses: 0, size: 0 })
  }, 15_000)
})
