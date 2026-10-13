import pug from 'pug'
import { describe, expect, it } from 'vitest'
import { getMixinMarkerName, mixinMarkerPlugin } from '../../../../lib/pug/mixin-markers.ts'

function render(source: string, locals: Record<string, unknown> = {}) {
  return pug.compile(source, { plugins: [mixinMarkerPlugin] })(locals)
}

describe('getMixinMarkerName', () => {
  it('takes the last segment of mixinName, split into upper-case words', () => {
    expect(getMixinMarkerName('moleculeCard', 'molecules/Card')).toBe('CARD')
    expect(getMixinMarkerName('organismFileUpload', 'organisms/form/FileUpload')).toBe('FILE UPLOAD')
    expect(getMixinMarkerName('atomIcon', 'atoms/icon-sprite')).toBe('ICON SPRITE')
  })

  it('falls back to the mixin name', () => {
    expect(getMixinMarkerName('linkList')).toBe('LINK LIST')
  })
})

describe('mixinMarkerPlugin', () => {
  const card = [
    'mixin card(props)',
    '  - var mixinName = \'molecules/Card\'',
    '  -',
    '    var mixinSchema = z.object({})',
    '  article.card',
    '    block',
  ].join('\n')

  it('wraps the output of a mixin with a schema in START and END comments', () => {
    expect(render(`${card}\n+card({})\n  p Text`, { z: { object: () => ({}) } }))
      .toBe('<!-- START CARD--><article class="card"><p>Text</p></article><!-- END CARD-->')
  })

  it('leaves mixins without a schema alone', () => {
    expect(render('mixin icon(name)\n  i= name\n+icon(\'plus\')')).toBe('<i>plus</i>')
  })

  it('keeps the markers of a mixin that writes its own', () => {
    const own = card.replace('  article.card', '  // START CARD\n  article.card').concat('\n  // END CARD')
    expect(render(`${own}\n+card({})`, { z: { object: () => ({}) } }))
      .toBe('<!-- START CARD--><article class="card"></article><!-- END CARD-->')
  })

  it('marks every call, also of a mixin inside another one', () => {
    const tag = 'mixin tag(props)\n  -\n    var mixinSchema = z.object({})\n  span.tag'
    expect(render(`${tag}\n${card}\n+card({})\n  +tag({})\n  +tag({})`, { z: { object: () => ({}) } }))
      .toBe('<!-- START CARD--><article class="card"><!-- START TAG--><span class="tag"></span><!-- END TAG--><!-- START TAG--><span class="tag"></span><!-- END TAG--></article><!-- END CARD-->')
  })

  describe('defineComponent', () => {
    const button = [
      'mixin atomButton(props)',
      '  -',
      '    const p = defineComponent({',
      '      name: \'atoms/IconButton\',',
      '      schema: z.object({}),',
      '    }, props)',
      '',
      '  button= p.label',
    ].join('\n')
    const locals = { z: { object: () => ({}) }, defineComponent: (_definition: unknown, props: unknown) => props }

    it('takes the marker name from the name literal', () => {
      expect(render(`${button}\n+atomButton({ label: 'Go' })`, locals))
        .toBe('<!-- START ICON BUTTON--><button>Go</button><!-- END ICON BUTTON-->')
    })

    it('falls back to the mixin name without a name literal', () => {
      const source = 'mixin linkList(props)\n  - defineComponent({ schema: z.object({}) }, props || {})\n  ul'
      expect(render(`${source}\n+linkList()`, locals)).toBe('<!-- START LINK LIST--><ul></ul><!-- END LINK LIST-->')
    })

    it('passes the Pug mixin name to defineComponent', () => {
      const contexts: unknown[] = []
      function defineComponent(this: unknown, _definition: unknown, props: unknown) {
        contexts.push(this)
        return props
      }
      render(`${button}\n+atomButton({ label: 'Go' })`, { ...locals, defineComponent })
      expect(contexts).toEqual([{ mixin: 'atomButton' }])
    })

    it('passes the mixin name also when the mixin writes its own markers', () => {
      const own = button.replace('  button= p.label', '  // START BUTTON\n  button= p.label')
      const contexts: unknown[] = []
      function defineComponent(this: unknown, _definition: unknown, props: unknown) {
        contexts.push(this)
        return props
      }
      expect(render(`${own}\n+atomButton({ label: 'Go' })`, { ...locals, defineComponent })).toBe('<!-- START BUTTON--><button>Go</button>')
      expect(contexts).toEqual([{ mixin: 'atomButton' }])
    })
  })
})
