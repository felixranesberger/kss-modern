import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

/**
 * Real-browser tests for text-over-image contrast measurement
 * (client/lib/text-over-image-contrast.ts). axe-core can't sample image pixels,
 * so it reports text over a background image as *incomplete*; this module
 * composites the real background stack onto a canvas and measures the actual
 * contrast, promoting the node to a real pass/fail (or keeping it incomplete
 * with a concrete reason when it genuinely can't be measured).
 *
 * The modules are bundled with esbuild and injected alongside axe-core, wired up
 * exactly as fullpage.ts wires them in production.
 */

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf-8')
const TEXT = 'The quick brown fox jumps over the lazy dog'

let contrastAuditBundle = ''
let toiBundle = ''

test.beforeAll(async () => {
  const bundle = async (entry: string, globalName: string): Promise<string> => {
    const result = await build({
      entryPoints: [path.resolve(entry)],
      bundle: true,
      format: 'iife',
      globalName,
      platform: 'browser',
      write: false,
    })
    return result.outputFiles[0].text
  }
  contrastAuditBundle = await bundle('client/lib/color-contrast-audit.ts', 'ContrastAudit')
  toiBundle = await bundle('client/lib/text-over-image-contrast.ts', 'TOI')
})

interface NodeSummary {
  target: string
  measured?: { ratio: number, required: number, passed: boolean }
  reviewReason?: { code: string, message: string }
}

interface SchemeSummary {
  mode: 'light' | 'dark'
  violations: NodeSummary[]
  passes: NodeSummary[]
  incomplete: NodeSummary[]
}

/**
 * Render `bodyHtml` (with a `__IMG__` placeholder replaced by a freshly
 * generated same-origin data-URL image of `imageColor`) and run the wired-up
 * contrast audit + measurement over it.
 */
async function audit(
  page: import('@playwright/test').Page,
  bodyHtml: string,
  imageColor: string | null = null,
  modes: ('light' | 'dark')[] = ['light'],
): Promise<Record<'light' | 'dark', SchemeSummary>> {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`)
  await page.addScriptTag({ content: axeSource })
  await page.addScriptTag({ content: contrastAuditBundle })
  await page.addScriptTag({ content: toiBundle })

  const summaries = await page.evaluate(async ({ bodyHtml, imageColor, modes }) => {
    const w = window as any

    let html = bodyHtml
    if (imageColor) {
      const c = document.createElement('canvas')
      c.width = 24
      c.height = 24
      const ctx = c.getContext('2d')!
      ctx.fillStyle = imageColor
      ctx.fillRect(0, 0, 24, 24)
      html = html.replace(/__IMG__/g, c.toDataURL('image/png'))
    }
    document.body.innerHTML = html

    const results = await w.ContrastAudit.runColorContrastAcrossSchemes(
      w.axe,
      modes,
      document.documentElement,

      (result: any, mode: any) =>
        w.TOI.augmentColorContrastResult(result, {
          mode,

          resolve: (t: any) => w.axe.utils.shadowSelect(t[t.length - 1]),
        }),
    )

    const pick = (group: any[]): NodeSummary[] => {
      const cc = group.find((r: any) => r.id === 'color-contrast')
      if (!cc)
        return []

      return cc.nodes.map((n: any) => ({
        target: n.target.join(' '),
        measured: n.measured,
        reviewReason: n.reviewReason,
      }))
    }

    return results.map((r: any) => ({
      mode: r.mode,
      violations: pick(r.result.violations),
      passes: pick(r.result.passes),
      incomplete: pick(r.result.incomplete),
    }))
  }, { bodyHtml, imageColor, modes })

  const byMode = {} as Record<'light' | 'dark', SchemeSummary>

  for (const s of summaries as any[]) byMode[s.mode as 'light' | 'dark'] = s
  return byMode
}

const BOX = 'display:block; width:400px; height:140px; padding:24px; background-size:cover; background-repeat:no-repeat; font-size:20px; font-weight:400'

function find(nodes: NodeSummary[], target: string): NodeSummary | undefined {
  return nodes.find(n => n.target === target)
}

test.describe('text-over-image contrast measurement', () => {
  test('low-contrast text over a light background image becomes a real violation', async ({ page }) => {
    const r = await audit(
      page,
      `<p id="t" style="${BOX}; color:#aaaaaa; background-image:url(__IMG__)">${TEXT}</p>`,
      '#ffffff',
    )
    const node = find(r.light.violations, '#t')
    expect(node, 'node should be promoted from incomplete to a violation').toBeDefined()
    expect(node!.measured?.passed).toBe(false)
    expect(node!.measured!.ratio).toBeLessThan(4.5)
    // it must no longer sit in "needs review"
    expect(find(r.light.incomplete, '#t')).toBeUndefined()
  })

  test('high-contrast text over a dark background image becomes a real pass', async ({ page }) => {
    const r = await audit(
      page,
      `<p id="t" style="${BOX}; color:#ffffff; background-image:url(__IMG__)">${TEXT}</p>`,
      '#111111',
    )
    const node = find(r.light.passes, '#t')
    expect(node, 'node should be promoted from incomplete to a pass').toBeDefined()
    expect(node!.measured?.passed).toBe(true)
    expect(node!.measured!.ratio).toBeGreaterThan(4.5)
    expect(find(r.light.incomplete, '#t')).toBeUndefined()
  })

  test('a dark gradient scrim over a light photo makes light text pass', async ({ page }) => {
    // white text on a white image alone would fail; the composited scrim is what
    // makes it readable — proving the overlay layer is measured, not ignored
    const withScrim = await audit(
      page,
      `<p id="t" style="${BOX}; color:#ffffff; background-image:linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.85)), url(__IMG__)">${TEXT}</p>`,
      '#ffffff',
    )
    expect(find(withScrim.light.passes, '#t')?.measured?.passed).toBe(true)

    const withoutScrim = await audit(
      page,
      `<p id="t" style="${BOX}; color:#ffffff; background-image:url(__IMG__)">${TEXT}</p>`,
      '#ffffff',
    )
    expect(find(withoutScrim.light.violations, '#t')?.measured?.passed).toBe(false)
  })

  test('text over a transparent-background ancestor image is measured through the child', async ({ page }) => {
    const r = await audit(
      page,
      `<div id="hero" style="${BOX}; background-image:url(__IMG__)">
         <p id="t" style="color:#cccccc; background:transparent; font-size:20px">${TEXT}</p>
       </div>`,
      '#ffffff',
    )
    // grey text on a white photo, sampled through the transparent child -> fails
    expect(find(r.light.violations, '#t')?.measured?.passed).toBe(false)
  })

  test('an unsupported (radial) gradient stays incomplete with a concrete reason', async ({ page }) => {
    const r = await audit(
      page,
      `<p id="t" style="${BOX}; color:#777777; background-image:radial-gradient(circle, #fff, #eee)">${TEXT}</p>`,
    )
    const node = find(r.light.incomplete, '#t')
    expect(node, 'radial gradient should remain needs-review').toBeDefined()
    if (node?.reviewReason)
      expect(node.reviewReason.code).toBe('unsupported-gradient')
  })
})
