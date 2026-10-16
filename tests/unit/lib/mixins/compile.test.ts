import { Buffer } from 'node:buffer'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { compileMixinModule } from '../../../../lib/mixins/compile.ts'
import { createUseId } from '../../../../lib/use-id.ts'

const fixtureDir = path.resolve('tests/fixtures/mixin-content/pug')

async function importModule(code: string): Promise<{ render: (locals: Record<string, unknown>) => string }> {
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

describe('compileMixinModule', () => {
  it('renders the mixin with its included mixins and top-level code', async () => {
    const { code } = compileMixinModule(path.join(fixtureDir, '_button.pug'), 'button')
    const { render } = await importModule(code)

    const html = render({ props: { label: 'Save', icon: 'disk' }, z, useId: createUseId('mixin-button') })
    expect(html).toBe('<!-- START BUTTON--><button class="btn btn--primary" id="id-mixin-button-btn"><svg class="icon" data-name="disk"></svg>Save</button><!-- END BUTTON-->')
  })

  it('drops top-level markup of the mixin file and of included files (postLink filter)', async () => {
    const { code } = compileMixinModule(path.join(fixtureDir, '_button.pug'), 'button')
    const { render } = await importModule(code)

    const html = render({ props: { label: 'Save' }, z, useId: createUseId('x') })
    expect(html).not.toContain('Top-level demo markup')
    expect(html).not.toContain('<h1')
    expect(html).not.toContain('<p')
  })

  it('throws the ZodError of invalid props', async () => {
    const { code } = compileMixinModule(path.join(fixtureDir, '_button.pug'), 'button')
    const { render } = await importModule(code)

    let error: unknown
    try {
      render({ props: { variant: 'x' }, z, useId: createUseId('x') })
    }
    catch (caught) {
      error = caught
    }
    const issues = (error as { issues: { path: string[], code: string }[] }).issues
    expect(issues.map(issue => `${issue.path.join('.')}:${issue.code}`)).toEqual(['label:invalid_type', 'variant:invalid_value'])
  })

  it('lists the mixin file and every include as dependencies', () => {
    const { dependencies } = compileMixinModule(path.join(fixtureDir, '_button.pug'), 'button')
    expect(dependencies).toEqual([path.join(fixtureDir, '_button.pug'), path.join(fixtureDir, '_icon.pug')])
  })

  it('stays small: no pug compiler in the module', () => {
    const { code } = compileMixinModule(path.join(fixtureDir, '_badge.pug'), 'badge')
    expect(code.length).toBeLessThan(6000)
    expect(code).toContain('export { render }')
  })
})
