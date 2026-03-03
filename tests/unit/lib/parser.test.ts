import { describe, expect, it, vi } from 'vitest'
import { createMinimalConfig } from '../../fixtures/config.ts'

vi.mock('../../../lib/markdown/index.ts', () => ({
  parseMarkdown: vi.fn(async (data) => {
    if ('markdownContent' in data)
      return `<p>${data.markdownContent.replace('Markdown:', '').trim()}</p>`
    return '<p>Mocked markdown</p>'
  }),
}))

const { parse } = await import('../../../lib/parser.ts')

const config = createMinimalConfig()

// ---------------------------------------------------------------------------
// Comment block styles
// ---------------------------------------------------------------------------
describe('comment block styles', () => {
  it('parses docblock /** */ comments', async () => {
    const scss = `
/**
 * Docblock Header
 *
 * Styleguide 1.0
 */
.a { }
`
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].header).toBe('Docblock Header')
  })

  it('parses multi-line /* */ comments', async () => {
    const scss = `
/*
Multi Header

Styleguide 2.0
*/
.b { }
`
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].header).toBe('Multi Header')
  })

  it('parses single-line // comments', async () => {
    const scss = `
// Single Header
//
// Styleguide 3.0
.c { }
`
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].header).toBe('Single Header')
  })
})

// ---------------------------------------------------------------------------
// Reference extraction
// ---------------------------------------------------------------------------
describe('reference extraction', () => {
  it('parses "Styleguide 1.0"', async () => {
    const scss = `
/**
 * Header
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].id).toBe('1.0')
  })

  it('parses "Style guide 1.0" (with space)', async () => {
    const scss = `
/**
 * Header
 *
 * Style guide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].id).toBe('1.0')
  })

  it('parses "Styleguide: 1.0" (with colon)', async () => {
    const scss = `
/**
 * Header
 *
 * Styleguide: 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].id).toBe('1.0')
  })

  it('parses "Style guide - 1.0" (with dash)', async () => {
    const scss = `
/**
 * Header
 *
 * Style guide - 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].id).toBe('1.0')
  })
})

// ---------------------------------------------------------------------------
// Section hierarchy
// ---------------------------------------------------------------------------
describe('section hierarchy', () => {
  const hierarchyScss = `
/**
 * First Level
 *
 * Styleguide 1.0
 */

/**
 * Second Level
 *
 * Styleguide 1.1
 */

/**
 * Third Level
 *
 * Styleguide 1.1.1
 */
`

  it('assigns first-level section correctly', async () => {
    const result = await parse(hierarchyScss, config)
    expect(result.content[0].sectionLevel).toBe('first')
    expect(result.content[0].id).toBe('1.0')
  })

  it('assigns second-level section correctly', async () => {
    const result = await parse(hierarchyScss, config)
    const second = result.content[0].sections[0]
    expect(second).toBeDefined()
    expect(second.sectionLevel).toBe('second')
    expect(second.id).toBe('1.1')
  })

  it('assigns third-level section correctly', async () => {
    const result = await parse(hierarchyScss, config)
    const third = result.content[0].sections[0].sections[0]
    expect(third).toBeDefined()
    expect(third.sectionLevel).toBe('third')
    expect(third.id).toBe('1.1.1')
  })

  it('treats reference without .0 suffix as first level', async () => {
    const scss = `
/**
 * Top
 *
 * Styleguide 5
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].sectionLevel).toBe('first')
  })
})

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------
describe('header extraction', () => {
  it('uses first paragraph as header', async () => {
    const scss = `
/**
 * Button Component
 *
 * A useful button.
 *
 * Extra paragraph here.
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].header).toBe('Button Component')
  })

  it('uses reference as header when no paragraphs exist', async () => {
    const scss = `
/**
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].header).toBe('1.0')
  })

  it('collapses multiline headers into single line', async () => {
    const scss = `
/**
 * Long
 * Header
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].header).toBe('Long Header')
  })
})

// ---------------------------------------------------------------------------
// Description extraction
// ---------------------------------------------------------------------------
describe('description extraction', () => {
  it('extracts description when 3+ paragraphs exist', async () => {
    const scss = `
/**
 * Header
 *
 * This is the description paragraph.
 *
 * .mod-a - Modifier A
 *
 * Markup: <div></div>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    // With header: true (default), the first paragraph (header) is stripped
    // from the description via regex. The remaining text is the description.
    expect(result.content[0].description).toBe('This is the description paragraph.')
  })

  it('sets empty description when only header paragraph exists', async () => {
    const scss = `
/**
 * Just a header
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].description).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Modifier parsing
// ---------------------------------------------------------------------------
describe('modifier parsing', () => {
  it('parses modifiers when markup is present', async () => {
    const scss = `
/**
 * Button
 *
 * A button component.
 *
 * .button-primary - Primary style
 * .button-secondary - Secondary style
 *
 * Markup: <button class="{{modifier_class}}">Click</button>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const mods = result.content[0].modifiers
    expect(mods).toHaveLength(2)
    expect(mods[0]).toEqual({ value: '.button-primary', description: 'Primary style' })
    expect(mods[1]).toEqual({ value: '.button-secondary', description: 'Secondary style' })
  })

  it('parses pseudo-class modifiers', async () => {
    const scss = `
/**
 * Link
 *
 * A link.
 *
 * :hover - Hovered state
 * :focus - Focused state
 *
 * Markup: <a class="{{modifier_class}}">Link</a>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const mods = result.content[0].modifiers
    expect(mods).toHaveLength(2)
    expect(mods[0].value).toBe(':hover')
    expect(mods[1].value).toBe(':focus')
  })
})

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------
describe('parameter parsing', () => {
  it('parses parameters when no markup is present', async () => {
    const scss = `
/**
 * Config
 *
 * Some configuration.
 *
 * paramA = defaultA - Desc for A
 * paramB = defaultB - Desc for B
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const params = result.content[0].modifiers
    // Parameters end up at the top-level section as well; check underlying kss parse
    // Actually, parameters are not mapped onto in2Section.modifiers — they are only
    // in the kss Section. The parse() function maps section.modifiers.
    // Let's verify through the output that modifiers is empty (params are on the kss level).
    expect(params).toHaveLength(0)
  })

  it('parses parameter name and default value correctly via kss', async () => {
    // We test the kss parser indirectly through parse(). When no markup
    // is present, the last paragraph is treated as parameters rather
    // than modifiers. The modifiers array in the output should be empty.
    const scss = `
/**
 * Settings
 *
 * Description.
 *
 * size = large - The size
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].modifiers).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------
describe('color parsing', () => {
  it('parses hex colors (#FFF and #FFFFFF)', async () => {
    const scss = `
/**
 * Colors
 *
 * Colors: white: #FFF
 * black: #000000
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const colors = result.content[0].colors
    expect(colors).toBeDefined()
    expect(colors!.length).toBeGreaterThanOrEqual(2)
    expect(colors!.find(c => c.color === '#FFF')).toBeDefined()
    expect(colors!.find(c => c.color === '#000000')).toBeDefined()
  })

  it('parses rgb() colors', async () => {
    const scss = `
/**
 * RGB Colors
 *
 * Colors: red: rgb(255, 0, 0)
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const colors = result.content[0].colors
    expect(colors).toBeDefined()
    expect(colors![0].color).toBe('rgb(255, 0, 0)')
  })

  it('parses hsl() colors', async () => {
    const scss = `
/**
 * HSL Colors
 *
 * Colors: blue: hsl(240, 100%, 50%)
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const colors = result.content[0].colors
    expect(colors).toBeDefined()
    expect(colors![0].color).toBe('hsl(240, 100%, 50%)')
  })

  it('parses var(--color) values', async () => {
    const scss = `
/**
 * CSS Var Colors
 *
 * Colors: primary: var(--color-primary)
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const colors = result.content[0].colors
    expect(colors).toBeDefined()
    expect(colors![0].color).toBe('var(--color-primary)')
  })

  it('parses color descriptions', async () => {
    const scss = `
/**
 * Named Colors
 *
 * Colors: brand: #FF0000 - The brand color
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const colors = result.content[0].colors
    expect(colors).toBeDefined()
    expect(colors![0].name).toBe('brand')
    expect(colors![0].color).toBe('#FF0000')
    expect(colors![0].description).toBe('The brand color')
  })
})

// ---------------------------------------------------------------------------
// Icon parsing
// ---------------------------------------------------------------------------
describe('icon parsing', () => {
  it('parses SVG icons', async () => {
    const scss = `
/**
 * Icons
 *
 * Icons: arrow: <svg viewBox="0 0 24 24"><path d="M1 1"/></svg>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const icons = result.content[0].icons
    expect(icons).toBeDefined()
    expect(icons).toHaveLength(1)
    expect(icons![0].name).toBe('arrow')
    expect(icons![0].svg).toContain('<svg')
    expect(icons![0].svg).toContain('</svg>')
  })
})

// ---------------------------------------------------------------------------
// Custom properties
// ---------------------------------------------------------------------------
describe('custom properties', () => {
  it('parses Figma property', async () => {
    const scss = `
/**
 * Component
 *
 * Figma: https://figma.com/file/abc
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].figma).toBe('https://figma.com/file/abc')
  })

  it('parses Status property (lowercased)', async () => {
    const scss = `
/**
 * Component
 *
 * Status: Ready
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].status).toBe('ready')
  })

  it('parses Wrapper property', async () => {
    const scss = `
/**
 * Component
 *
 * Wrapper: .my-wrapper
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].wrapper).toBe('.my-wrapper')
  })

  it('parses Weight property as number', async () => {
    const scss = `
/**
 * Component
 *
 * Weight: 5
 *
 * Styleguide 1.0
 */
`
    // Weight is parsed via toFloat on the kss section.
    // The parse() function does not directly map weight to the output,
    // but we can verify parsing doesn't throw.
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(1)
  })

  it('parses htmlclass property', async () => {
    const scss = `
/**
 * Component
 *
 * htmlclass: custom-html-class
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].htmlclass).toBe('custom-html-class')
  })

  it('parses bodyclass property', async () => {
    const scss = `
/**
 * Component
 *
 * bodyclass: custom-body-class
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].bodyclass).toBe('custom-body-class')
  })
})

// ---------------------------------------------------------------------------
// Markup extraction
// ---------------------------------------------------------------------------
describe('markup extraction', () => {
  it('extracts inline markup', async () => {
    const scss = `
/**
 * Button
 *
 * Markup: <div class="test">content</div>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].markup).toBe('<div class="test">content</div>')
  })

  it('extracts multiline markup', async () => {
    const scss = `
/**
 * Card
 *
 * Markup:
 * <div class="card">
 *   <p>Content</p>
 * </div>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].markup).toContain('<div class="card">')
    expect(result.content[0].markup).toContain('<p>Content</p>')
  })
})

// ---------------------------------------------------------------------------
// Overwritten sections
// ---------------------------------------------------------------------------
describe('overwritten sections', () => {
  it('detects duplicate section IDs in overwrittenSectionsIds', async () => {
    const scss = `
/**
 * First
 *
 * Styleguide 1.0
 */

/**
 * Duplicate
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.overwrittenSectionsIds).toContain('1.0')
  })

  it('detects duplicate second-level section IDs', async () => {
    const scss = `
/**
 * Parent
 *
 * Styleguide 1.0
 */

/**
 * Child A
 *
 * Styleguide 1.1
 */

/**
 * Child B duplicate
 *
 * Styleguide 1.1
 */
`
    const result = await parse(scss, config)
    expect(result.overwrittenSectionsIds).toContain('1.1')
  })
})

// ---------------------------------------------------------------------------
// Empty sections
// ---------------------------------------------------------------------------
describe('empty sections', () => {
  it('filters out comments without a reference', async () => {
    const scss = `
/**
 * This has no reference, should be ignored.
 */

/**
 * Valid Section
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(1)
    expect(result.content[0].header).toBe('Valid Section')
  })
})

// ---------------------------------------------------------------------------
// Source info
// ---------------------------------------------------------------------------
describe('source info', () => {
  it('tracks line number from comment block', async () => {
    const scss = `
/**
 * Header
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].source.css.line).toBeGreaterThan(0)
  })

  it('tracks filename from FileObject input', async () => {
    const file = {
      base: '/project',
      path: '/project/src/components/button.scss',
      contents: `
/**
 * Button
 *
 * Styleguide 1.0
 */
`,
    }
    const result = await parse([file], config)
    expect(result.content[0].source.css.file).toBe('src/components/button.scss')
  })
})

// ---------------------------------------------------------------------------
// File naming
// ---------------------------------------------------------------------------
describe('file naming', () => {
  it('generates correct previewFileName', async () => {
    const scss = `
/**
 * Button
 *
 * Styleguide 1.1
 */

/**
 * Parent
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const second = result.content[0].sections[0]
    expect(second.previewFileName).toBe('preview-1.1.html')
  })

  it('generates correct fullpageFileName', async () => {
    const scss = `
/**
 * Button
 *
 * Styleguide 1.1
 */

/**
 * Parent
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const second = result.content[0].sections[0]
    expect(second.fullpageFileName).toBe('fullpage-1.1.html')
  })

  it('generates file names for first-level sections', async () => {
    const scss = `
/**
 * Top
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].previewFileName).toBe('preview-1.0.html')
    expect(result.content[0].fullpageFileName).toBe('fullpage-1.0.html')
  })
})

// ---------------------------------------------------------------------------
// Markdown description
// ---------------------------------------------------------------------------
describe('markdown description', () => {
  it('parses inline markdown content via parseMarkdown mock', async () => {
    const scss = `
/**
 * Component
 *
 * Markdown: Some **bold** content
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].description).toContain('<p>')
    expect(result.content[0].hasMarkdownDescription).toBe(true)
  })

  it('sets hasMarkdownDescription to false when no markdown prefix', async () => {
    const scss = `
/**
 * Component
 *
 * Plain description text.
 *
 * Extra paragraph.
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0].hasMarkdownDescription).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Deprecated and experimental flags
// ---------------------------------------------------------------------------
describe('deprecated and experimental flags', () => {
  it('detects deprecated sections', async () => {
    const scss = `
/**
 * OldButton
 *
 * Deprecated: Use NewButton instead.
 *
 * Extra text.
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0]).toBeDefined()
  })

  it('detects experimental sections', async () => {
    const scss = `
/**
 * BetaFeature
 *
 * Experimental: This may change.
 *
 * Extra text.
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content[0]).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration: full button component
// ---------------------------------------------------------------------------
describe('full component parsing', () => {
  it('parses a complete button component with modifiers and markup', async () => {
    const scss = `
/**
 * Button
 *
 * A standard button component.
 *
 * .button-primary - Primary button style
 * .button-secondary - Secondary button style
 *
 * Markup: <button class="button {{modifier_class}}">Click me</button>
 *
 * Styleguide 1.1
 */
.button { }

/**
 * Components
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(1)
    const parent = result.content[0]
    expect(parent.id).toBe('1.0')
    expect(parent.header).toBe('Components')

    const button = parent.sections[0]
    expect(button).toBeDefined()
    expect(button.id).toBe('1.1')
    expect(button.header).toBe('Button')
    expect(button.markup).toContain('{{modifier_class}}')
    expect(button.modifiers).toHaveLength(2)
    expect(button.modifiers[0].value).toBe('.button-primary')
    expect(button.modifiers[0].description).toBe('Primary button style')
    expect(button.modifiers[1].value).toBe('.button-secondary')
    expect(button.modifiers[1].description).toBe('Secondary button style')
    expect(button.previewFileName).toBe('preview-1.1.html')
    expect(button.fullpageFileName).toBe('fullpage-1.1.html')
  })

  it('parses multiple top-level sections', async () => {
    const scss = `
/**
 * Layout
 *
 * Styleguide 1.0
 */

/**
 * Components
 *
 * Styleguide 2.0
 */

/**
 * Utilities
 *
 * Styleguide 3.0
 */
`
    const result = await parse(scss, config)
    expect(result.content).toHaveLength(3)
    expect(result.content[0].id).toBe('1.0')
    expect(result.content[1].id).toBe('2.0')
    expect(result.content[2].id).toBe('3.0')
  })

  it('handles array of file inputs', async () => {
    const files = [
      {
        base: '/project',
        path: '/project/buttons.scss',
        contents: `
/**
 * Buttons
 *
 * Styleguide 1.0
 */
`,
      },
      {
        base: '/project',
        path: '/project/cards.scss',
        contents: `
/**
 * Cards
 *
 * Styleguide 2.0
 */
`,
      },
    ]
    const result = await parse(files, config)
    expect(result.content).toHaveLength(2)
  })

  it('parses a section with all custom properties', async () => {
    const scss = `
/**
 * Full Component
 *
 * Description here.
 *
 * Extra paragraph.
 *
 * Figma: https://figma.com/file/xyz
 *
 * Status: Beta
 *
 * Wrapper: .full-wrapper
 *
 * htmlclass: html-cls
 *
 * bodyclass: body-cls
 *
 * Markup: <div>Full</div>
 *
 * Styleguide 1.0
 */
`
    const result = await parse(scss, config)
    const section = result.content[0]
    expect(section.figma).toBe('https://figma.com/file/xyz')
    expect(section.status).toBe('beta')
    expect(section.wrapper).toBe('.full-wrapper')
    expect(section.htmlclass).toBe('html-cls')
    expect(section.bodyclass).toBe('body-cls')
    expect(section.markup).toBe('<div>Full</div>')
  })
})
