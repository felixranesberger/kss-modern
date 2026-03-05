import type { in2SecondLevelSection, in2Section } from '../../../../lib/parser.ts'
import { describe, expect, it } from 'vitest'
import { createMinimalConfig } from '../../../fixtures/config.ts'

import {
  getAlerts,
  getCodeAuditDialog,
  getHeaderHtml,
  getMainContentHtml,
  getNextPageControlsHtml,
  getSearchHtml,
  getSidebarMenuHtml,
} from '../../../../lib/templates/preview.ts'

function createMockSection(overrides: Partial<in2Section> = {}): in2Section {
  return {
    id: '1.1',
    sectionLevel: 'third',
    header: 'Test Section',
    description: 'A test section',
    hasMarkdownDescription: false,
    markup: '',
    modifiers: [],
    source: {
      css: { file: 'test.scss', line: 10 },
    },
    previewFileName: 'preview-1-1.html',
    fullpageFileName: 'fullpage-1-1.html',
    ...overrides,
  }
}

function createMockSecondLevelSection(overrides: Partial<in2SecondLevelSection> = {}): in2SecondLevelSection {
  return {
    id: '1.1',
    sectionLevel: 'second',
    header: 'Parent Section',
    description: 'A parent section',
    hasMarkdownDescription: false,
    markup: '',
    modifiers: [],
    sections: [],
    source: {
      css: { file: 'test.scss', line: 1 },
    },
    previewFileName: 'preview-1-1.html',
    fullpageFileName: 'fullpage-1-1.html',
    ...overrides,
  }
}

describe('getHeaderHtml', () => {
  it('contains the project title', () => {
    const html = getHeaderHtml(createMinimalConfig())
    expect(html).toContain('Test Styleguide')
  })

  it('contains theme toggle fieldset', () => {
    const html = getHeaderHtml(createMinimalConfig())
    expect(html).toContain('Select a display theme')
  })

  it('contains search button with data-open-search', () => {
    const html = getHeaderHtml(createMinimalConfig())
    expect(html).toContain('data-open-search')
  })

  it('omits theme toggle when deactivateDarkMode is true', () => {
    const html = getHeaderHtml(createMinimalConfig({ deactivateDarkMode: true }))
    expect(html).not.toContain('Select a display theme')
  })
})

describe('getSidebarMenuHtml', () => {
  const sections = [
    {
      title: 'Components',
      items: [
        { label: 'Button', href: '/components/button.html' },
        { label: 'Input', href: '/components/input.html' },
      ],
    },
    {
      title: 'Utilities',
      items: [
        { label: 'Spacing', href: '/utilities/spacing.html', status: 'complete' },
      ],
    },
  ]

  it('renders section groups with titles', () => {
    const html = getSidebarMenuHtml(sections, '/components/button.html')
    expect(html).toContain('Components')
    expect(html).toContain('Utilities')
  })

  it('renders items with labels and hrefs', () => {
    const html = getSidebarMenuHtml(sections, '/other.html')
    expect(html).toContain('href="/components/button.html"')
    expect(html).toContain('>Button</a>')
    expect(html).toContain('href="/components/input.html"')
    expect(html).toContain('>Input</a>')
  })

  it('marks the active item with menu-item--active class', () => {
    const html = getSidebarMenuHtml(sections, '/components/button.html')
    expect(html).toContain('menu-item--active')
    expect(html).toContain('>Button</div>')
  })

  it('renders status badges when status is set', () => {
    const html = getSidebarMenuHtml(sections, '/other.html')
    expect(html).toContain('menu-item--status-complete')
  })

  it('renders status class for in-progress items', () => {
    const sectionsWithProgress = [
      {
        title: 'Group',
        items: [
          { label: 'Item', href: '/item.html', status: 'in-progress' },
        ],
      },
    ]
    const html = getSidebarMenuHtml(sectionsWithProgress, '/other.html')
    expect(html).toContain('menu-item--status-progress')
  })
})

describe('getSearchHtml', () => {
  const sections = [
    {
      title: 'Components',
      items: [
        {
          label: 'Button',
          href: '/components/button.html',
          searchKeywords: [{ keywords: ['btn', 'click'] }],
        },
      ],
    },
  ]

  it('contains #search-dialog element', () => {
    const html = getSearchHtml(sections)
    expect(html).toContain('id="search-dialog"')
  })

  it('contains search input', () => {
    const html = getSearchHtml(sections)
    expect(html).toContain('id="search-input"')
    expect(html).toContain('placeholder="Search..."')
  })

  it('contains keyword data', () => {
    const html = getSearchHtml(sections)
    expect(html).toContain('data-search-keywords')
    expect(html).toContain(encodeURIComponent(JSON.stringify([{ keywords: ['btn', 'click'] }])))
  })

  it('renders section titles', () => {
    const html = getSearchHtml(sections)
    expect(html).toContain('Components')
  })

  it('renders item labels and links', () => {
    const html = getSearchHtml(sections)
    expect(html).toContain('href="/components/button.html"')
    expect(html).toContain('Button')
  })
})

describe('getMainContentHtml', () => {
  it('renders section headers', () => {
    const section = createMockSecondLevelSection({
      header: 'My Component',
    })
    const html = getMainContentHtml(section, createMinimalConfig())
    expect(html).toContain('My Component')
  })

  it('renders iframe preview for sections with markup', () => {
    const childSection = createMockSection({
      id: '1.1.1',
      markup: '<button>Click me</button>',
      fullpageFileName: 'fullpage-1-1-1.html',
    })
    const section = createMockSecondLevelSection({
      sections: [childSection],
    })
    const html = getMainContentHtml(section, createMinimalConfig())
    expect(html).toContain('data-preview="true"')
    expect(html).toContain('src="/fullpage-1-1-1.html"')
  })

  it('renders color swatches for color sections', () => {
    const childSection = createMockSection({
      id: '1.1.2',
      colors: [
        { name: 'Primary', color: '#FF0000' },
        { name: 'Secondary', color: '#00FF00' },
      ],
    })
    const section = createMockSecondLevelSection({
      sections: [childSection],
    })
    const html = getMainContentHtml(section, createMinimalConfig())
    expect(html).toContain('background-color: #FF0000')
    expect(html).toContain('background-color: #00FF00')
  })

  it('renders icon grid for icon sections', () => {
    const childSection = createMockSection({
      id: '1.1.3',
      icons: [
        { name: 'arrow', svg: '<svg><path d="M0 0"/></svg>' },
        { name: 'check', svg: '<svg><path d="M1 1"/></svg>' },
      ],
    })
    const section = createMockSecondLevelSection({
      sections: [childSection],
    })
    const html = getMainContentHtml(section, createMinimalConfig())
    expect(html).toContain('icon-search')
    expect(html).toContain('arrow')
    expect(html).toContain('check')
  })

  it('displays source information in the code section', () => {
    const childSection = createMockSection({
      id: '1.1.4',
      markup: '<div>Test</div>',
      fullpageFileName: 'fullpage-1-1-4.html',
      source: {
        css: { file: 'components/button.scss', line: 42 },
      },
    })
    const section = createMockSecondLevelSection({
      sections: [childSection],
    })
    const html = getMainContentHtml(section, createMinimalConfig())
    expect(html).toContain('data-source-code')
  })
})

describe('getNextPageControlsHtml', () => {
  it('renders before link with correct href and label', () => {
    const html = getNextPageControlsHtml({
      before: { label: 'Previous Page', href: '/prev.html' },
    })
    expect(html).toContain('href="/prev.html"')
    expect(html).toContain('Previous Page')
    expect(html).toContain('Previous')
  })

  it('renders after link with correct href and label', () => {
    const html = getNextPageControlsHtml({
      after: { label: 'Next Page', href: '/next.html' },
    })
    expect(html).toContain('href="/next.html"')
    expect(html).toContain('Next Page')
    expect(html).toContain('Next')
  })

  it('renders both before and after links', () => {
    const html = getNextPageControlsHtml({
      before: { label: 'Prev', href: '/prev.html' },
      after: { label: 'Next', href: '/next.html' },
    })
    expect(html).toContain('href="/prev.html"')
    expect(html).toContain('href="/next.html"')
  })

  it('renders neither when both are undefined', () => {
    const html = getNextPageControlsHtml({})
    expect(html).not.toContain('href=')
    expect(html).toContain('<nav')
  })

  it('renders only before link when after is undefined', () => {
    const html = getNextPageControlsHtml({
      before: { label: 'Prev', href: '/prev.html' },
    })
    expect(html).toContain('href="/prev.html"')
    expect(html).toContain('id="styleguide-previous"')
    expect(html).not.toContain('id="styleguide-next"')
  })

  it('renders only after link when before is undefined', () => {
    const html = getNextPageControlsHtml({
      after: { label: 'Next', href: '/next.html' },
    })
    expect(html).not.toContain('id="styleguide-previous"')
    expect(html).toContain('id="styleguide-next"')
  })
})

describe('getCodeAuditDialog', () => {
  it('contains a dialog element with correct id', () => {
    const html = getCodeAuditDialog()
    expect(html).toContain('<dialog')
    expect(html).toContain('id="code-audit-dialog"')
  })

  it('contains audit results list', () => {
    const html = getCodeAuditDialog()
    expect(html).toContain('class="audit-results"')
  })
})

describe('getAlerts', () => {
  it('contains the alerts container', () => {
    const html = getAlerts()
    expect(html).toContain('id="alerts"')
  })
})
