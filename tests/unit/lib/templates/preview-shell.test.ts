import { beforeEach, describe, expect, it, vi } from 'vitest'

let capturedContent = ''
vi.mock('../../../../lib/utils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/utils.ts')>()
  return {
    ...actual,
    logicalWriteFile: vi.fn(async (_path: string, content: string) => {
      capturedContent = content
    }),
  }
})

const { generatePreviewFile } = await import('../../../../lib/templates/preview.ts')

function createShellData(overrides: Record<string, unknown> = {}) {
  return {
    filePath: '/out/preview-1.html',
    page: { title: 'Test Styleguide', lang: 'en' },
    css: [{ src: '/test/styles.css' }],
    js: [{ src: '/test/scripts.js' }],
    html: {
      header: '',
      sidebarMenu: '',
      mainContent: '',
      nextPageControls: '',
      search: '',
      codeAuditDialog: '',
      alerts: '',
      preloadIframes: [],
    },
    brandColor: '#3F5E5A',
    ...overrides,
  } as Parameters<typeof generatePreviewFile>[0]
}

describe('generatePreviewFile', () => {
  beforeEach(() => {
    capturedContent = ''
  })

  // The flag rides on the shell's <html> because the theme dropdowns read it from there
  // (`shouldReloadPreviews` in client/lib/preview-theme.ts).
  it('marks the shell for preview reloads when the option is on', async () => {
    await generatePreviewFile(createShellData({ reloadPreviewsOnThemeChange: true }))
    expect(capturedContent).toContain('<html lang="en" class="scroll-smooth" data-reload-previews-on-theme-change>')
  })

  it('leaves the shell unmarked by default and when the option is off', async () => {
    await generatePreviewFile(createShellData())
    expect(capturedContent).not.toContain('data-reload-previews-on-theme-change')

    await generatePreviewFile(createShellData({ reloadPreviewsOnThemeChange: false }))
    expect(capturedContent).not.toContain('data-reload-previews-on-theme-change')
  })

  it('renders the brand colour as the theme-color meta and the UI highlight', async () => {
    await generatePreviewFile(createShellData({ brandColor: { light: '#005075', dark: '#ffffff' } }))

    expect(capturedContent).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#005075">')
    expect(capturedContent).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#ffffff">')
    expect(capturedContent).toContain('--styleguide-color-theme-highlight: light-dark(#005075, #ffffff);')
  })
})
