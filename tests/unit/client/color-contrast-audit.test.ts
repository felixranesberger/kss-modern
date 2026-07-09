import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIT_CONTEXT,
  getAuditColorSchemes,
  runColorContrastAcrossSchemes,
} from '../../../client/lib/color-contrast-audit.ts'

// jsdom cannot compute color contrast / resolve light-dark(), so these tests
// cover the framework around axe: which schemes run (gating), the axe context,
// and the color-scheme / background bookkeeping. The real color evaluation lives
// in tests/e2e/color-contrast-schemes.spec.ts (real browser).

describe('getAuditColorSchemes', () => {
  afterEach(() => {
    delete document.documentElement.dataset.styleguideDarkMode
  })

  it('runs only light when the dark-mode attribute is absent', () => {
    const root = document.createElement('html')
    expect(getAuditColorSchemes(root)).toEqual(['light'])
  })

  it('runs both light and dark when data-styleguide-dark-mode="true"', () => {
    const root = document.createElement('html')
    root.dataset.styleguideDarkMode = 'true'
    expect(getAuditColorSchemes(root)).toEqual(['light', 'dark'])
  })

  it('runs only light when data-styleguide-dark-mode="false"', () => {
    const root = document.createElement('html')
    root.dataset.styleguideDarkMode = 'false'
    expect(getAuditColorSchemes(root)).toEqual(['light'])
  })

  it('treats any non-"true" value as light-only (exact match required)', () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', '']) {
      const root = document.createElement('html')
      root.dataset.styleguideDarkMode = value
      expect(getAuditColorSchemes(root)).toEqual(['light'])
    }
  })

  it('reads document.documentElement by default', () => {
    document.documentElement.dataset.styleguideDarkMode = 'true'
    expect(getAuditColorSchemes()).toEqual(['light', 'dark'])
  })

  it('always includes light as the first scheme', () => {
    const root = document.createElement('html')
    root.dataset.styleguideDarkMode = 'true'
    expect(getAuditColorSchemes(root)[0]).toBe('light')
  })
})

describe('audit context', () => {
  it('scopes to body and excludes the pug error overlay', () => {
    expect(AUDIT_CONTEXT).toEqual({
      include: [['body']],
      exclude: [['pug-error-overlay']],
    })
  })
})

describe('runColorContrastAcrossSchemes', () => {
  function makeAxe() {
    const seen: { colorScheme: string, background: string }[] = []
    const axe = {
      run: vi.fn(async () => {
        // capture the forced state at the moment axe reads the DOM
        seen.push({
          colorScheme: document.documentElement.style.colorScheme,
          background: document.documentElement.style.backgroundColor,
        })
        return { violations: [], incomplete: [], passes: [], inapplicable: [] }
      }),
    }
    return { axe, seen }
  }

  afterEach(() => {
    document.documentElement.style.colorScheme = ''
    document.documentElement.style.backgroundColor = ''
  })

  it('invokes axe once per requested scheme, tagging each result', async () => {
    const { axe } = makeAxe()
    const results = await runColorContrastAcrossSchemes(axe, ['light', 'dark'])
    expect(axe.run).toHaveBeenCalledTimes(2)
    expect(results.map(r => r.mode)).toEqual(['light', 'dark'])
    expect(results[0].result.passes).toEqual([])
  })

  it('forces "only <scheme>" and a Canvas backdrop during each run', async () => {
    // a plain fake root avoids jsdom's CSS parser rejecting the `Canvas`
    // system-color keyword; the real Canvas resolution is covered by the e2e
    const seen: { colorScheme: string, background: string }[] = []
    const root = { style: { colorScheme: '', backgroundColor: '' } }
    const axe = {
      run: vi.fn(async () => {
        seen.push({ colorScheme: root.style.colorScheme, background: root.style.backgroundColor })
        return { violations: [], incomplete: [], passes: [], inapplicable: [] }
      }),
    }
    await runColorContrastAcrossSchemes(axe, ['light', 'dark'], root as unknown as HTMLElement)
    expect(seen).toEqual([
      { colorScheme: 'only light', background: 'Canvas' },
      { colorScheme: 'only dark', background: 'Canvas' },
    ])
  })

  it('always passes the audit context and restricts to the color-contrast rule', async () => {
    const { axe } = makeAxe()
    await runColorContrastAcrossSchemes(axe, ['light'])
    expect(axe.run).toHaveBeenCalledWith(AUDIT_CONTEXT, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    })
  })

  it('restores the previous inline color-scheme and background afterwards', async () => {
    const { axe } = makeAxe()
    document.documentElement.style.colorScheme = 'light dark'
    document.documentElement.style.backgroundColor = 'rebeccapurple'
    await runColorContrastAcrossSchemes(axe, ['light', 'dark'])
    expect(document.documentElement.style.colorScheme).toBe('light dark')
    expect(document.documentElement.style.backgroundColor).toBe('rebeccapurple')
  })

  it('restores state even when a run rejects, and skips the failed result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const axe = {
      run: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    const results = await runColorContrastAcrossSchemes(axe, ['light'])
    expect(results).toEqual([])
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.documentElement.style.backgroundColor).toBe('')
    consoleError.mockRestore()
  })

  it('returns an empty list when no schemes are requested', async () => {
    const { axe } = makeAxe()
    const results = await runColorContrastAcrossSchemes(axe, [])
    expect(results).toEqual([])
    expect(axe.run).not.toHaveBeenCalled()
  })

  it('operates on the provided root element', async () => {
    const seen: string[] = []
    const root = document.createElement('html')
    const axe = {
      run: vi.fn(async () => {
        seen.push(root.style.colorScheme)
        return { violations: [], incomplete: [], passes: [], inapplicable: [] }
      }),
    }
    await runColorContrastAcrossSchemes(axe, ['dark'], root)
    expect(seen).toEqual(['only dark'])
    // the real document root must be left untouched
    expect(document.documentElement.style.colorScheme).toBe('')
  })
})
