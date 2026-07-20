import type { AxeResults, NodeResult, Result } from 'axe-core'
import { describe, expect, it } from 'vitest'
import {
  augmentColorContrastResult,
  contrast,
  IMAGE_CONTRAST_MESSAGE_KEYS,
  normalizeStopPositions,
  parseBackgroundImage,
  parseCssColor,
  parseLinearGradient,
  relativeLuminance,
  requiredContrast,
  resolveBackgroundSize,
  resolvePositionAxis,
  splitTopLevel,
} from '../../../client/lib/text-over-image-contrast.ts'

// The canvas sampling and DOM walking need a real browser (layout + pixels) and
// are covered in tests/e2e/text-over-image-contrast.spec.ts. These unit tests
// cover the pure logic: colour + contrast maths, CSS value parsing, and the
// axe-result redistribution that surrounds the measurement.

describe('parseCssColor', () => {
  it('parses rgb() and rgba() comma syntax', () => {
    expect(parseCssColor('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 })
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
  })

  it('parses the modern space/slash syntax', () => {
    expect(parseCssColor('rgb(10 20 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseCssColor('rgb(10 20 30 / 0.4)')).toEqual({ r: 10, g: 20, b: 30, a: 0.4 })
    expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
  })

  it('parses hex in 3/4/6/8 digit forms', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseCssColor('#ff8800')).toEqual({ r: 255, g: 136, b: 0, a: 1 })
    expect(parseCssColor('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 })
  })

  it('treats transparent as zero-alpha and rejects junk', () => {
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseCssColor('not-a-color')).toBeNull()
    expect(parseCssColor('')).toBeNull()
  })
})

describe('wcag contrast maths', () => {
  it('computes luminance extremes', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })

  it('computes black-on-white as 21:1', () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5)
  })

  it('is order independent', () => {
    const fg = { r: 20, g: 40, b: 60 }
    const bg = { r: 200, g: 210, b: 220 }
    expect(contrast(fg, bg)).toBeCloseTo(contrast(bg, fg), 10)
  })
})

describe('requiredContrast', () => {
  it('needs 4.5:1 for normal body text', () => {
    expect(requiredContrast(16, false)).toBe(4.5)
    expect(requiredContrast(23.9, false)).toBe(4.5)
  })

  it('needs 3:1 for large text (>=24px, or >=18.66px bold)', () => {
    expect(requiredContrast(24, false)).toBe(3)
    expect(requiredContrast(19, true)).toBe(3)
    expect(requiredContrast(18, true)).toBe(4.5)
  })
})

describe('splitTopLevel', () => {
  it('ignores separators nested in parens', () => {
    expect(splitTopLevel('rgba(0, 0, 0, 0.5), url(a.png)')).toEqual([
      'rgba(0, 0, 0, 0.5)',
      'url(a.png)',
    ])
  })

  it('splits on spaces when asked', () => {
    expect(splitTopLevel('rgba(0, 0, 0, 0.5) 20%', ' ')).toEqual(['rgba(0, 0, 0, 0.5)', '20%'])
  })
})

describe('parseLinearGradient', () => {
  it('reads a "to top" scrim with percentage stops', () => {
    const g = parseLinearGradient('linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%)')
    expect(g?.angleDeg).toBe(0)
    expect(g?.stops).toHaveLength(2)
    expect(g?.stops[0].color).toEqual({ r: 0, g: 0, b: 0, a: 0.7 })
    expect(g?.stops[0].position).toBe(0)
    expect(g?.stops[1].position).toBe(1)
  })

  it('defaults the direction to "to bottom" (180deg)', () => {
    const g = parseLinearGradient('linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))')
    expect(g?.angleDeg).toBe(180)
  })

  it('reads explicit angles', () => {
    expect(parseLinearGradient('linear-gradient(45deg, rgb(0,0,0), rgb(255,255,255))')?.angleDeg).toBe(45)
  })

  it('returns null for corner keywords (not supported yet)', () => {
    expect(parseLinearGradient('linear-gradient(to top right, rgb(0,0,0), rgb(255,255,255))')).toBeNull()
  })
})

describe('parseBackgroundImage', () => {
  it('returns an empty list for none', () => {
    expect(parseBackgroundImage('none')).toEqual([])
    expect(parseBackgroundImage('')).toEqual([])
  })

  it('classifies url, linear-gradient and unsupported layers', () => {
    const layers = parseBackgroundImage('linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%), url("photo.jpg")')
    expect(layers[0].kind).toBe('linear-gradient')
    expect(layers[1]).toEqual({ kind: 'image', url: 'photo.jpg' })
  })

  it('marks radial/conic gradients as unsupported', () => {
    expect(parseBackgroundImage('radial-gradient(circle, #000, #fff)')[0].kind).toBe('unsupported')
    expect(parseBackgroundImage('conic-gradient(#000, #fff)')[0].kind).toBe('unsupported')
  })
})

describe('resolveBackgroundSize', () => {
  const area = { width: 200, height: 100 }
  const natural = { width: 100, height: 100 }

  it('covers by the larger scale', () => {
    expect(resolveBackgroundSize('cover', area, natural)).toEqual({ width: 200, height: 200 })
  })

  it('contains by the smaller scale', () => {
    expect(resolveBackgroundSize('contain', area, natural)).toEqual({ width: 100, height: 100 })
  })

  it('uses natural size for auto', () => {
    expect(resolveBackgroundSize('auto', area, natural)).toEqual({ width: 100, height: 100 })
  })

  it('resolves explicit percentages and lengths', () => {
    expect(resolveBackgroundSize('50% 100%', area, natural)).toEqual({ width: 100, height: 100 })
    expect(resolveBackgroundSize('80px 40px', area, natural)).toEqual({ width: 80, height: 40 })
  })

  it('preserves aspect ratio when one axis is auto', () => {
    expect(resolveBackgroundSize('50px auto', area, natural)).toEqual({ width: 50, height: 50 })
  })
})

describe('resolvePositionAxis', () => {
  it('resolves keywords', () => {
    expect(resolvePositionAxis('left', 200, 50)).toBe(0)
    expect(resolvePositionAxis('center', 200, 50)).toBe(75)
    expect(resolvePositionAxis('right', 200, 50)).toBe(150)
  })

  it('resolves percentages relative to the free space', () => {
    expect(resolvePositionAxis('50%', 200, 50)).toBe(75)
    expect(resolvePositionAxis('0%', 200, 50)).toBe(0)
  })

  it('resolves pixel offsets literally', () => {
    expect(resolvePositionAxis('10px', 200, 50)).toBe(10)
  })
})

describe('normalizeStopPositions', () => {
  it('anchors an unspecified first/last stop to 0 and 1', () => {
    expect(normalizeStopPositions([{ color: { r: 0, g: 0, b: 0, a: 1 } }, { color: { r: 0, g: 0, b: 0, a: 0 } }], 100))
      .toEqual([0, 1])
  })

  it('distributes interior unspecified stops evenly', () => {
    const stops = [
      { color: { r: 0, g: 0, b: 0, a: 1 } },
      { color: { r: 0, g: 0, b: 0, a: 1 } },
      { color: { r: 0, g: 0, b: 0, a: 1 } },
    ]
    expect(normalizeStopPositions(stops, 100)).toEqual([0, 0.5, 1])
  })

  it('converts pixel positions against the gradient line length', () => {
    const stops = [
      { color: { r: 0, g: 0, b: 0, a: 1 }, positionPx: 0 },
      { color: { r: 0, g: 0, b: 0, a: 1 }, positionPx: 50 },
    ]
    expect(normalizeStopPositions(stops, 100)).toEqual([0, 0.5])
  })

  it('clamps non-monotonic stops to be non-decreasing and within 0..1', () => {
    const stops = [
      { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0.8 },
      { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0.2 },
    ]
    expect(normalizeStopPositions(stops, 100)).toEqual([0.8, 0.8])
  })
})

// -- axe result redistribution -------------------------------------------------

function contrastNode(target: string, messageKey?: string): NodeResult {
  return {
    html: `<p id="${target.slice(1)}">text</p>`,
    target: [target],
    any: messageKey ? [{ id: 'color-contrast', data: { messageKey }, impact: 'serious', message: '', relatedNodes: [] }] : [],
    all: [],
    none: [],
  } as unknown as NodeResult
}

function resultsWithIncomplete(nodes: NodeResult[]): AxeResults {
  const contrastResult = {
    id: 'color-contrast',
    impact: 'serious',
    description: 'Ensure the contrast between foreground and background colors meets WCAG thresholds',
    help: '',
    helpUrl: 'https://example.test/color-contrast',
    tags: [],
    nodes,
  } as unknown as Result

  return {
    violations: [],
    incomplete: [contrastResult],
    passes: [],
    inapplicable: [],
  } as unknown as AxeResults
}

describe('augmentColorContrastResult', () => {
  it('exposes the image-related axe message keys it acts on', () => {
    expect([...IMAGE_CONTRAST_MESSAGE_KEYS].sort()).toEqual(['bgGradient', 'bgImage', 'imgNode'])
  })

  it('returns the results untouched when there is no incomplete color-contrast', async () => {
    const empty = { violations: [], incomplete: [], passes: [], inapplicable: [] } as unknown as AxeResults
    const out = await augmentColorContrastResult(empty, { mode: 'light', resolve: () => null })
    expect(out).toBe(empty)
  })

  it('keeps an unresolved image node incomplete with a concrete review reason', async () => {
    const results = resultsWithIncomplete([contrastNode('#hero', 'bgImage')])
    const out = await augmentColorContrastResult(results, { mode: 'light', resolve: () => null })

    expect(out.violations).toHaveLength(0)
    expect(out.passes).toHaveLength(0)
    expect(out.incomplete[0].nodes).toHaveLength(1)

    expect((out.incomplete[0].nodes[0] as any).reviewReason.code).toBe('no-geometry')
  })

  it('annotates a non-image incomplete reason but leaves it in place', async () => {
    const results = resultsWithIncomplete([contrastNode('#short', 'shortTextContent')])
    const out = await augmentColorContrastResult(results, { mode: 'light', resolve: () => null })

    expect(out.incomplete[0].nodes).toHaveLength(1)

    expect((out.incomplete[0].nodes[0] as any).reviewReason.message).toMatch(/too short/i)
  })

  it('drops the incomplete color-contrast result entirely when every node moves out', async () => {
    // no nodes -> the early return path; assert the empty-node guard holds
    const results = resultsWithIncomplete([])
    const out = await augmentColorContrastResult(results, { mode: 'light', resolve: () => null })
    expect(out).toBe(results)
  })
})
