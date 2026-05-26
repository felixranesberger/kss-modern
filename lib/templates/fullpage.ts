import type { StyleguideConfiguration } from '../index.ts'
import { sanitizeSpecialCharacters } from '../shared.ts'
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
  html: string
  theme: StyleguideConfiguration['theme']
  ogImageUrl?: string
}) {
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

  const content = `
<!DOCTYPE html>
<html lang="${data.page.lang}"${data.page.htmlclass ? ` class="scroll-smooth ${data.page.htmlclass}"` : ''}>
<head>
    <title>${sanitizeSpecialCharacters(data.page.title)}</title>
    ${data.page.description ? `<meta name="description" content="${sanitizeSpecialCharacters(data.page.description)}">` : ''}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="styleguide">
    ${typeof data.theme === 'object' && 'dark' in data.theme && 'light' in data.theme
      ? `
          <link rel="icon" type="image/svg+xml" href="/styleguide-assets/favicon/fullpage.svg">
      `
      : `
        <meta name="theme-color" content="${data.theme}">
        <link rel="icon" type="image/svg+xml" href="/styleguide-assets/favicon/fullpage-light.svg">
      `}
    ${data.ogImageUrl ? `<meta property="og:image" content="${data.ogImageUrl}">` : ''}
    <script type="module" src="/styleguide-assets/__STYLEGUIDE_FULLPAGE_JS__"></script>
    ${computedStyleTags}
</head>
<body${data.page.bodyclass ? ` class="${data.page.bodyclass}"` : ''}>
    ${data.html}
    ${computedScriptTags}
</body>
</html>
`.trim()

  await logicalWriteFile(data.filePath, content)
}
