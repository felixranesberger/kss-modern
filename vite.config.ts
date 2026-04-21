import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { Features } from 'lightningcss'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/styleguide-assets',
    emptyOutDir: true,
    lib: {
      entry: {
        'preview': resolve(__dirname, 'client/preview.ts'),
        'preview-inline': resolve(__dirname, 'client/preview-inline.ts'),
        'fullpage': resolve(__dirname, 'client/fullpage.ts'),
      },
      formats: ['es'],
      name: 'Styleguide',
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
    manifest: true,
  },
  css: {
    lightningcss: {
      // light-dark transpilation breaks at the moment and this disables it
      // https://github.com/parcel-bundler/lightningcss/issues?q=is:issue%20state:open%20light-dark
      // TODO: check if this is fixed in lightningcss:
      exclude: Features.LightDark,
    },
  },
  worker: {
    format: 'es',
  },
  plugins: [tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
