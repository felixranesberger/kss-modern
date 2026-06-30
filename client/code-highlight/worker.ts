import type { HighlighterCore } from 'shiki/core'
import htmlLang from '@shikijs/langs/html'
import auroraX from '@shikijs/themes/aurora-x'
import githubLightDefault from '@shikijs/themes/github-light-default'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

let highlighter: HighlighterCore

export async function createShikiHighlighter() {
  if (highlighter)
    return

  highlighter = await createHighlighterCore({
    themes: [
      auroraX,
      githubLightDefault,
    ],
    langs: [
      htmlLang,
    ],
    engine: createJavaScriptRegexEngine(),
  })
}

globalThis.addEventListener('message', async (event: MessageEvent<{ lang: 'html' | 'text', text: string }>) => {
  if (!highlighter) {
    await createShikiHighlighter()
  }

  const result = highlighter.codeToHtml(event.data.text, {
    lang: event.data.lang,
    themes: {
      light: 'github-light-default',
      dark: 'aurora-x',
    },
  })

  globalThis.postMessage(result)
})
