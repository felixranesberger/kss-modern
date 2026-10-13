import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ComponentPropsError, defineComponent, formatComponentPropsError, formatIssuePath } from '../../../../lib/mixins/define-component.ts'

const definition = {
  name: 'atoms/Button',
  schema: z.strictObject({
    label: z.string().min(1),
    variant: z.enum(['primary', 'ghost']).default('primary'),
    links: z.array(z.strictObject({ href: z.string() })).optional(),
  }),
}

describe('defineComponent', () => {
  it('returns the parsed props, defaults applied', () => {
    expect(defineComponent(definition, { label: 'Save' })).toEqual({ label: 'Save', variant: 'primary' })
  })

  it('throws one line per issue, with the component name', () => {
    expect(() => defineComponent(definition, { label: '', variant: 'loud' })).toThrow(
      /^atoms\/Button: label: Too small: expected string to have >=1 characters\natoms\/Button: variant: Invalid option: expected one of "primary"\|"ghost"$/,
    )
  })

  it('names the Pug mixin when the marker plugin passes it', () => {
    expect(() => defineComponent.call({ mixin: 'atomButton' }, definition, {}))
      .toThrow(/^atoms\/Button \(\+atomButton\): label: Invalid input/)
  })

  it('attaches the zod issues, so the playground maps them to its controls', () => {
    try {
      defineComponent(definition, { label: 'x', links: [{ href: 1 }] })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(ComponentPropsError)
      expect((error as ComponentPropsError).issues).toEqual([expect.objectContaining({ path: ['links', 0, 'href'] })])
      expect((error as Error).message).toMatch(/^atoms\/Button: links\[0\]\.href: /)
    }
  })

  it('reports an issue with the props object itself without a path', () => {
    expect(() => defineComponent(definition, undefined)).toThrow(/^atoms\/Button: Invalid input: expected object, received undefined$/)
  })

  it('rejects a definition without a zod schema', () => {
    expect(() => defineComponent.call({ mixin: 'atomButton' }, { name: 'atoms/Button' } as never, {}))
      .toThrow(new TypeError('atoms/Button (+atomButton): `schema` must be a zod schema'))
  })
})

describe('formatComponentPropsError', () => {
  it('falls back to the mixin name, then to defineComponent', () => {
    const issues = [{ path: ['label'], message: 'Required' }]
    expect(formatComponentPropsError(issues, undefined, 'atomButton')).toBe('(+atomButton): label: Required')
    expect(formatComponentPropsError(issues)).toBe('defineComponent: label: Required')
  })

  it('formats paths with dots and indexes', () => {
    expect(formatIssuePath(['items', 2, 'title'])).toBe('items[2].title')
    expect(formatIssuePath([])).toBe('')
  })
})
