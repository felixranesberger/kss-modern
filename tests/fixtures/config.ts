import type { ResolvedStyleguideConfiguration } from '../../lib/index.ts'

/**
 * A resolved configuration — the shape everything past `resolveConfiguration` works with, and so
 * the one the templates take. Tests for the deprecated `theme` / `themes` aliases go through
 * `resolveConfiguration` itself rather than through here.
 */
export function createMinimalConfig(overrides: Partial<ResolvedStyleguideConfiguration> = {}): ResolvedStyleguideConfiguration {
  return {
    mode: 'production',
    outDir: 'styleguide-export',
    contentDir: 'example-styleguide/',
    projectTitle: 'Test Styleguide',
    brandColor: '#3F5E5A',
    previewThemes: [],
    html: {
      lang: 'en',
      assets: {
        css: [{ src: '/test/styles.css' }],
        js: [{ src: '/test/scripts.js' }],
      },
    },
    ...overrides,
  }
}
