/**
 * Formatting of a color into the notations the color swatches offer for copying. The conversion
 * itself is the browser's: `client/lib/color-resolver.ts` lets it compute the color as
 * `color(srgb …)` and `oklch(…)` via relative color syntax. This module only parses those
 * serializations and writes them out. HEX and HSL have no relative color serialization of their
 * own (the browser returns `color(srgb …)` for both), so they are derived from the sRGB channels.
 */

/** Channels 0–255 (unrounded), alpha 0–1. */
export interface Rgba {
  r: number
  g: number
  b: number
  alpha: number
}

/** Lightness 0–1, chroma, hue in degrees, alpha 0–1. */
export interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

const RGB_FUNCTION_RE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
const SRGB_FUNCTION_RE = /^color\(\s*srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i
const OKLCH_FUNCTION_RE = /^oklch\(\s*([\d.e+-]+%?)\s+([\d.e+-]+|none)\s+([\d.e+-]+|none)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i

function parseAlpha(value: string | undefined): number {
  if (value === undefined)
    return 1

  return value.endsWith('%')
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value)
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, value))
}

/**
 * Parse a computed `rgb()`, `rgba()` or `color(srgb …)` string, `null` for anything else. Channels of
 * an out-of-gamut color (below 0 or above 1 in `color(srgb …)`) are clipped to the sRGB range.
 */
export function parseComputedColor(value: string): Rgba | null {
  const trimmed = value.trim()

  const rgbMatch = RGB_FUNCTION_RE.exec(trimmed)
  if (rgbMatch) {
    return {
      r: clampChannel(Number.parseFloat(rgbMatch[1])),
      g: clampChannel(Number.parseFloat(rgbMatch[2])),
      b: clampChannel(Number.parseFloat(rgbMatch[3])),
      alpha: parseAlpha(rgbMatch[4]),
    }
  }

  const srgbMatch = SRGB_FUNCTION_RE.exec(trimmed)
  if (srgbMatch) {
    return {
      r: clampChannel(Number.parseFloat(srgbMatch[1]) * 255),
      g: clampChannel(Number.parseFloat(srgbMatch[2]) * 255),
      b: clampChannel(Number.parseFloat(srgbMatch[3]) * 255),
      alpha: parseAlpha(srgbMatch[4]),
    }
  }

  return null
}

/** Round to at most `digits` decimals and drop trailing zeros. */
function round(value: number, digits = 0): string {
  const factor = 10 ** digits
  return String(Math.round(value * factor) / factor)
}

function alphaSuffix(alpha: number): string {
  return alpha < 1 ? ` / ${round(alpha, 3)}` : ''
}

function toHexPair(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

export function formatHex({ r, g, b, alpha }: Rgba): string {
  const hex = `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`
  return alpha < 1 ? `${hex}${toHexPair(alpha * 255)}` : hex
}

export function formatRgb({ r, g, b, alpha }: Rgba): string {
  return `rgb(${round(r)} ${round(g)} ${round(b)}${alphaSuffix(alpha)})`
}

export function formatHsl({ r, g, b, alpha }: Rgba): string {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))

  let hue = 0
  if (delta !== 0) {
    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6
        break
      case green:
        hue = (blue - red) / delta + 2
        break
      default:
        hue = (red - green) / delta + 4
    }
  }
  hue = (hue * 60 + 360) % 360

  return `hsl(${round(hue, 1)}deg ${round(saturation * 100, 1)}% ${round(lightness * 100, 1)}%${alphaSuffix(alpha)})`
}

/** Parse a computed `oklch()` string, `null` for anything else. `none` (a grey's hue) reads as 0. */
export function parseOklch(value: string): Oklch | null {
  const match = OKLCH_FUNCTION_RE.exec(value.trim())
  if (!match)
    return null

  const lightness = match[1].endsWith('%') ? Number.parseFloat(match[1]) / 100 : Number.parseFloat(match[1])
  const toNumber = (part: string) => part === 'none' ? 0 : Number.parseFloat(part)

  return { l: lightness, c: toNumber(match[2]), h: toNumber(match[3]), alpha: parseAlpha(match[4]) }
}

export function formatOklch({ l, c, h, alpha }: Oklch): string {
  // Rounding noise gives a grey a tiny chroma and a random hue
  const isAchromatic = c < 0.0002
  return `oklch(${round(l * 100, 2)}% ${isAchromatic ? 0 : round(c, 4)} ${isAchromatic ? 0 : round(h, 2)}${alphaSuffix(alpha)})`
}
