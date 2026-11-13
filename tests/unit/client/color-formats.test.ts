import { describe, expect, it } from 'vitest'
import { formatHex, formatHsl, formatOklch, formatRgb, parseComputedColor, parseOklch } from '../../../client/lib/color-formats.ts'

const blue = { r: 37, g: 99, b: 235, alpha: 1 }

describe('parseComputedColor', () => {
  it('parses legacy and modern rgb() serializations', () => {
    expect(parseComputedColor('rgb(37, 99, 235)')).toEqual(blue)
    expect(parseComputedColor('rgba(37, 99, 235, 0.5)')).toEqual({ ...blue, alpha: 0.5 })
    expect(parseComputedColor('rgb(37 99 235 / 50%)')).toEqual({ ...blue, alpha: 0.5 })
  })

  it('parses color(srgb …) with channels from 0 to 1', () => {
    expect(parseComputedColor('color(srgb 1 0 0.5)')).toEqual({ r: 255, g: 0, b: 127.5, alpha: 1 })
  })

  it('clips out-of-gamut channels to the sRGB range', () => {
    expect(parseComputedColor('color(srgb -0.536456 0.818509 1.2 / 0.5)'))
      .toEqual({ r: 0, g: 0.818509 * 255, b: 255, alpha: 0.5 })
  })

  it('returns null for other color spaces', () => {
    expect(parseComputedColor('oklch(0.55 0.2 260)')).toBeNull()
    expect(parseComputedColor('color(display-p3 1 0 0)')).toBeNull()
  })
})

describe('parseOklch', () => {
  it('parses the computed serialization, with and without alpha', () => {
    expect(parseOklch('oklch(0.54613 0.215194 262.885)')).toEqual({ l: 0.54613, c: 0.215194, h: 262.885, alpha: 1 })
    expect(parseOklch('oklch(54.613% 0.2 10 / 0.5)')).toEqual({ l: 0.54613, c: 0.2, h: 10, alpha: 0.5 })
  })

  it('reads a missing hue as 0', () => {
    expect(parseOklch('oklch(0.6 0 none)')).toEqual({ l: 0.6, c: 0, h: 0, alpha: 1 })
  })
})

describe('color formatters', () => {
  it('formats HEX, with an alpha pair only when translucent', () => {
    expect(formatHex(blue)).toBe('#2563eb')
    expect(formatHex({ ...blue, alpha: 0.5 })).toBe('#2563eb80')
  })

  it('formats RGB in the space-separated syntax', () => {
    expect(formatRgb(blue)).toBe('rgb(37 99 235)')
    expect(formatRgb({ ...blue, alpha: 0.25 })).toBe('rgb(37 99 235 / 0.25)')
  })

  it('formats HSL', () => {
    expect(formatHsl(blue)).toBe('hsl(221.2deg 83.2% 53.3%)')
    expect(formatHsl({ r: 255, g: 255, b: 255, alpha: 1 })).toBe('hsl(0deg 0% 100%)')
  })

  it('formats OKLCH with lightness in percent and gives greys a zero hue', () => {
    expect(formatOklch({ l: 0.54613, c: 0.215194, h: 262.885, alpha: 1 })).toBe('oklch(54.61% 0.2152 262.89)')
    expect(formatOklch({ l: 0.5999, c: 0.00001, h: 89.9, alpha: 0.5 })).toBe('oklch(59.99% 0 0 / 0.5)')
  })
})
