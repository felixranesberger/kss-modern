import fs from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileMarkup, formatSourceCode } from '../../../../lib/pug/compile-core.ts'

// Whitespace next to inline elements changes how text wraps, so the rendered markup must be the same
// in development and production. Only the code views get the Biome-formatted copy.
const dir = path.resolve('tests/.tmp-source-code')
const contentDir = `${dir}/` as `${string}/`
const inlineLinks = 'Feldern der <a href="#">Europa</a>-, <a href="#">Sicherheits-</a> und <a href="#">Deutschlandpolitik</a>.'

describe('rendered markup and code view markup', () => {
  beforeAll(async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'text.pug'), `section\n  p!= '${inlineLinks}'\n  ul\n    li One\n    li Two\n`)
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('renders the same markup in development and production', async () => {
    const development = await compileMarkup(contentDir, 'development', 'text.pug', 'test.1')
    const production = await compileMarkup(contentDir, 'production', 'text.pug', 'test.1')
    expect(production.html).toBe(development.html)
    expect(production.html).toContain(inlineLinks)
    expect(production.html).toContain('<ul><li>One</li><li>Two</li></ul>')
  })

  it('formats only the copy for the code views', async () => {
    const { html } = await compileMarkup(contentDir, 'production', 'text.pug', 'test.2')
    const sourceCode = await formatSourceCode(html, 'test.2')
    expect(sourceCode).not.toBe(html)
    expect(sourceCode).toContain('\n')
  })
})
