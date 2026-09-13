import type { PreviewTheme, ResolvedStyleguideConfiguration } from '../../../lib/index.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `warnDeprecatedOption` warns once per process, so the module graph is rebuilt per test to get a
// fresh "already warned" set — including the logger, which has to be the very instance the
// freshly imported lib/index.ts writes to.
async function importResolver() {
  vi.resetModules()
  const [{ resolveConfiguration }, { logger }] = await Promise.all([
    import('../../../lib/index.ts'),
    import('../../../lib/logger.ts'),
  ])
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  return { resolveConfiguration, warn }
}

const base: Omit<ResolvedStyleguideConfiguration, 'brandColor' | 'previewThemes'> = {
  mode: 'production',
  outDir: 'styleguide-export',
  contentDir: 'example-styleguide/',
  projectTitle: 'Test Styleguide',
  html: { lang: 'en', assets: { css: [], js: [] } },
}

const themes: PreviewTheme[] = [{ value: '.theme-midnight', label: 'Midnight' }]

describe('resolveConfiguration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('passes the current names through untouched, without warning', async () => {
    const { resolveConfiguration: resolve, warn } = await importResolver()

    const resolved = resolve({ ...base, brandColor: '#3F5E5A', previewThemes: themes })

    expect(resolved.brandColor).toBe('#3F5E5A')
    expect(resolved.previewThemes).toEqual(themes)
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts the deprecated `theme` as the brand colour and warns once', async () => {
    const { resolveConfiguration: resolve, warn } = await importResolver()

    const config = { ...base, theme: { light: '#005075', dark: '#ffffff' } }
    expect(resolve(config).brandColor).toEqual({ light: '#005075', dark: '#ffffff' })

    resolve(config)
    resolve(config)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('`theme` is deprecated')
    expect(warn.mock.calls[0][0]).toContain('`brandColor`')
  })

  it('accepts the deprecated `themes` as the preview themes and warns once', async () => {
    const { resolveConfiguration: resolve, warn } = await importResolver()

    expect(resolve({ ...base, brandColor: '#3F5E5A', themes }).previewThemes).toEqual(themes)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('`themes` is deprecated')
    expect(warn.mock.calls[0][0]).toContain('`previewThemes`')
  })

  it('warns once per deprecated option, not once per call', async () => {
    const { resolveConfiguration: resolve, warn } = await importResolver()

    resolve({ ...base, theme: '#3F5E5A', themes })

    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('lets the current name win when both are given', async () => {
    const { resolveConfiguration: resolve } = await importResolver()

    const resolved = resolve({
      ...base,
      brandColor: '#111111',
      theme: '#222222',
      previewThemes: themes,
      themes: [],
    } as never)

    expect(resolved.brandColor).toBe('#111111')
    expect(resolved.previewThemes).toEqual(themes)
  })

  it('drops the deprecated keys from the resolved configuration', async () => {
    const { resolveConfiguration: resolve } = await importResolver()

    const resolved = resolve({ ...base, theme: '#3F5E5A', themes })

    expect('theme' in resolved).toBe(false)
    expect('themes' in resolved).toBe(false)
  })

  it('defaults the preview themes to an empty list', async () => {
    const { resolveConfiguration: resolve } = await importResolver()
    expect(resolve({ ...base, brandColor: '#3F5E5A' }).previewThemes).toEqual([])
  })

  it('is idempotent, so every entry point can resolve without re-warning', async () => {
    const { resolveConfiguration: resolve, warn } = await importResolver()

    const once = resolve({ ...base, theme: '#3F5E5A', themes })
    warn.mockClear()

    expect(resolve(once)).toEqual(once)
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports a configuration with no brand colour under either name', async () => {
    const { resolveConfiguration: resolve } = await importResolver()
    expect(() => resolve({ ...base } as never)).toThrow(/brandColor/)
  })
})
