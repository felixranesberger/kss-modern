import { describe, expect, it } from 'vitest'
import { applyPreviewColorScheme } from '../../../client/lib/theme-select.ts'

// A plain fake iframe avoids jsdom's CSS parser normalising the color-scheme
// value; the real end-to-end effect (light-dark resolution) is covered by
// tests/e2e/theme-preview-color-scheme.spec.ts.
function fakeIframe(root?: { style: { colorScheme: string } }) {
  return { contentDocument: root ? { documentElement: root } : null } as unknown as HTMLIFrameElement
}

describe('applyPreviewColorScheme', () => {
  it('forces "only dark" on the preview root for the dark theme', () => {
    const root = { style: { colorScheme: 'light dark' } }
    applyPreviewColorScheme(fakeIframe(root), 'dark')
    expect(root.style.colorScheme).toBe('only dark')
  })

  it('forces "only light" on the preview root for the light theme', () => {
    const root = { style: { colorScheme: '' } }
    applyPreviewColorScheme(fakeIframe(root), 'light')
    expect(root.style.colorScheme).toBe('only light')
  })

  it('lets the preview follow the OS ("light dark") for the normal theme', () => {
    const root = { style: { colorScheme: 'only light' } }
    applyPreviewColorScheme(fakeIframe(root), 'normal')
    expect(root.style.colorScheme).toBe('light dark')
  })

  it('does nothing when the iframe exposes no document (e.g. cross-origin embeds)', () => {
    expect(() => applyPreviewColorScheme(fakeIframe(), 'dark')).not.toThrow()
  })
})
