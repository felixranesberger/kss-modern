import type { MixinManifest, MixinManifestEntry } from '../../../../lib/mixins/types.ts'
import { describe, expect, it } from 'vitest'
import { getPublicMixinUsage, renderMixinUsage } from '../../../../lib/templates/mixin-usage.ts'

function entry(name: string, path: string[]): MixinManifestEntry {
  return { id: name, name, path, args: 'props', file: `${name}.pug`, line: 1, hasSchema: true }
}

const manifest: MixinManifest = { mixins: [entry('card', ['organisms', 'Card']), entry('button', ['atoms', 'Button'])] }

describe('getPublicMixinUsage', () => {
  it('lifts public mixins out of internal ones and merges repeated calls', () => {
    const usage = getPublicMixinUsage([
      {
        name: 'card',
        count: 1,
        children: [
          { name: 'actions', count: 1, children: [{ name: 'button', count: 2, children: [{ name: 'icon', count: 2, children: [] }] }] },
          { name: 'button', count: 1, children: [] },
        ],
      },
      { name: 'icon', count: 4, children: [] },
    ], manifest)

    expect(usage.map(item => [item.entry.id, item.count, item.children.map(child => [child.entry.id, child.count])]))
      .toEqual([['card', 1, [['button', 3]]]])
  })
})

describe('renderMixinUsage', () => {
  it('links every public mixin to the explorer', () => {
    const html = renderMixinUsage([{ name: 'card', count: 1, children: [{ name: 'button', count: 2, children: [] }] }], manifest)
    expect(html).toContain('Show mixins (2)')
    expect(html).toContain('href="mixins.html#mixin=card"')
    expect(html).toContain('href="mixins.html#mixin=button"')
    expect(html).toContain('×2')
  })

  it('renders nothing without public mixins', () => {
    expect(renderMixinUsage([{ name: 'icon', count: 1, children: [] }], manifest)).toBe('')
    expect(renderMixinUsage(undefined, manifest)).toBe('')
  })
})
