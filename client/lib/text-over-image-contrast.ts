import type { AxeResults, CheckResult, NodeResult, Result } from 'axe-core'
import type { ColorSchemeMode } from './color-contrast-audit.ts'

/**
 * Text-over-image color-contrast measurement.
 *
 * axe-core's `color-contrast` rule cannot evaluate text drawn over a background
 * image (or an image content node): it can't read the image's pixels, so it has
 * no background colour to compare against and reports the node as *incomplete*
 * with a `messageKey` of `bgImage` / `bgGradient` / `imgNode`.
 *
 * This module fills that gap by compositing the real background stack behind the
 * text onto an offscreen canvas — the actual background image plus any solid or
 * linear-gradient overlay layers declared along the text's ancestor chain
 * (including `::before` / `::after` scrims) — and sampling the worst-case (lowest
 * contrast) pixel under the text's line boxes. That yields a genuine ratio, so
 * the node can be promoted from "needs review" to a real pass/fail.
 *
 * When the background genuinely can't be measured (a cross-origin image without
 * CORS, a video/canvas background, a radial/conic gradient, an overlay element
 * that isn't an ancestor, …) the node stays *incomplete* and gets a concrete
 * {@link ReviewReason} explaining why a human still has to check it.
 *
 * KNOWN LIMITATIONS (all fall back to "needs review", never a false pass):
 * - overlay scrims applied as a *sibling* element (not an ancestor / pseudo) are
 *   not composited automatically;
 * - radial / conic / repeating gradients are not measured;
 * - `mix-blend-mode` / `background-blend-mode` / `filter` / `backdrop-filter`
 *   compositing is not replayed.
 */

// axe color-contrast `messageKey`s that mean "there is an image/gradient behind
// the text that I couldn't sample". These are the nodes this module tries to
// measure; every other incomplete reason is left untouched.
export const IMAGE_CONTRAST_MESSAGE_KEYS: ReadonlySet<string> = new Set([
  'bgImage',
  'bgGradient',
  'imgNode',
])

export interface RGB {
  r: number
  g: number
  b: number
}

export interface RGBA extends RGB {
  a: number
}

export interface ReviewReason {
  code:
    | 'cross-origin-image'
    | 'image-load-failed'
    | 'unsupported-gradient'
    | 'overlay-element'
    | 'media-background'
    | 'no-geometry'
    | 'no-background-found'
    | 'measurement-error'
  message: string
}

export type ContrastMeasurement
  = | { status: 'pass' | 'fail', ratio: number, required: number, fg: RGB, worstBg: RGB }
    | { status: 'unknown', reason: ReviewReason }

// attached by the augmenter onto the axe NodeResult so the reporting layer can
// render the measured ratio / the review reason (see html-validator.ts)
export interface ContrastAnnotation {
  measured?: { ratio: number, required: number, passed: boolean, fg: RGB, worstBg: RGB }
  reviewReason?: ReviewReason
}

export type AnnotatedNode = NodeResult & ContrastAnnotation

// ---------------------------------------------------------------------------
// colour + WCAG contrast primitives
// ---------------------------------------------------------------------------

function clampChannel(value: number): number {
  if (Number.isNaN(value))
    return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

function parseAlpha(token: string): number {
  const t = token.trim()
  if (t.endsWith('%'))
    return Math.max(0, Math.min(1, Number.parseFloat(t) / 100))
  const n = Number.parseFloat(t)
  return Number.isNaN(n) ? 1 : Math.max(0, Math.min(1, n))
}

function parseChannel(token: string): number {
  const t = token.trim()
  if (t.endsWith('%'))
    return clampChannel((Number.parseFloat(t) / 100) * 255)
  return clampChannel(Number.parseFloat(t))
}

/**
 * Parse a CSS colour into RGBA. Built to handle the forms `getComputedStyle`
 * actually returns (`rgb(r, g, b)`, `rgba(r, g, b, a)`, the modern
 * `rgb(r g b / a)` slash syntax) plus hex and the `transparent` keyword.
 * Returns `null` for anything it can't confidently parse.
 */
export function parseCssColor(input: string): RGBA | null {
  if (!input)
    return null

  const s = input.trim().toLowerCase()

  if (s === 'transparent')
    return { r: 0, g: 0, b: 0, a: 0 }

  const fn = s.match(/^rgba?\(([^)]+)\)$/)
  if (fn) {
    let inner = fn[1]
    let alpha = 1

    if (inner.includes('/')) {
      const [rgbPart, alphaPart] = inner.split('/')
      inner = rgbPart
      alpha = parseAlpha(alphaPart)
    }

    const parts = inner.split(/[\s,]+/).filter(Boolean)
    if (parts.length === 4) {
      alpha = parseAlpha(parts[3])
      parts.length = 3
    }
    if (parts.length !== 3)
      return null

    return { r: parseChannel(parts[0]), g: parseChannel(parts[1]), b: parseChannel(parts[2]), a: alpha }
  }

  const hex = s.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    const h = hex[1]
    const expand = (c: string) => Number.parseInt(c.length === 1 ? c + c : c, 16)
    if (h.length === 3 || h.length === 4) {
      return {
        r: expand(h[0]),
        g: expand(h[1]),
        b: expand(h[2]),
        a: h.length === 4 ? expand(h[3]) / 255 : 1,
      }
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
      }
    }
  }

  return null
}

/** WCAG 2.x relative luminance of an (opaque) sRGB colour. */
export function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two relative luminances (order-independent). */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG contrast ratio between two opaque colours. */
export function contrast(fg: RGB, bg: RGB): number {
  return contrastRatio(relativeLuminance(fg), relativeLuminance(bg))
}

/** Alpha-composite `top` over an opaque `bottom` (straight-alpha, sRGB). */
export function compositeOver(top: RGBA, bottom: RGB): RGB {
  const a = Math.max(0, Math.min(1, top.a))
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
  }
}

/**
 * WCAG minimum contrast for the given text metrics: 3:1 for "large" text
 * (>= 24px, or >= 18.66px when bold), otherwise 4.5:1.
 */
export function requiredContrast(fontSizePx: number, bold: boolean): number {
  const isLarge = fontSizePx >= 24 || (bold && fontSizePx >= 18.66)
  return isLarge ? 3 : 4.5
}

function isBoldWeight(weight: string): boolean {
  if (weight === 'bold' || weight === 'bolder')
    return true
  const numeric = Number.parseInt(weight, 10)
  return !Number.isNaN(numeric) && numeric >= 700
}

// ---------------------------------------------------------------------------
// CSS value parsing (background layers + linear gradients)
// ---------------------------------------------------------------------------

/** Split on `sep` at the top level only, ignoring separators inside parens. */
export function splitTopLevel(value: string, sep = ','): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(')
      depth++
    else if (ch === ')')
      depth = Math.max(0, depth - 1)

    if (ch === sep && depth === 0) {
      out.push(current.trim())
      current = ''
    }
    else {
      current += ch
    }
  }
  if (current.trim())
    out.push(current.trim())
  return out
}

export interface GradientStop {
  color: RGBA
  /** normalized 0..1 once resolved; a raw px length is carried as `{ px }` */
  position?: number
  positionPx?: number
}

export interface LinearGradient {
  angleDeg: number
  stops: GradientStop[]
}

function angleToDegrees(token: string): number | null {
  const t = token.trim()
  const num = Number.parseFloat(t)
  if (Number.isNaN(num))
    return null
  if (t.endsWith('grad'))
    return num * 0.9
  if (t.endsWith('rad'))
    return (num * 180) / Math.PI
  if (t.endsWith('turn'))
    return num * 360
  return num // deg (default)
}

const SIDE_ANGLES: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
}

/**
 * Parse a computed `linear-gradient(...)` into an angle + colour stops, or
 * return `null` when the syntax is one we don't measure (corners, colour
 * functions we can't read). `repeating-linear-gradient`, `radial-gradient`
 * and `conic-gradient` are intentionally not handled here.
 */
export function parseLinearGradient(value: string): LinearGradient | null {
  const match = value.trim().match(/^linear-gradient\((.*)\)$/s)
  if (!match)
    return null

  const parts = splitTopLevel(match[1])
  if (parts.length < 2)
    return null

  let angleDeg = 180 // CSS default direction is "to bottom"
  let stopParts = parts

  const first = parts[0].toLowerCase()
  if (first.startsWith('to ')) {
    if (!(first in SIDE_ANGLES))
      return null // corner keywords (`to top right`) are not supported yet
    angleDeg = SIDE_ANGLES[first]
    stopParts = parts.slice(1)
  }
  else if (/^-?[\d.]+(?:deg|grad|rad|turn)$/.test(first)) {
    const deg = angleToDegrees(first)
    if (deg === null)
      return null
    angleDeg = deg
    stopParts = parts.slice(1)
  }

  const stops: GradientStop[] = []
  for (const part of stopParts) {
    // a stop is "<color> [<position>]"; the colour is itself a top-level token
    const tokens = splitTopLevel(part, ' ').filter(Boolean)
    if (tokens.length === 0)
      return null

    const color = parseCssColor(tokens[0])
    if (!color)
      return null

    const stop: GradientStop = { color }
    if (tokens[1]) {
      const pos = tokens[1]
      if (pos.endsWith('%'))
        stop.position = Number.parseFloat(pos) / 100
      else if (pos.endsWith('px'))
        stop.positionPx = Number.parseFloat(pos)
      // other length units on stops are rare; leave unspecified so it is
      // distributed evenly rather than measured wrongly
    }
    stops.push(stop)
  }

  if (stops.length < 2)
    return null

  return { angleDeg, stops }
}

export type BackgroundLayer
  = | { kind: 'image', url: string }
    | { kind: 'linear-gradient', gradient: LinearGradient }
    | { kind: 'unsupported' }

/**
 * Parse a computed `background-image` value into its layers, in CSS paint order
 * (index 0 is the *topmost* layer). `none` yields an empty list.
 */
export function parseBackgroundImage(value: string): BackgroundLayer[] {
  if (!value || value === 'none')
    return []

  return splitTopLevel(value).map((raw): BackgroundLayer => {
    const layer = raw.trim()
    const url = layer.match(/^url\((["']?)(.*?)\1\)$/i)
    if (url)
      return { kind: 'image', url: url[2] }

    if (layer.toLowerCase().startsWith('linear-gradient(')) {
      const gradient = parseLinearGradient(layer)
      return gradient ? { kind: 'linear-gradient', gradient } : { kind: 'unsupported' }
    }

    // radial-/conic-/repeating- gradients, image-set(), cross-fade(), …
    return { kind: 'unsupported' }
  })
}

// ---------------------------------------------------------------------------
// background-size / background-position geometry
// ---------------------------------------------------------------------------

interface Size {
  width: number
  height: number
}

/** Rendered size of a background image, per `background-size`, in CSS px. */
export function resolveBackgroundSize(
  size: string,
  area: Size,
  natural: Size,
): Size {
  const s = size.trim().toLowerCase()
  const nat: Size = {
    width: natural.width || area.width,
    height: natural.height || area.height,
  }

  if (s === 'cover' || s === 'contain') {
    const scaleW = area.width / nat.width
    const scaleH = area.height / nat.height
    const scale = s === 'cover' ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH)
    return { width: nat.width * scale, height: nat.height * scale }
  }

  const tokens = s.split(/\s+/)
  const resolveAxis = (token: string | undefined, extent: number): number | null => {
    if (!token || token === 'auto')
      return null
    if (token.endsWith('%'))
      return (extent * Number.parseFloat(token)) / 100
    return Number.parseFloat(token) // px
  }

  const width = resolveAxis(tokens[0], area.width)
  const height = resolveAxis(tokens[1], area.height)

  if (width === null && height === null)
    return { width: nat.width, height: nat.height }
  // one axis auto: scale it to preserve the image's aspect ratio
  if (width === null)
    return { width: nat.width * (height! / nat.height), height: height! }
  if (height === null)
    return { width, height: nat.height * (width / nat.width) }

  return { width, height }
}

/** Offset of a background image on one axis, per one `background-position` value. */
export function resolvePositionAxis(token: string, area: number, image: number): number {
  const t = token.trim().toLowerCase()
  switch (t) {
    case 'left':
    case 'top':
      return 0
    case 'right':
    case 'bottom':
      return area - image
    case 'center':
      return (area - image) / 2
  }
  if (t.endsWith('%'))
    return (area - image) * (Number.parseFloat(t) / 100)
  if (t.endsWith('px'))
    return Number.parseFloat(t)
  const n = Number.parseFloat(t)
  return Number.isNaN(n) ? 0 : n
}

/** Normalize gradient stop positions into ascending 0..1 fractions for canvas. */
export function normalizeStopPositions(stops: GradientStop[], lineLength: number): number[] {
  const positions: (number | null)[] = stops.map((stop) => {
    if (typeof stop.position === 'number')
      return stop.position
    if (typeof stop.positionPx === 'number')
      return lineLength > 0 ? stop.positionPx / lineLength : 0
    return null
  })

  if (positions[0] === null)
    positions[0] = 0
  if (positions[positions.length - 1] === null)
    positions[positions.length - 1] = 1

  // linearly distribute any runs of unspecified interior stops
  let i = 0
  while (i < positions.length) {
    if (positions[i] !== null) {
      i++
      continue
    }
    let j = i
    while (j < positions.length && positions[j] === null)
      j++
    const start = positions[i - 1]!
    const end = positions[j]!
    const gap = j - (i - 1)
    for (let k = i; k < j; k++)
      positions[k] = start + ((end - start) * (k - (i - 1))) / gap
    i = j
  }

  // CSS clamps each stop to be >= the previous one
  let previous = 0
  return positions.map((p) => {
    const value = Math.max(0, Math.min(1, Math.max(p!, previous)))
    previous = value
    return value
  })
}

// ---------------------------------------------------------------------------
// DOM measurement (needs a real browser: layout + canvas pixels)
// ---------------------------------------------------------------------------

interface Box {
  left: number
  top: number
  width: number
  height: number
}

type ImageLoad = HTMLImageElement | { error: 'cross-origin' | 'load' }
type ImageCache = Map<string, Promise<ImageLoad>>

function isCrossOrigin(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:'))
    return false
  try {
    return new URL(url, window.location.href).origin !== window.location.origin
  }
  catch {
    return false
  }
}

function loadImage(url: string, cache: ImageCache): Promise<ImageLoad> {
  const cached = cache.get(url)
  if (cached)
    return cached

  const promise = new Promise<ImageLoad>((resolve) => {
    const img = new Image()
    // request CORS so same-origin (and CORS-enabled) images can be read back
    // from the canvas; a cross-origin image without CORS fails to load here and
    // is reported as needs-review rather than silently tainting the canvas
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve({ error: isCrossOrigin(url) ? 'cross-origin' : 'load' })
    img.src = url
  })

  cache.set(url, promise)
  return promise
}

type PaintOp
  = | { kind: 'color', box: Box, color: RGBA }
    | { kind: 'image', box: Box, img: HTMLImageElement, size: string, position: string, repeat: string }
    | { kind: 'gradient', box: Box, gradient: LinearGradient }

const REVIEW_MESSAGES: Record<ReviewReason['code'], string> = {
  'cross-origin-image': 'The background image is served from another origin without CORS headers, so its pixels can\'t be read to measure contrast. Add `Access-Control-Allow-Origin` (or a `crossorigin` attribute on the source) to enable automatic checking, or verify the contrast manually.',
  'image-load-failed': 'The background image couldn\'t be loaded for pixel sampling. Verify the contrast manually.',
  'unsupported-gradient': 'This element sits over a radial, conic or otherwise unsupported gradient that isn\'t measured automatically yet. Verify the contrast manually.',
  'overlay-element': 'A blend mode, filter or opacity between the text and its background couldn\'t be reproduced automatically. Verify the contrast manually.',
  'media-background': 'The text sits over a video or other media background whose frames vary. Measure the contrast manually against the least readable frame.',
  'no-geometry': 'The text has no measurable on-screen box (hidden or zero-size), so its background couldn\'t be sampled. Verify the contrast manually if it becomes visible.',
  'no-background-found': 'Couldn\'t locate a background image behind this text to sample. Verify the contrast manually.',
  'measurement-error': 'The background behind this text couldn\'t be sampled automatically. Verify the contrast manually.',
}

function reason(code: ReviewReason['code']): ReviewReason {
  return { code, message: REVIEW_MESSAGES[code] }
}

function borderBox(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * Walk the text element's ancestor chain and collect every background paint op
 * (solid colours, images, linear gradients — including `::before` / `::after`
 * scrims), bottom-most first, plus the opaque base colour to paint them over.
 * Returns a {@link ReviewReason} instead when the stack can't be reproduced.
 */
async function collectPaintOps(
  el: HTMLElement,
  mode: ColorSchemeMode,
  cache: ImageCache,
): Promise<{ ops: PaintOp[], base: RGB } | ReviewReason> {
  const perNode: PaintOp[][] = []
  let node: HTMLElement | null = el
  let base: RGB | null = null

  const layersFor = async (style: CSSStyleDeclaration, box: Box): Promise<PaintOp[] | ReviewReason> => {
    const ops: PaintOp[] = []

    const bgColor = parseCssColor(style.backgroundColor)
    if (bgColor && bgColor.a > 0)
      ops.push({ kind: 'color', box, color: bgColor })

    const images = parseBackgroundImage(style.backgroundImage)
    const sizes = splitTopLevel(style.backgroundSize || 'auto')
    const positions = splitTopLevel(style.backgroundPosition || '0% 0%')
    const repeats = splitTopLevel(style.backgroundRepeat || 'repeat')

    // background-image lists paint the FIRST layer on top, so reverse to
    // paint bottom-first
    for (let i = images.length - 1; i >= 0; i--) {
      const layer = images[i]
      const size = sizes[i % sizes.length] ?? 'auto'
      const position = positions[i % positions.length] ?? '0% 0%'
      const repeat = repeats[i % repeats.length] ?? 'repeat'

      if (layer.kind === 'unsupported')
        return reason('unsupported-gradient')

      if (layer.kind === 'linear-gradient') {
        ops.push({ kind: 'gradient', box, gradient: layer.gradient })
        continue
      }

      const loaded = await loadImage(layer.url, cache)
      if ('error' in loaded)
        return reason(loaded.error === 'cross-origin' ? 'cross-origin-image' : 'image-load-failed')
      ops.push({ kind: 'image', box, img: loaded, size, position, repeat })
    }

    return ops
  }

  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const style = getComputedStyle(node)

    // blend modes, filters and partial opacity change how layers combine in
    // ways we don't replay — bail to needs-review rather than report a wrong
    // ratio (honest partial coverage: never a false pass). background-blend-mode
    // is a per-layer list ("normal, normal"), so check every entry.
    const backdropFilter = style.getPropertyValue('backdrop-filter')
    const hasBackgroundBlend = splitTopLevel(style.backgroundBlendMode || 'normal')
      .some(value => value.trim() !== 'normal')
    if (
      style.mixBlendMode !== 'normal'
      || hasBackgroundBlend
      || style.filter !== 'none'
      || (backdropFilter !== '' && backdropFilter !== 'none')
      || Number.parseFloat(style.opacity) < 1
    ) {
      return reason('overlay-element')
    }

    const box = borderBox(node.getBoundingClientRect())
    const nodeOps: PaintOp[] = []

    const own = await layersFor(style, box)
    if (!Array.isArray(own))
      return own
    nodeOps.push(...own)

    // include ::before / ::after scrims (a very common overlay technique). We
    // approximate their box as the host border-box, which is correct for the
    // usual full-bleed `inset: 0` overlay.
    for (const pseudo of ['::before', '::after'] as const) {
      const pseudoStyle = getComputedStyle(node, pseudo)
      const content = pseudoStyle.content
      if (content && content !== 'none' && content !== 'normal') {
        const pseudoOps = await layersFor(pseudoStyle, box)
        if (!Array.isArray(pseudoOps))
          return pseudoOps
        nodeOps.push(...pseudoOps)
      }
    }

    perNode.push(nodeOps)

    // an opaque background colour fully hides everything below it: that colour
    // is our base and we can stop climbing
    const bgColor = parseCssColor(style.backgroundColor)
    if (bgColor && bgColor.a >= 1) {
      base = { r: bgColor.r, g: bgColor.g, b: bgColor.b }
      break
    }

    node = node.parentElement
  }

  if (!base) {
    const rootColor = parseCssColor(getComputedStyle(document.documentElement).backgroundColor)
    base = rootColor && rootColor.a >= 1
      ? { r: rootColor.r, g: rootColor.g, b: rootColor.b }
      : (mode === 'dark' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 })
  }

  // perNode is child→ancestor; reverse so ancestors (bottom) paint first
  const ops = perNode.reverse().flat()
  return { ops, base }
}

const MAX_CANVAS_DIMENSION = 256

/**
 * Composite the collected paint ops onto a canvas covering the text's line
 * boxes and return the worst-case (lowest-contrast against `fg`) background
 * colour actually painted under the text. Returns a {@link ReviewReason} if the
 * canvas can't be read (e.g. an unexpected cross-origin taint).
 */
function sampleWorstBackground(
  fg: RGB,
  lineRects: Box[],
  ops: PaintOp[],
  base: RGB,
): RGB | ReviewReason {
  const union: Box = {
    left: Math.min(...lineRects.map(r => r.left)),
    top: Math.min(...lineRects.map(r => r.top)),
    width: 0,
    height: 0,
  }
  union.width = Math.max(...lineRects.map(r => r.left + r.width)) - union.left
  union.height = Math.max(...lineRects.map(r => r.top + r.height)) - union.top

  const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(union.width, union.height, 1))
  const canvasW = Math.max(1, Math.ceil(union.width * scale))
  const canvasH = Math.max(1, Math.ceil(union.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx)
    return reason('measurement-error')

  const toCanvasX = (x: number): number => (x - union.left) * scale
  const toCanvasY = (y: number): number => (y - union.top) * scale

  ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`
  ctx.fillRect(0, 0, canvasW, canvasH)

  for (const op of ops) {
    if (op.kind === 'color') {
      ctx.fillStyle = `rgba(${op.color.r}, ${op.color.g}, ${op.color.b}, ${op.color.a})`
      ctx.fillRect(0, 0, canvasW, canvasH)
      continue
    }

    if (op.kind === 'gradient') {
      const angle = (op.gradient.angleDeg * Math.PI) / 180
      const dx = Math.sin(angle)
      const dy = -Math.cos(angle)
      const length = Math.abs(op.box.width * dx) + Math.abs(op.box.height * dy)
      const cx = op.box.left + op.box.width / 2
      const cy = op.box.top + op.box.height / 2
      const grad = ctx.createLinearGradient(
        toCanvasX(cx - (dx * length) / 2),
        toCanvasY(cy - (dy * length) / 2),
        toCanvasX(cx + (dx * length) / 2),
        toCanvasY(cy + (dy * length) / 2),
      )
      const fractions = normalizeStopPositions(op.gradient.stops, length)
      op.gradient.stops.forEach((stop, i) => {
        grad.addColorStop(fractions[i], `rgba(${stop.color.r}, ${stop.color.g}, ${stop.color.b}, ${stop.color.a})`)
      })
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvasW, canvasH)
      continue
    }

    // image layer
    const natural: Size = { width: op.img.naturalWidth, height: op.img.naturalHeight }
    const area: Size = { width: op.box.width, height: op.box.height }
    const drawn = resolveBackgroundSize(op.size, area, natural)
    if (drawn.width <= 0 || drawn.height <= 0)
      continue

    const [posX = '0%', posY = '0%'] = op.position.split(/\s+/)
    const originX = op.box.left + resolvePositionAxis(posX, area.width, drawn.width)
    const originY = op.box.top + resolvePositionAxis(posY, area.height, drawn.height)

    const repeat = op.repeat
    const repeatX = repeat === 'repeat' || repeat === 'repeat-x' || repeat === 'round' || repeat === 'space'
    const repeatY = repeat === 'repeat' || repeat === 'repeat-y' || repeat === 'round' || repeat === 'space'

    // tile across the canvas extent, bounded so a tiny tile can't loop forever
    const firstX = repeatX ? originX - Math.ceil((originX - union.left) / drawn.width) * drawn.width : originX
    const firstY = repeatY ? originY - Math.ceil((originY - union.top) / drawn.height) * drawn.height : originY
    const lastX = repeatX ? union.left + union.width : originX
    const lastY = repeatY ? union.top + union.height : originY

    let tiles = 0
    for (let y = firstY; y <= lastY; y += drawn.height) {
      for (let x = firstX; x <= lastX; x += drawn.width) {
        ctx.drawImage(op.img, toCanvasX(x), toCanvasY(y), drawn.width * scale, drawn.height * scale)
        if (++tiles > 4096)
          break
      }
      if (tiles > 4096)
        break
    }
  }

  let pixels: Uint8ClampedArray
  try {
    pixels = ctx.getImageData(0, 0, canvasW, canvasH).data
  }
  catch {
    // a cross-origin source slipped through and tainted the canvas
    return reason('cross-origin-image')
  }

  // only sample pixels that fall inside a line box (skips block padding)
  const canvasRects = lineRects.map(r => ({
    x0: toCanvasX(r.left),
    y0: toCanvasY(r.top),
    x1: toCanvasX(r.left + r.width),
    y1: toCanvasY(r.top + r.height),
  }))
  const inLineBox = (x: number, y: number): boolean =>
    canvasRects.some(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)

  const fgLuminance = relativeLuminance(fg)
  let worstRatio = Infinity
  let worstBg: RGB = base

  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      if (!inLineBox(x, y))
        continue
      const idx = (y * canvasW + x) * 4
      const bg: RGB = { r: pixels[idx], g: pixels[idx + 1], b: pixels[idx + 2] }
      const ratio = contrastRatio(fgLuminance, relativeLuminance(bg))
      if (ratio < worstRatio) {
        worstRatio = ratio
        worstBg = bg
      }
    }
  }

  return worstBg
}

/**
 * Measure the real WCAG contrast of a text element against the composited
 * background behind it (image + overlay layers), evaluated under the given
 * colour scheme. Returns a pass/fail with the ratio, or an "unknown" verdict
 * with a {@link ReviewReason} when it genuinely can't be measured.
 */
export async function measureTextContrastOverBackground(
  el: HTMLElement,
  mode: ColorSchemeMode,
  cache: ImageCache = new Map(),
): Promise<ContrastMeasurement> {
  try {
    const style = getComputedStyle(el)

    const fgColor = parseCssColor(style.color)
    if (!fgColor)
      return { status: 'unknown', reason: reason('measurement-error') }
    // semi-transparent text is a foreground-alpha problem axe reports separately
    if (fgColor.a < 0.999)
      return { status: 'unknown', reason: reason('measurement-error') }
    const fg: RGB = { r: fgColor.r, g: fgColor.g, b: fgColor.b }

    const required = requiredContrast(Number.parseFloat(style.fontSize), isBoldWeight(style.fontWeight))

    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const lineRects: Box[] = Array.from(el.getClientRects())
      .map((rect) => {
        const left = Math.max(0, rect.left)
        const top = Math.max(0, rect.top)
        const right = Math.min(viewportW, rect.right)
        const bottom = Math.min(viewportH, rect.bottom)
        return { left, top, width: right - left, height: bottom - top }
      })
      .filter(box => box.width > 0 && box.height > 0)

    if (lineRects.length === 0)
      return { status: 'unknown', reason: reason('no-geometry') }

    const collected = await collectPaintOps(el, mode, cache)
    if ('code' in collected)
      return { status: 'unknown', reason: collected }

    const hasPaintableBackground = collected.ops.some(op => op.kind === 'image' || op.kind === 'gradient')
    if (!hasPaintableBackground)
      return { status: 'unknown', reason: reason('no-background-found') }

    const worstBg = sampleWorstBackground(fg, lineRects, collected.ops, collected.base)
    if ('code' in worstBg)
      return { status: 'unknown', reason: worstBg }

    const ratio = contrast(fg, worstBg)
    return {
      status: ratio >= required ? 'pass' : 'fail',
      ratio,
      required,
      fg,
      worstBg,
    }
  }
  catch {
    return { status: 'unknown', reason: reason('measurement-error') }
  }
}

// ---------------------------------------------------------------------------
// axe-core result augmentation
// ---------------------------------------------------------------------------

function findCheck(node: NodeResult, id: string): CheckResult | undefined {
  return [...node.any, ...node.all, ...node.none].find(check => check.id === id)
}

function colorContrastMessageKey(node: NodeResult): string | undefined {
  const check = findCheck(node, 'color-contrast')
  return (check?.data as { messageKey?: string } | undefined)?.messageKey
}

/** Friendly "why does this need review" text for non-image incomplete reasons. */
function describeIncompleteReason(messageKey: string | undefined): ReviewReason {
  switch (messageKey) {
    case 'fgAlpha':
      return { code: 'measurement-error', message: 'The text colour is semi-transparent, so its effective contrast depends on what shows through. Verify the contrast manually.' }
    case 'shortTextContent':
      return { code: 'measurement-error', message: 'The text is too short for axe to be sure it is real text. Verify the contrast manually if it is.' }
    case 'elmPartiallyObscured':
    case 'elmPartiallyObscuring':
    case 'bgOverlap':
      return reason('overlay-element')
    default:
      return reason('measurement-error')
  }
}

function annotate(node: NodeResult, annotation: ContrastAnnotation): AnnotatedNode {
  return Object.assign(node, annotation)
}

function findColorContrast(group: Result[]): Result | undefined {
  return group.find(result => result.id === 'color-contrast')
}

/** A color-contrast Result carrying the given nodes, cloned from `template`. */
function contrastResultFrom(template: Result, nodes: NodeResult[]): Result {
  return { ...template, nodes }
}

export interface AugmentDeps {
  mode: ColorSchemeMode
  /** resolve an axe node target to a live element in this document */
  resolve: (target: NodeResult['target']) => HTMLElement | null
}

/**
 * Post-process one scheme's color-contrast {@link AxeResults}: for every
 * incomplete node that axe flagged as text-over-image, measure the real
 * contrast and move it into `violations` or `passes`; leave the rest incomplete
 * with a concrete review reason attached. Returns a new results object; the
 * input is not mutated at the group level.
 */
export async function augmentColorContrastResult(
  result: AxeResults,
  deps: AugmentDeps,
): Promise<AxeResults> {
  const incompleteContrast = findColorContrast(result.incomplete)
  if (!incompleteContrast || incompleteContrast.nodes.length === 0)
    return result

  const cache: ImageCache = new Map()
  const stayIncomplete: NodeResult[] = []
  const newViolations: NodeResult[] = []
  const newPasses: NodeResult[] = []

  for (const node of incompleteContrast.nodes) {
    const messageKey = colorContrastMessageKey(node)

    if (!messageKey || !IMAGE_CONTRAST_MESSAGE_KEYS.has(messageKey)) {
      stayIncomplete.push(annotate(node, { reviewReason: describeIncompleteReason(messageKey) }))
      continue
    }

    const el = deps.resolve(node.target)
    if (!el) {
      stayIncomplete.push(annotate(node, { reviewReason: reason('no-geometry') }))
      continue
    }

    const measurement = await measureTextContrastOverBackground(el, deps.mode, cache)

    if (measurement.status === 'unknown') {
      stayIncomplete.push(annotate(node, { reviewReason: measurement.reason }))
      continue
    }

    annotate(node, {
      measured: {
        ratio: measurement.ratio,
        required: measurement.required,
        passed: measurement.status === 'pass',
        fg: measurement.fg,
        worstBg: measurement.worstBg,
      },
    })
    if (measurement.status === 'pass')
      newPasses.push(node)
    else
      newViolations.push(node)
  }

  const incomplete = result.incomplete.filter(r => r !== incompleteContrast)
  if (stayIncomplete.length > 0)
    incomplete.push(contrastResultFrom(incompleteContrast, stayIncomplete))

  const mergeInto = (group: Result[], nodes: NodeResult[]): Result[] => {
    if (nodes.length === 0)
      return group
    const existing = findColorContrast(group)
    if (existing)
      return group.map(r => (r === existing ? { ...r, nodes: [...r.nodes, ...nodes] } : r))
    return [...group, contrastResultFrom(incompleteContrast, nodes)]
  }

  return {
    ...result,
    incomplete,
    violations: mergeInto(result.violations, newViolations),
    passes: mergeInto(result.passes, newPasses),
  }
}
