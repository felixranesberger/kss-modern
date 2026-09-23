```ts
import { buildStyleguide } from 'kss-modern'

await buildStyleguide({
  mode: 'production',
  outDir: './styleguide',
  contentDir: './src/css/',
  projectTitle: 'My Design System',
  brandColor: { light: '#2563eb', dark: '#ffffff' },
  html: {
    lang: 'en',
    assets: {
      css: [{ src: '/css/styles.css' }],
      js: [{ src: '/js/main.js', additionalAttributes: { type: 'module' } }],
    },
  },
})
```
