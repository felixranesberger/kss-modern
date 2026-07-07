import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileMarkup } from '../../../../lib/pug/compile-core.ts'

// Self-contained fixtures for the `modifierClass` global Pug local. Importing compile-core installs
// the parse-cache patch; each file lives under its own temp dir so it can't collide with other suites.
const dir = path.resolve('tests/.tmp-modifier-class')
const contentDir = `${dir}/` as `${string}/`

describe('modifierClass global pug local', () => {
  beforeAll(async () => {
    await fs.mkdir(dir, { recursive: true })
    // a component that places the modifier via the variable instead of the literal token
    await fs.writeFile(path.join(dir, 'component.pug'), '.c-tabs(class=modifierClass)\n  span Tabs\n')
    // a parent that pulls a child in via `include` — both use the idiom
    await fs.writeFile(path.join(dir, '_child.pug'), '.c-child(class=modifierClass)\n')
    await fs.writeFile(path.join(dir, 'parent.pug'), '.c-tabs(class=modifierClass)\n  include _child.pug\n')
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('emits the {{modifier_class}} placeholder for a directly compiled section', async () => {
    // the bug: without the default local, `class=modifierClass` was undefined and rendered no class,
    // so the section's modifier previews silently fell back to the base state.
    const { html } = await compileMarkup(contentDir, 'development', 'component.pug', 'test.1')
    expect(html).toContain('class="c-tabs {{modifier_class}}"')
  })

  it('propagates the placeholder through `include` (modifier applies to every element carrying it)', async () => {
    // documented "given": include shares the local scope, so a child using the idiom also reacts to
    // the parent's modifier. Only place `class=modifierClass` where an element should react.
    const { html } = await compileMarkup(contentDir, 'development', 'parent.pug', 'test.2')
    expect(html).toContain('class="c-tabs {{modifier_class}}"')
    expect(html).toContain('class="c-child {{modifier_class}}"')
  })

  it('lets `<insert-vite-pug modifierClass="…">` bake a fixed class over the default', async () => {
    const markup = '<insert-vite-pug src="_child.pug" modifierClass="c-child--active"></insert-vite-pug>'
    const { html } = await compileMarkup(contentDir, 'development', markup, 'test.3')
    expect(html).toContain('class="c-child c-child--active"')
    expect(html).not.toContain('{{modifier_class}}')
  })
})
