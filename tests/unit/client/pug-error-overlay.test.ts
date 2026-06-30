import { beforeAll, describe, expect, it } from 'vitest'
import { definePugErrorOverlay } from '../../../client/lib/pug-error-overlay.ts'

/**
 * The overlay's value is in how it parses pug's code-frame message into a repaintable structure, so
 * these tests drive the real custom element (jsdom gives it a DOM) and assert the shadow tree it
 * builds: the frame for compile errors, the message-only fallback for frameless runtime errors, and
 * the invariant that an error string is only ever written via `textContent`.
 */

beforeAll(() => {
  definePugErrorOverlay()
})

/** Mount a `<pug-error-overlay>` with the given attributes and return its upgraded element. */
function render(attrs: { id?: string, file?: string, message: string }): HTMLElement {
  const element = document.createElement('pug-error-overlay')
  if (attrs.id != null)
    element.setAttribute('error-id', attrs.id)
  if (attrs.file != null)
    element.setAttribute('error-file', attrs.file)
  element.setAttribute('error-message', attrs.message)
  document.body.appendChild(element)
  return element
}

// A realistic pug parse error: the `file:line:col` header, a window of context lines with the failing
// one marked `>`, pug's dashed caret line, then the human message — exactly the shape pug-error emits.
const FRAME_MESSAGE = [
  '/abs/styleguide/components/button/button.pug:7:9',
  '',
  '    4|     span.c-button__label= label',
  '    5|     if icon',
  '    6|       svg.c-button__icon(aria-hidden="true"',
  '  > 7|         use(xlink:href=iconId)',
  '---------------^',
  '    8|     span.sr-only Loading',
  '',
  'unexpected token "indent", expected ")"',
].join('\n')

describe('pug error overlay — compile error with a code frame', () => {
  it('renders the frame, flags the failing line, and shows a caret', () => {
    const root = render({ id: 'components.button', file: '/abs/styleguide/components/button/button.pug', message: FRAME_MESSAGE }).shadowRoot!

    expect(root.querySelector('.eo-frame')).not.toBeNull()
    expect(root.querySelectorAll('.eo-row:not(.caret)')).toHaveLength(5)

    const errorRow = root.querySelector('.eo-row.err')!
    expect(errorRow.querySelector('.num')!.textContent).toBe('7')
    expect(root.querySelectorAll('.eo-row.caret')).toHaveLength(1)
  })

  it('uses the pug message as the title and the section id in the description', () => {
    const root = render({ id: 'components.button', message: FRAME_MESSAGE }).shadowRoot!

    expect(root.querySelector('.eo-title')!.textContent).toBe('unexpected token "indent", expected ")"')
    expect(root.querySelector('.eo-chip')!.textContent).toBe('components.button')
  })

  it('builds the header as `file (line:col) @ section`', () => {
    const root = render({ id: 'components.button', file: '/abs/styleguide/components/button/button.pug', message: FRAME_MESSAGE }).shadowRoot!

    expect(root.querySelector('.eo-fh-file')!.textContent).toBe('…/components/button/button.pug')
    expect(root.querySelector('.eo-fh-loc')!.textContent).toBe('(7:9)')
    expect(root.querySelector('.eo-fh-ctx')!.textContent).toBe('@ components.button')
  })

  it('omits the caret when the frame reports no column', () => {
    const noColumn = FRAME_MESSAGE
      .replace('button.pug:7:9', 'button.pug:7')
      .replace('---------------^\n', '')
    const root = render({ id: 'components.button', message: noColumn }).shadowRoot!

    expect(root.querySelector('.eo-fh-loc')!.textContent).toBe('(7)')
    expect(root.querySelectorAll('.eo-row.caret')).toHaveLength(0)
  })
})

describe('pug error overlay — frameless runtime error', () => {
  it('shows just the message and file for a single-line error, with no frame or raw block', () => {
    const root = render({
      id: 'components.card',
      file: '/abs/styleguide/components/card/card.pug',
      message: 'Cannot read properties of undefined (reading \'toUpperCase\')',
    }).shadowRoot!

    expect(root.querySelector('.eo-frame')).toBeNull()
    expect(root.querySelector('.eo-raw')).toBeNull()
    expect(root.querySelector('.eo-title')!.textContent).toBe('Cannot read properties of undefined (reading \'toUpperCase\')')
    expect(root.querySelector('.eo-file')!.textContent).toBe('…/components/card/card.pug')
  })

  it('keeps the raw block when a frameless message carries more than one line', () => {
    const root = render({ id: 'x', message: 'Boom\n  with detail' }).shadowRoot!

    expect(root.querySelector('.eo-frame')).toBeNull()
    expect(root.querySelector('.eo-title')!.textContent).toBe('Boom')
    expect(root.querySelector('.eo-raw')!.textContent).toBe('Boom\n  with detail')
  })
})

describe('pug error overlay — safety', () => {
  it('never injects markup from the error message', () => {
    const root = render({ id: 'x', message: '<img src=x onerror="alert(1)"><script>boom()</script>' }).shadowRoot!

    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('.eo-title')!.textContent).toContain('<img src=x')
  })

  it('does not inject markup that appears inside a code-frame source line', () => {
    const message = [
      '/abs/x.pug:2:1',
      '    1| div',
      '  > 2|   <script>alert(1)</script>',
      'unexpected token',
    ].join('\n')
    const root = render({ id: 'x', message }).shadowRoot!

    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('.eo-row.err .lc')!.textContent).toContain('<script>alert(1)</script>')
  })
})
