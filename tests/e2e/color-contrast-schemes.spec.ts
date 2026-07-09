import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

/**
 * Real-browser tests for the per-color-scheme color-contrast audit
 * (client/lib/color-contrast-audit.ts). These exercise the actual shipped module
 * against real CSS color resolution — light-dark(), color-scheme, system colors,
 * the Canvas fallback for axe-core#3605 — which jsdom cannot compute.
 *
 * The module is bundled with esbuild and injected alongside axe-core, so the code
 * under test is the same source that ships (axe is injected, not bundled).
 *
 * NOTE: fixtures use a real multi-word sentence. axe-core marks very short text
 * ("x") as incomplete ("content too short to determine if it is actual text")
 * instead of a violation, so single characters would never surface as failures.
 */

const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf-8')
const TEXT = 'The quick brown fox jumps over the lazy dog'

let bundledModule = ''

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve('client/lib/color-contrast-audit.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'ContrastAudit',
    platform: 'browser',
    write: false,
  })
  bundledModule = result.outputFiles[0].text
})

interface SchemeSummary {
  mode: 'light' | 'dark'
  violations: string[]
  passes: string[]
  incomplete: string[]
}

async function audit(
  page: import('@playwright/test').Page,
  bodyHtml: string,
  modes: ('light' | 'dark')[] = ['light', 'dark'],
): Promise<Record<'light' | 'dark', SchemeSummary>> {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${bodyHtml}</body></html>`)
  await page.addScriptTag({ content: axeSource })
  await page.addScriptTag({ content: bundledModule })

  const summaries = await page.evaluate(async (modes) => {
    // eslint-disable-next-line ts/no-explicit-any
    const w = window as any
    const results = await w.ContrastAudit.runColorContrastAcrossSchemes(w.axe, modes)
    // eslint-disable-next-line ts/no-explicit-any
    const selectors = (group: any[]) =>
      // eslint-disable-next-line ts/no-explicit-any
      (group.find((r: any) => r.id === 'color-contrast')?.nodes ?? []).map((n: any) => n.target.join(' '))
    // eslint-disable-next-line ts/no-explicit-any
    return results.map((r: any) => ({
      mode: r.mode,
      violations: selectors(r.result.violations),
      passes: selectors(r.result.passes),
      incomplete: selectors(r.result.incomplete),
    }))
  }, modes)

  const byMode = {} as Record<'light' | 'dark', SchemeSummary>
  for (const s of summaries) byMode[s.mode] = s
  return byMode
}

test.describe('color-contrast across color schemes', () => {
  test('light-dark() background failing only in dark mode', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color: light-dark(#000, #555); background-color: light-dark(#fff, #333)">${TEXT}</p>`)
    expect(r.light.passes).toContain('#t')
    expect(r.light.violations).not.toContain('#t')
    expect(r.dark.violations).toContain('#t')
    expect(r.dark.passes).not.toContain('#t')
  })

  test('light-dark() background failing only in light mode', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color: light-dark(#ddd, #fff); background-color: light-dark(#eee, #222)">${TEXT}</p>`)
    expect(r.light.violations).toContain('#t')
    expect(r.dark.passes).toContain('#t')
    expect(r.dark.violations).not.toContain('#t')
  })

  test('light-dark() background passing in both modes', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color: light-dark(#111, #eee); background-color: light-dark(#fff, #1a1a1a)">${TEXT}</p>`)
    expect(r.light.passes).toContain('#t')
    expect(r.dark.passes).toContain('#t')
    expect(r.light.violations).not.toContain('#t')
    expect(r.dark.violations).not.toContain('#t')
  })

  test('component pinning its own color-scheme:dark is caught in BOTH passes (always renders dark)', async ({ page }) => {
    // A self-pinned-dark component always renders dark regardless of the page
    // theme, so a contrast bug in its dark appearance must surface in both passes.
    const r = await audit(page, `<p id="t" style="color-scheme: dark; color: light-dark(#000, #444); background-color: light-dark(#fff, #222)">${TEXT}</p>`)
    expect(r.light.violations).toContain('#t')
    expect(r.dark.violations).toContain('#t')
  })

  test('component pinning color-scheme:dark that is fine when dark passes in both', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color-scheme: dark; color: light-dark(#000, #fff); background-color: light-dark(#fff, #111)">${TEXT}</p>`)
    expect(r.light.passes).toContain('#t')
    expect(r.dark.passes).toContain('#t')
    expect(r.light.violations).not.toContain('#t')
    expect(r.dark.violations).not.toContain('#t')
  })

  test('nested transparent child resolves its ancestor light-dark() background per scheme', async ({ page }) => {
    const r = await audit(page, `
      <div id="parent" style="background-color: light-dark(#fff, #222)">
        <p id="child" style="color: light-dark(#000, #333); background-color: transparent">${TEXT}</p>
      </div>`)
    expect(r.light.passes).toContain('#child')
    expect(r.dark.violations).toContain('#child')
  })

  test('transparent background uses the per-scheme Canvas fallback (axe-core#3605)', async ({ page }) => {
    // Static dark text with no background of its own: readable on the light page
    // surface, unreadable once the surface goes dark. Without the Canvas fallback
    // axe would assume white and wrongly pass the dark case.
    const r = await audit(page, `<p id="t" style="color: #333">${TEXT}</p>`)
    expect(r.light.passes).toContain('#t')
    expect(r.dark.violations).toContain('#t')
  })

  test('adaptive light-dark() text on the transparent page surface passes in both', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color: light-dark(#000, #fff)">${TEXT}</p>`)
    expect(r.light.passes).toContain('#t')
    expect(r.dark.passes).toContain('#t')
    expect(r.light.violations).not.toContain('#t')
    expect(r.dark.violations).not.toContain('#t')
  })

  test('the alert low-contrast modifier palette fails contrast in both schemes', async ({ page }) => {
    // Guards the deliberately-inaccessible `.c-alert--low-contrast` modifier: its
    // static grey-on-near-white palette (~1.8:1) must stay a violation.
    const r = await audit(page, `<div id="t" style="background-color: hsl(0deg 0% 96%); color: hsl(0deg 0% 72%)">${TEXT}</div>`)
    expect(r.light.violations).toContain('#t')
    expect(r.dark.violations).toContain('#t')
  })

  test('CanvasText on Canvas system colors pass in both schemes', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color: CanvasText; background-color: Canvas">${TEXT}</p>`)
    expect(r.light.passes).toContain('#t')
    expect(r.dark.passes).toContain('#t')
    expect(r.light.violations).not.toContain('#t')
    expect(r.dark.violations).not.toContain('#t')
  })

  test('running only the light scheme yields a single light result', async ({ page }) => {
    const r = await audit(page, `<p id="t" style="color: light-dark(#000, #555); background-color: light-dark(#fff, #333)">${TEXT}</p>`, ['light'])
    expect(r.light).toBeDefined()
    expect(r.dark).toBeUndefined()
    expect(r.light.passes).toContain('#t')
  })

  test('multiple elements are each classified independently per scheme', async ({ page }) => {
    const r = await audit(page, `
      <p id="ok" style="color: light-dark(#111, #eee); background-color: light-dark(#fff, #1a1a1a)">${TEXT}</p>
      <p id="darkfail" style="color: light-dark(#000, #555); background-color: light-dark(#fff, #333)">${TEXT}</p>
      <p id="lightfail" style="color: light-dark(#ddd, #fff); background-color: light-dark(#eee, #222)">${TEXT}</p>`)
    expect(r.light.violations).toContain('#lightfail')
    expect(r.light.violations).not.toContain('#darkfail')
    expect(r.light.violations).not.toContain('#ok')
    expect(r.dark.violations).toContain('#darkfail')
    expect(r.dark.violations).not.toContain('#lightfail')
    expect(r.dark.violations).not.toContain('#ok')
  })

  test('restores the root color-scheme and background after running', async ({ page }) => {
    await page.setContent(`<!doctype html><html><head></head><body><p style="color:#333">${TEXT}</p></body></html>`)
    await page.addScriptTag({ content: axeSource })
    await page.addScriptTag({ content: bundledModule })
    const before = await page.evaluate(() => ({
      cs: document.documentElement.style.colorScheme,
      bg: document.documentElement.style.backgroundColor,
    }))
    await page.evaluate(async () => {
      // eslint-disable-next-line ts/no-explicit-any
      const w = window as any
      await w.ContrastAudit.runColorContrastAcrossSchemes(w.axe, ['light', 'dark'])
    })
    const after = await page.evaluate(() => ({
      cs: document.documentElement.style.colorScheme,
      bg: document.documentElement.style.backgroundColor,
    }))
    expect(after).toEqual(before)
  })

  test('KNOWN LIMITATION: @media(prefers-color-scheme) styling is not flipped by forcing color-scheme', async ({ page }) => {
    // Documents (and locks in) the caveat: forcing color-scheme cannot make the
    // prefers-color-scheme media feature match, so media-query-only dark styling
    // is evaluated in its light appearance in every pass.
    await page.setContent(`<!doctype html><html><head><style>
      #t { color: #000; background-color: #fff; }
      @media (prefers-color-scheme: dark) { #t { color: #555; background-color: #333; } }
    </style></head><body><p id="t">${TEXT}</p></body></html>`)
    await page.addScriptTag({ content: axeSource })
    await page.addScriptTag({ content: bundledModule })

    const computed = await page.evaluate(async () => {
      const out: Record<string, { color: string, bg: string }> = {}
      for (const mode of ['light', 'dark'] as const) {
        document.documentElement.style.colorScheme = mode === 'dark' ? 'only dark' : 'only light'
        const cs = getComputedStyle(document.getElementById('t')!)
        out[mode] = { color: cs.color, bg: cs.backgroundColor }
        document.documentElement.style.colorScheme = ''
      }
      return out
    })

    // both passes see the light-media values — the dark media query never matches
    expect(computed.light).toEqual(computed.dark)
    expect(computed.light.color).toBe('rgb(0, 0, 0)')
    expect(computed.light.bg).toBe('rgb(255, 255, 255)')
  })
})
