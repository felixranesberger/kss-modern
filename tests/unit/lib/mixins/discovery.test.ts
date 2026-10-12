import { describe, expect, it } from 'vitest'
import { discoverMixins } from '../../../../lib/mixins/discovery.ts'
import { getMixinPath } from '../../../../lib/mixins/types.ts'

describe('discoverMixins', () => {
  it('finds a mixin with its raw args and line', () => {
    const source = '//- comment\nmixin progress(value, label = \'Done\')\n  progress(value=value)= label\n'

    expect(discoverMixins(source, 'progress.pug')).toEqual([
      { name: 'progress', args: 'value, label = \'Done\'', line: 2, schemaSource: undefined },
    ])
  })

  it('reports a mixin without parentheses with null args', () => {
    expect(discoverMixins('mixin divider\n  hr\n', 'divider.pug')[0].args).toBeNull()
  })

  it('extracts the mixinSchema code block', () => {
    const source = [
      'mixin button(props)',
      '  -',
      '    var mixinSchema = z.object({ label: z.string() })',
      '  - const p = mixinSchema.parse(props)',
      '  button= p.label',
    ].join('\n')

    const [mixin] = discoverMixins(source, 'button.pug')
    expect(mixin.schemaSource).toContain('var mixinSchema = z.object({ label: z.string() })')
    expect(mixin.schemaSource).not.toContain('parse(props)')
  })

  it('reads the explorer path from a mixinName string literal', () => {
    const source = 'mixin button(props)\n  - var mixinName = \'atoms/Button\'\n  button\nmixin computed(props)\n  - const mixinName = prefix + \'/x\'\n  span\n'
    const [button, computed] = discoverMixins(source, 'button.pug')

    expect(button.mixinName).toBe('atoms/Button')
    // only a plain literal is read; the build never runs template code
    expect(computed.mixinName).toBeUndefined()
  })

  it('splits mixinName into explorer folders', () => {
    expect(getMixinPath('button', 'atoms/ forms /Button')).toEqual(['atoms', 'forms', 'Button'])
    expect(getMixinPath('button', undefined)).toEqual(['button'])
    expect(getMixinPath('button', '/')).toEqual(['button'])
  })

  it('does not take a schema-like line that only reads mixinSchema', () => {
    const source = 'mixin button(props)\n  - const p = mixinSchema.parse(props)\n  button= p.label\n'
    expect(discoverMixins(source, 'button.pug')[0].schemaSource).toBeUndefined()
  })

  it('ignores mixins defined inside other mixins or conditionals', () => {
    const source = [
      'mixin outer(props)',
      '  mixin inner(props)',
      '    -',
      '      var mixinSchema = z.object({})',
      '    span',
      '  div',
      'if true',
      '  mixin conditional()',
      '    span',
    ].join('\n')

    const mixins = discoverMixins(source, 'nested.pug')
    expect(mixins.map(mixin => mixin.name)).toEqual(['outer'])
    // the inner mixin's schema does not belong to the outer one
    expect(mixins[0].schemaSource).toBeUndefined()
  })

  it('skips mixin calls and files without mixins', () => {
    expect(discoverMixins('include _button\n+button({ label: \'x\' })\n', 'page.pug')).toEqual([])
    expect(discoverMixins('div.hero\n  h1 Hello\n', 'hero.pug')).toEqual([])
  })

  it('throws on a source that does not parse', () => {
    expect(() => discoverMixins('mixin broken(\n  div\n', 'broken.pug')).toThrow()
  })
})
