import type { MixinManifestEntry } from '../../../../lib/mixins/types.ts'
import { describe, expect, it } from 'vitest'
import { getJsonSchemaFiles } from '../../../../lib/mixins/json-schema-export.ts'

function entry(overrides: Partial<MixinManifestEntry>): MixinManifestEntry {
  return { id: 'x', name: 'x', path: ['x'], args: 'props', file: 'x.pug', line: 1, hasSchema: true, jsonSchema: { type: 'object' }, ...overrides }
}

describe('getJsonSchemaFiles', () => {
  it('places each schema in the folders of the explorer path', () => {
    const files = getJsonSchemaFiles({ mixins: [
      entry({ id: 'button', path: ['atoms', 'Button'] }),
      entry({ id: 'badge', path: ['badge'] }),
    ] })
    expect([...files.keys()]).toEqual(['atoms/Button.json', 'badge.json'])
  })

  it('skips mixins without a usable schema', () => {
    const files = getJsonSchemaFiles({ mixins: [entry({ hasSchema: false, jsonSchema: undefined, schemaError: 'nope' })] })
    expect(files.size).toBe(0)
  })

  it('suffixes a path taken twice', () => {
    const files = getJsonSchemaFiles({ mixins: [entry({ id: 'a', path: ['atoms', 'Button'] }), entry({ id: 'b', path: ['atoms', 'Button'] })] })
    expect([...files.keys()]).toEqual(['atoms/Button.json', 'atoms/Button-2.json'])
  })

  it('keeps every file inside the directory', () => {
    const files = getJsonSchemaFiles({ mixins: [
      entry({ id: 'evil', path: ['..', '..', 'etc', 'pass:wd'] }),
      entry({ id: 'dots', path: ['.', '..'] }),
    ] })
    expect([...files.keys()]).toEqual(['etc/pass-wd.json', 'dots.json'])
  })
})
