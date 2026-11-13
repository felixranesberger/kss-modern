import pug from 'pug'
import { describe, expect, it } from 'vitest'
import { createMixinTrace, MIXIN_TRACE_LOCAL, mixinTracePlugin } from '../../../../lib/pug/mixin-trace.ts'

function trace(source: string, locals: Record<string, unknown> = {}) {
  const recorder = createMixinTrace()
  const html = pug.compile(source, { plugins: [mixinTracePlugin] })({ ...locals, [MIXIN_TRACE_LOCAL]: recorder })
  return { html, usage: recorder.read() }
}

const MIXINS = [
  'mixin icon(name)',
  '  i= name',
  'mixin button(label)',
  '  button',
  '    +icon(\'plus\')',
  '    = label',
  'mixin card()',
  '  article',
  '    block',
].join('\n')

describe('mixinTracePlugin', () => {
  it('records the calls as a tree and leaves the output alone', () => {
    const { html, usage } = trace(`${MIXINS}\n+button('Save')\n+button('Undo')`)

    expect(html).toBe('<button><i>plus</i>Save</button><button><i>plus</i>Undo</button>')
    expect(usage).toEqual([
      { name: 'button', count: 2, children: [{ name: 'icon', count: 2, children: [] }] },
    ])
  })

  it('nests calls in a block passed to a mixin under that mixin', () => {
    const { usage } = trace(`${MIXINS}\n+card\n  +button('Go')`)
    expect(usage).toEqual([
      { name: 'card', count: 1, children: [{ name: 'button', count: 1, children: [{ name: 'icon', count: 1, children: [] }] }] },
    ])
  })

  it('records only the calls that actually run', () => {
    const { usage } = trace(`${MIXINS}\nif show\n  +icon('x')\nelse\n  +button('y')`, { show: true })
    expect(usage.map(node => node.name)).toEqual(['icon'])
  })
})
