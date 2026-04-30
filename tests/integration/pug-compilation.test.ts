import { describe, expect, it, vi } from 'vitest'
import { compilePugMarkup } from '../../lib/vite-pug/index.ts'

describe('pug compilation pipeline', () => {
  it('returns map unchanged when no pug templates are present', async () => {
    const repository = new Map<string, { markup: string }>([
      ['1.1', { markup: '<div class="test">Hello</div>' }],
      ['1.2', { markup: '<p>Simple HTML</p>' }],
    ])

    const result = await compilePugMarkup('production', 'example-styleguide/', repository)

    expect(result.get('1.1')!.markup).toContain('Hello')
    expect(result.get('1.2')!.markup).toContain('Simple HTML')
    expect(result.size).toBe(2)
  })

  it('processes a map with plain HTML markup (no pug tags)', async () => {
    const markup = '<section><h2>Title</h2><p>Content</p></section>'
    const repository = new Map<string, { markup: string }>([
      ['2.1', { markup }],
    ])

    const result = await compilePugMarkup('production', 'example-styleguide/', repository)
    expect(result.get('2.1')).toBeDefined()
    // Markup should still contain the original content (possibly formatted)
    expect(result.get('2.1')!.markup).toContain('Title')
    expect(result.get('2.1')!.markup).toContain('Content')
  })

  it('returns empty map when given empty repository', async () => {
    const repository = new Map<string, { markup: string }>()
    const result = await compilePugMarkup('production', 'example-styleguide/', repository)
    expect(result.size).toBe(0)
  })

  it('does not mutate the original repository', async () => {
    const repository = new Map<string, { markup: string }>([
      ['3.1', { markup: '<div>Original</div>' }],
    ])

    const originalMarkup = repository.get('3.1')!.markup
    await compilePugMarkup('production', 'example-styleguide/', repository)
    expect(repository.get('3.1')!.markup).toBe(originalMarkup)
  })

  it('compiles real pug markup from test content directory', async () => {
    const repository = new Map<string, { markup: string }>([
      ['test.1', { markup: '<insert-vite-pug src="templates/source/02-elements/buttons.pug" modifierClass="{{modifier_class}}"></insert-vite-pug>' }],
    ])

    const result = await compilePugMarkup('production', 'example-styleguide/', repository)
    const output = result.get('test.1')!.markup
    // The pug template should have been compiled to HTML
    expect(output).not.toContain('<insert-vite-pug')
    expect(output.length).toBeGreaterThan(0)
  })

  it('reads a bare .html file path as the markup source', async () => {
    const repository = new Map<string, { markup: string }>([
      ['html.1', { markup: 'templates/source/03-components/badge.html' }],
    ])

    const result = await compilePugMarkup('production', 'example-styleguide/', repository)
    const output = result.get('html.1')!.markup

    expect(output).toContain('c-badge')
    expect(output).toContain('Success')
    expect(output).not.toContain('.html')
  })

  it('compiles a bare .pug file path statically (no vite-pug tags)', async () => {
    const repository = new Map<string, { markup: string }>([
      ['pug.1', { markup: 'templates/source/03-components/card.pug' }],
    ])

    const result = await compilePugMarkup('production', 'example-styleguide/', repository)
    const output = result.get('pug.1')!.markup

    // Should be HTML, not raw pug syntax
    expect(output).toContain('class="c-card"')
    expect(output).toContain('Card Title')
    expect(output).not.toMatch(/^article\.c-card/m)
    expect(output).not.toContain('.pug')
  })

  it('reports an error for a missing .pug file path', async () => {
    const repository = new Map<string, { markup: string }>([
      ['pug.missing', { markup: 'templates/does-not-exist.pug' }],
    ])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await compilePugMarkup('production', 'example-styleguide/', repository)

    // On error the worker pool drops the entry; the original repository value remains untouched
    expect(result.get('pug.missing')!.markup).toBe('templates/does-not-exist.pug')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
