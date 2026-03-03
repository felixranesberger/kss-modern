import type { StyleguideConfiguration } from '../../lib/index.ts'

export function createMinimalConfig(overrides: Partial<StyleguideConfiguration> = {}): StyleguideConfiguration {
  return {
    mode: 'production',
    outDir: 'styleguide-export',
    contentDir: 'example-styleguide/',
    projectTitle: 'Test Styleguide',
    theme: '#3F5E5A',
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
