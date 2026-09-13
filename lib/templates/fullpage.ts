import type { StyleguideConfiguration } from '../index.ts'
import { sanitizeSpecialCharacters, themeClassList } from '../shared.ts'
import { logicalWriteFile } from '../utils.ts'

export async function generateFullPageFile(data: {
  id: string
  filePath: string
  page: {
    title: string
    description?: string
    lang: string
    htmlclass?: string
    bodyclass?: string
  }
  css: StyleguideConfiguration['html']['assets']['css']
  js: StyleguideConfiguration['html']['assets']['js']
  themes?: StyleguideConfiguration['themes']
  html: string
  theme: StyleguideConfiguration['theme']
  deactivateDarkMode?: boolean
  ogImageUrl?: string
}) {
  // The audit iframe reads this to decide whether to run the color-contrast
  // check in a forced dark scheme. Dark mode exists unless the styleguide
  // explicitly opts out (deactivateDarkMode forces the preview into light).
  const supportsDarkMode = !(data.deactivateDarkMode ?? false)
  const computedScriptTags = data.js
    .filter(entry => entry.type !== 'overwriteStyleguide')
    .map((js) => {
      const additionalAttributes = js.additionalAttributes ? Object.entries(js.additionalAttributes).map(([key, value]) => `${key}="${value}"`).join(' ') : ''
      return `<script src="${js.src}" ${additionalAttributes}></script>`
    })
    .join('\n')

  const computedStyleTags = data.css
    .filter(entry => entry.type !== 'overwriteStyleguide')
    .map((css) => {
      return `<link rel="stylesheet" type="text/css" href="${css.src}">`
    })
    .join('\n')

  // One <link> per themed stylesheet, keyed on the theme's class list so the dropdowns can find it
  // (`client/lib/preview-theme.ts`, `client/fullpage.ts`). They sit after the regular stylesheets so
  // a theme layers on top, and start as `media="not all"`: the browser still downloads them but
  // applies nothing, so selecting a theme is an instant, request-free switch.
  const computedThemeStyleTags = (data.themes ?? [])
    .flatMap(theme => (theme.css ?? []).map(src => ({ src, classList: themeClassList(theme.value) })))
    .filter(entry => entry.classList)
    .map(entry => `<link rel="stylesheet" type="text/css" href="${entry.src}" media="not all" data-theme-css="${sanitizeSpecialCharacters(entry.classList)}">`)
    .join('\n')

  const content = `
<!DOCTYPE html>
<html lang="${data.page.lang}"${data.page.htmlclass ? ` class="scroll-smooth ${data.page.htmlclass}"` : ''} data-styleguide-dark-mode="${supportsDarkMode}">
<head>
    <title>${sanitizeSpecialCharacters(data.page.title)}</title>
    ${data.page.description ? `<meta name="description" content="${sanitizeSpecialCharacters(data.page.description)}">` : ''}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="styleguide">
    <link rel="icon" type="image/svg+xml" href="/styleguide-assets/favicon/fullpage.svg">
    ${data.ogImageUrl ? `<meta property="og:image" content="${data.ogImageUrl}">` : ''}
    ${typeof data.theme === 'object' && 'dark' in data.theme && 'light' in data.theme
      ? `
          <meta name="theme-color" media="(prefers-color-scheme: light)" content="${data.theme.light}">
          <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${data.theme.dark}">
      `
      : `<meta name="theme-color" content="${data.theme}">`}
    <script type="module" src="/styleguide-assets/__STYLEGUIDE_FULLPAGE_JS__"></script>
    ${computedStyleTags}
    ${computedThemeStyleTags}
</head>
<body${data.page.bodyclass ? ` class="${data.page.bodyclass}"` : ''}>
    ${data.html}
    ${computedScriptTags}
</body>
</html>
`.trim()

  await logicalWriteFile(data.filePath, content)
}
