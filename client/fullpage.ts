import type { CrossTreeSelector, NodeResult, Result } from 'axe-core'
import { stripPugErrorOverlay } from '../lib/shared.ts'
import { definePugErrorOverlay } from './lib/pug-error-overlay.ts'
import { queryWithinTemplates } from './lib/query-within-templates.ts'

declare global {
  interface Window {
    runAccessibilityTest: () => Promise<void>
    querySelectorAnywhere: (selector: string) => Element | null
  }
}

interface ModifierReplacerConfig {
  modifier: string
  placeholder?: string
}

class ModifierReplacer {
  private readonly modifier: string
  private readonly placeholder: string

  constructor(config: ModifierReplacerConfig) {
    this.modifier = config.modifier
    this.placeholder = config.placeholder || '{{modifier_class}}'
  }

  public initialize(targetDocument: Document = document): void {
    if (!this.modifier) {
      return
    }
    this.replaceInDocument(targetDocument)
  }

  public static fromIframe(targetDocument: Document = document): ModifierReplacer | null {
    if (!window.frameElement)
      throw new Error('ModifierReplacer can only be initialized from an iframe context.')

    const modifier = window.frameElement.getAttribute('data-modifier')

    if (!modifier) {
      return null
    }

    const computedModifier = modifier.split('.').filter(x => x.length > 0).join(' ')
    const replacer = new ModifierReplacer({ modifier: computedModifier })
    replacer.initialize(targetDocument)
    return replacer
  }

  public static fromUrl(targetDocument: Document = document): ModifierReplacer | null {
    const params = new URLSearchParams(window.location.search)
    const modifier = params.get('modifier')

    if (!modifier) {
      return null
    }

    const computedModifier = modifier.split('.').filter(x => x.length > 0).join(' ')
    const replacer = new ModifierReplacer({ modifier: computedModifier })
    replacer.initialize(targetDocument)
    return replacer
  }

  private replaceAll(text: string): string {
    // Handle the regular placeholder
    const encodedPlaceholder = encodeURIComponent(JSON.stringify(this.placeholder))

    // Handle the specific encoded case
    const jsonObject = JSON.stringify({ modifierClass: this.placeholder })
    const encodedJsonObject = encodeURIComponent(jsonObject)

    return text
      .replace(new RegExp(this.escapeRegExp(this.placeholder), 'g'), this.modifier)
      .replace(new RegExp(this.escapeRegExp(encodedPlaceholder), 'g'), this.modifier)
      .replace(new RegExp(this.escapeRegExp(encodedJsonObject), 'g'), this.modifier)
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private replaceInDocument(targetDocument: Document): void {
    const walker = targetDocument.createTreeWalker(
      targetDocument.body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (): number => NodeFilter.FILTER_ACCEPT,
      },
    )

    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeType === Node.TEXT_NODE) {
        this.replaceInTextNode(node as Text)
      }
      else if (node.nodeType === Node.ELEMENT_NODE) {
        this.replaceInElementAttributes(node as Element)
      }
    }
  }

  private replaceInTextNode(node: Text): void {
    if (node.textContent) {
      const originalText = node.textContent
      const newText = this.replaceAll(originalText)
      if (originalText !== newText) {
        node.textContent = newText
      }
    }
  }

  private replaceInElementAttributes(element: Element): void {
    Array.from(element.attributes).forEach((attr) => {
      const originalValue = attr.value
      const newValue = this.replaceAll(originalValue)
      if (originalValue !== newValue) {
        attr.value = newValue
      }
    })
  }
}

// add styleguide preview class when in iframe preview mode
if (window.frameElement) {
  if (window.frameElement.getAttribute('data-preview') === 'true') {
    document.documentElement.classList.add('styleguide-preview')
  }

  if (window.frameElement.hasAttribute('data-modifier')) {
    ModifierReplacer.fromIframe()
  }

  // This function is executed by the parent, when we want to run a code audit
  window.runAccessibilityTest = async () => {
    const runAxe = async () => {
      const { default: axe } = await import('axe-core')

      const result = await axe.run({
        include: [['body']],
        // the dev-only pug compile-error overlay is not part of the section's content
        exclude: [['pug-error-overlay']],
      }, {
        rules: {
          // color contrast can't be calculated correctly yet in axe-core
          // when using dark-mode. See: https://github.com/dequelabs/axe-core/issues/3605
          'color-contrast': { enabled: false },
          'region': { enabled: false },
          'landmark-one-main': { enabled: false },
        },
      }).catch(console.error)

      if (!result)
        throw new Error('No results from runAccessibilityTest function')

      const targetMap = new Map<CrossTreeSelector, HTMLElement>()

      const fillTargetMap = (results: Result[]) => {
        results.forEach((result) => {
          result.nodes.forEach((node: NodeResult) => {
            node.target.forEach((selector) => {
              const element = axe.utils.shadowSelect(selector)
              if (!element)
                return

              targetMap.set(selector, element as HTMLElement)
            })
          })
        })
      }

      fillTargetMap(result.violations)
      fillTargetMap(result.inapplicable)
      fillTargetMap(result.passes)
      fillTargetMap(result.incomplete)

      return {
        result,
        targetMap,
      }
    }

    const runHtmlValidate = async () => {
      const { HtmlValidate, StaticConfigLoader } = await import('html-validate/browser')
      const loader = new StaticConfigLoader()
      const validator = new HtmlValidate(loader)

      const response = await fetch(window.location.href)
      if (!response.ok) {
        throw new Error(`Failed to fetch document for html-validate: ${response.status} ${response.statusText}`)
      }

      // drop the dev-only pug compile-error overlay so it isn't reported as a section a11y issue
      const html = stripPugErrorOverlay(await response.text())
      const { results } = await validator.validateString(html, {
        rules: {
          'no-trailing-whitespace': 'off',
          'no-inline-style': 'off',
        },
      })

      const messages = results.map(r => r.messages).flat()

      return await Promise.all(messages.map(async (message) => {
        const ruleContext = await validator.getContextualDocumentation(message)
        const ruleDescription = ruleContext?.description

        return {
          ...message,
          ruleDescription,
        }
      }))
    }

    const [axeResult, htmlValidateResult] = await Promise.all([
      runAxe(),
      runHtmlValidate(),
    ])

    const event = new CustomEvent('accessibility-result', {
      detail: {
        axe: axeResult,
        htmlValidate: htmlValidateResult,
      },
    })

    window.frameElement?.dispatchEvent(event)
  }
}
else {
  const params = new URLSearchParams(window.location.search)
  const modifier = params.get('modifier')
  if (modifier) {
    ModifierReplacer.fromUrl()
  }
}

// register the dev-only pug compile-error overlay element (no-op once defined); the SSR side emits the
// bare <pug-error-overlay> tag and relies on this fullpage bundle to upgrade it into the error UI
definePugErrorOverlay()

// query selector that also searches inside template elements
window.querySelectorAnywhere = (selector: string) => queryWithinTemplates(document, selector)
