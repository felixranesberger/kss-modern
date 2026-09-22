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

const { generateFullPageFile } = await import('../../../../lib/templates/fullpage.ts')

function createBaseData() {
  return {
    id: 'test-section',
    filePath: '/out/test.html',
    page: {
      title: 'Test Page',
      lang: 'en',
    },
    css: [
      { src: '/styles/main.css' },
    ] as { type?: 'regular' | 'overwriteStyleguide', src: string }[],
    js: [
      { src: '/scripts/main.js' },
    ] as { type?: 'regular' | 'overwriteStyleguide', src: string, additionalAttributes?: Record<string, string> }[],
    html: '<div>Hello</div>',
    brandColor: '#3F5E5A' as string | { light: string, dark: string },
    previewThemes: undefined as { value: string, label: string, css?: string[] }[] | undefined,
  }
}

describe('generateFullPageFile', () => {
  beforeEach(() => {
    capturedContent = ''
  })

  it('generates valid HTML5 starting with <!DOCTYPE html>', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toMatch(/^<!DOCTYPE html>/)
  })

  it('has correct lang attribute', async () => {
    const data = createBaseData()
    data.page.lang = 'de'
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<html lang="de"')
  })

  it('sanitizes and sets the title', async () => {
    const data = createBaseData()
    data.page.title = 'Test <script>'
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<title>Test &lt;script&gt;</title>')
  })

  it('marks the page as noindex by default', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toContain('<meta name="robots" content="noindex, nofollow">')
  })

  it('marks the page as indexable when allowSearchEngineIndexing is set', async () => {
    await generateFullPageFile({ ...createBaseData(), allowSearchEngineIndexing: true })
    expect(capturedContent).toContain('<meta name="robots" content="index, follow">')
  })

  it('includes viewport meta tag', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
  })

  it('includes CSS assets as link tags filtering out overwriteStyleguide', async () => {
    const data = createBaseData()
    data.css = [
      { src: '/styles/main.css' },
      { type: 'overwriteStyleguide', src: '/styles/override.css' },
      { src: '/styles/extra.css' },
    ]
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<link rel="stylesheet" type="text/css" href="/styles/main.css">')
    expect(capturedContent).toContain('<link rel="stylesheet" type="text/css" href="/styles/extra.css">')
    expect(capturedContent).not.toContain('override.css')
  })

  it('includes JS assets as script tags filtering out overwriteStyleguide', async () => {
    const data = createBaseData()
    data.js = [
      { src: '/scripts/main.js' },
      { type: 'overwriteStyleguide', src: '/scripts/override.js' },
      { src: '/scripts/extra.js' },
    ]
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<script src="/scripts/main.js" ></script>')
    expect(capturedContent).toContain('<script src="/scripts/extra.js" ></script>')
    expect(capturedContent).not.toContain('override.js')
  })

  it('renders additional attributes on JS script tags', async () => {
    const data = createBaseData()
    data.js = [
      { src: '/scripts/main.js', additionalAttributes: { 'defer': 'true', 'data-module': 'app' } },
    ]
    await generateFullPageFile(data)
    expect(capturedContent).toContain('defer="true"')
    expect(capturedContent).toContain('data-module="app"')
  })

  it('adds htmlclass to html element when provided', async () => {
    const data = createBaseData()
    data.page = { ...data.page, htmlclass: 'custom-html-class' }
    await generateFullPageFile(data as any)
    expect(capturedContent).toContain('class="scroll-smooth custom-html-class"')
  })

  it('does not add class to html element when htmlclass is not provided', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toMatch(/<html lang="en" data-styleguide-dark-mode="true">/)
    expect(capturedContent).not.toContain('scroll-smooth')
  })

  it('marks the fullpage as dark-mode capable by default', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toContain('data-styleguide-dark-mode="true"')
  })

  it('marks the fullpage as light-only when deactivateDarkMode is set', async () => {
    const data = { ...createBaseData(), deactivateDarkMode: true }
    await generateFullPageFile(data)
    expect(capturedContent).toContain('data-styleguide-dark-mode="false"')
  })

  it('marks an object (light/dark) theme as dark-mode capable', async () => {
    const data = { ...createBaseData(), theme: { light: '#fff', dark: '#000' } }
    await generateFullPageFile(data)
    expect(capturedContent).toContain('data-styleguide-dark-mode="true"')
  })

  it('gates dark mode on deactivateDarkMode, not on the theme shape', async () => {
    const data = { ...createBaseData(), theme: { light: '#fff', dark: '#000' }, deactivateDarkMode: true }
    await generateFullPageFile(data)
    expect(capturedContent).toContain('data-styleguide-dark-mode="false"')
  })

  it('sets the dark-mode flag alongside an htmlclass', async () => {
    const data = createBaseData()
    data.page = { ...data.page, htmlclass: 'custom' }
    await generateFullPageFile(data as any)
    expect(capturedContent).toMatch(/<html lang="en" class="scroll-smooth custom" data-styleguide-dark-mode="true">/)
  })

  it('adds bodyclass to body element when provided', async () => {
    const data = createBaseData()
    data.page = { ...data.page, bodyclass: 'custom-body-class' }
    await generateFullPageFile(data as any)
    expect(capturedContent).toContain('<body class="custom-body-class">')
  })

  it('does not add class to body element when bodyclass is not provided', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toMatch(/<body>/)
  })

  it('renders theme-color meta tag for string theme', async () => {
    const data = createBaseData()
    data.brandColor = '#FF0000'
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<meta name="theme-color" content="#FF0000">')
  })

  it('renders favicon link and per-color-scheme theme-color for object theme (light/dark)', async () => {
    const data = createBaseData()
    data.brandColor = { light: '#FFFFFF', dark: '#000000' }
    await generateFullPageFile(data)
    expect(capturedContent).toContain('href="/styleguide-assets/favicon/fullpage.svg"')
    expect(capturedContent).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF">')
    expect(capturedContent).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">')
  })

  it('includes og:image meta when ogImageUrl is provided', async () => {
    const data = { ...createBaseData(), ogImageUrl: 'https://example.com/og.png' }
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<meta property="og:image" content="https://example.com/og.png">')
  })

  it('does not include og:image meta when ogImageUrl is not provided', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).not.toContain('og:image')
  })

  it('includes fullpage JS script tag', async () => {
    await generateFullPageFile(createBaseData())
    expect(capturedContent).toContain('<script type="module" src="/styleguide-assets/__STYLEGUIDE_FULLPAGE_JS__"></script>')
  })
})

describe('themed stylesheets', () => {
  const themes = [
    { value: '.theme-midnight', label: 'Midnight', css: ['/themes/midnight.css'] },
    { value: '.theme-a.compact', label: 'A', css: ['/themes/a.css', '/themes/compact.css'] },
    { value: '.theme-plain', label: 'Plain' },
  ]

  it('emits one inert link per themed stylesheet, keyed on the theme class list', async () => {
    const data = createBaseData()
    data.previewThemes = themes
    await generateFullPageFile(data)

    expect(capturedContent).toContain('<link rel="stylesheet" type="text/css" href="/themes/midnight.css" media="not all" data-theme-css="theme-midnight">')
    expect(capturedContent).toContain('<link rel="stylesheet" type="text/css" href="/themes/a.css" media="not all" data-theme-css="theme-a compact">')
    expect(capturedContent).toContain('<link rel="stylesheet" type="text/css" href="/themes/compact.css" media="not all" data-theme-css="theme-a compact">')
  })

  it('layers themed stylesheets after the regular ones', async () => {
    const data = createBaseData()
    data.previewThemes = themes
    await generateFullPageFile(data)

    expect(capturedContent.indexOf('/styles/main.css')).toBeLessThan(capturedContent.indexOf('/themes/midnight.css'))
  })

  it('emits nothing for a theme without css, or without configured themes', async () => {
    const data = createBaseData()
    data.previewThemes = themes
    await generateFullPageFile(data)
    expect(capturedContent).not.toContain('theme-plain')

    await generateFullPageFile(createBaseData())
    expect(capturedContent).not.toContain('data-theme-css')
  })

  it('does not disturb the regular stylesheets', async () => {
    const data = createBaseData()
    data.previewThemes = themes
    await generateFullPageFile(data)
    expect(capturedContent).toContain('<link rel="stylesheet" type="text/css" href="/styles/main.css">')
  })
})
