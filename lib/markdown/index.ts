import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import fs from 'fs-extra'
import MarkdownItAsync from 'markdown-it-async'
import { codeToHtml } from 'shiki'
import { logger } from '../logger.ts'
import { accordionRenderer } from './plugins/components/accordion.ts'
import { alertRenderer } from './plugins/components/alert.ts'
import { markdownItComponent } from './plugins/custom-component-renderer.ts'

let md: ReturnType<typeof MarkdownItAsync> | undefined

/**
 * Shifts heading levels in a markdown string based on a root heading level.
 */
function shiftHeadingLevels(markdownContent: string, rootHeadingLevel: 1 | 2): string {
  const getHasHeadingLevel = (level: number) => new RegExp(`^#{${level}} `, 'm').test(markdownContent)

  const shiftDown = (shiftAmount: number) => {
    return markdownContent.replace(/^(#{1,6}) (.*)$/gm, (_, hashes, text) => {
      const newLevel = Math.min(hashes.length + shiftAmount, 6)
      return `${'#'.repeat(newLevel)} ${text}`
    })
  }

  const hasH1 = getHasHeadingLevel(1)
  const hasH2 = getHasHeadingLevel(2)

  if (rootHeadingLevel === 1 && hasH1) {
    return shiftDown(1)
  }

  if (rootHeadingLevel === 2 && (hasH1 || hasH2)) {
    const shiftDownLevel = hasH1 ? 2 : 1
    return shiftDown(shiftDownLevel)
  }

  return markdownContent
}

interface MarkdownOptionsBase {
  rootHeadingLevel: 1 | 2
}

/**
 * Parse markdown file to HTML
 */
export async function parseMarkdown(data: MarkdownOptionsBase & {
  filePath: string
} | MarkdownOptionsBase & {
  markdownContent: string
}) {
  // Initialize Markdown parser
  if (!md) {
    md = MarkdownItAsync({ linkify: true, typographer: true })
    md.use(markdownItComponent, {
      components: {
        alert: alertRenderer,
        accordion: accordionRenderer,
      },
    })
    md.use(
      fromAsyncCodeToHtml(
        codeToHtml,
        {
          themes: {
            light: 'github-light-default',
            dark: 'aurora-x',
          },
        },
      ),
    )
  }

  if ('filePath' in data) {
    const doesFileExist = fs.existsSync(data.filePath)
    if (!doesFileExist) {
      logger.error(`Markdown file not found: "${data.filePath}"`)
      return '<p class="font-bold text-red-600">Error: Markdown file not found!</p>'
    }

    let fileContent = await fs.readFile(data.filePath, 'utf8')

    // shift heading levels if necessary
    fileContent = shiftHeadingLevels(fileContent, data.rootHeadingLevel)

    const parsedMarkdown = await md.renderAsync(fileContent)

    return parsedMarkdown
  }
  // Markdown can also be directly passed as string inside the scss file
  else {
    let fileContent = data.markdownContent
      // remove markdown specifier
      .replace('Markdown:', '')

    // shift heading levels if necessary
    fileContent = shiftHeadingLevels(fileContent, data.rootHeadingLevel)

    return await md.renderAsync(fileContent)
  }
}
