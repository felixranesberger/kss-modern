import type {
  Result as AxeResult,
  AxeResults,
  CrossTreeSelector,
  ImpactValue,
  resultGroups,
  UnlabelledFrameSelector,
} from 'axe-core'
import type { Message as HTMLValidateMessage } from 'html-validate'
import { each, when } from '../../lib/template-utils.ts'
import { highlightCode } from '../code-highlight'
import { id } from '../utils.ts'

declare global {
  interface Window {
    validator: {
      referenceMap: Map<string, HTMLElement>
      logReferenceAlert: (element: HTMLElement) => void
    }
  }
}

interface ConsoleStyles {
  header: string
  elementStyle: string
  messageStyle: string
}

const styles: ConsoleStyles = {
  header: [
    'background: #ff5757',
    'color: white',
    'padding: 8px 12px',
    'border-radius: 4px 4px 0 0',
    'font-weight: bold',
    'font-size: 14px',
  ].join(';'),

  elementStyle: [
    'color: #d32f2f',
    'font-weight: bold',
    'font-family: monospace',
  ].join(';'),

  messageStyle: [
    'color: #333',
    'font-style: italic',
  ].join(';'),
}

function prettyValidationError<T extends HTMLElement>(error: string, element: T): void {
  console.group('%cValidation Error', styles.header)

  console.info(
    '%c%o',
    styles.elementStyle,
    element,
  )

  console.info(
    '%c%s',
    styles.messageStyle,
    error,
  )

  console.groupEnd()
}

interface AccessibilityTestResultEvent extends CustomEvent {
  detail: {
    axe: {
      result: AxeResults
      targetMap: Map<CrossTreeSelector, HTMLElement>
    }
    htmlValidate: (HTMLValidateMessage & {
      ruleDescription?: string
    })[]
  }
}

// Add interface for iframe window
interface IFrameWindow extends Window {
  runAccessibilityTest: () => Promise<void>
}

export async function auditCode(codeAuditTrigger: HTMLButtonElement, auditResultDialog: HTMLDialogElement, closeDialog: () => Promise<void>) {
  const codeAuditIframeSelector = codeAuditTrigger.getAttribute('data-code-audit-iframe')
  if (!codeAuditIframeSelector)
    throw new Error('No code audit template selector provided')

  const codeAuditIFrame = document.querySelector<HTMLIFrameElement>(`#${codeAuditIframeSelector}`)
  if (!codeAuditIFrame)
    throw new Error('Code audit template not found')

  if (!codeAuditIFrame.contentWindow)
    throw new Error('Code audit iframe has no content window')

  const resultsList = auditResultDialog.querySelector<HTMLDivElement>('.audit-results')
  if (!resultsList)
    throw new Error('No audit results list found')

  window.validator = {
    referenceMap: new Map<string, HTMLElement>(),
    logReferenceAlert: (element: HTMLElement) => {
      const initialText = element.textContent
      element.textContent = 'Logged to console'
      setTimeout(() => {
        element.textContent = initialText
      }, 2000)
    },
  }

  const results = await new Promise<AccessibilityTestResultEvent['detail']>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Accessibility audit timed out'))
    }, 30000)

    const eventHandler = (event: Event) => {
      const castedEvent = event as AccessibilityTestResultEvent

      clearTimeout(timeout)
      codeAuditIFrame.removeEventListener('accessibility-result', eventHandler)
      resolve(castedEvent.detail)
    }

    codeAuditIFrame.addEventListener('accessibility-result', eventHandler)

    const iframeWindow = codeAuditIFrame.contentWindow as IFrameWindow
    if (iframeWindow.runAccessibilityTest) {
      iframeWindow.runAccessibilityTest()
    }
    else {
      clearTimeout(timeout)
      codeAuditIFrame.removeEventListener('accessibility-result', eventHandler)
      reject(new Error('runAxe function not found in iframe'))
    }
  })

  interface ResultNodeAxe {
    type: 'axe'
    html: string
    target: UnlabelledFrameSelector
  }

  interface ResultNodeHTMLValidate {
    type: 'htmlvalidate'
    selector: string
  }

  interface AccessibilityTest {
    id: string
    description: string
    helpUrl: string
    impact: AxeResult['impact']
    nodes: (ResultNodeAxe | ResultNodeHTMLValidate)[]
  }

  const mergedResults: Record<resultGroups, AccessibilityTest[]> = {
    violations: [],
    incomplete: [],
    passes: [],
    inapplicable: [],
  }

  // add axe results
  const pushAxeResults = (type: resultGroups, axeResults: AxeResult[]) => {
    const output = axeResults.map(result => ({
      id: result.id,
      description: result.description,
      helpUrl: result.helpUrl,
      impact: result.impact,
      nodes: result.nodes.map(node => ({
        type: 'axe',
        html: node.html || '',
        target: node.target,
      })),
    }) satisfies AccessibilityTest)

    mergedResults[type].push(...output)
  }

  pushAxeResults('violations', results.axe.result.violations)
  pushAxeResults('incomplete', results.axe.result.incomplete)
  pushAxeResults('passes', results.axe.result.passes)
  pushAxeResults('inapplicable', results.axe.result.inapplicable)

  // add html-validate results
  function calculateHtmlValidatorImpact(ruleId: string, severity: string): ImpactValue {
    switch (severity) {
      case 'off':
      case '0':
        return 'minor'
      case 'warn':
      case '1':
        return 'moderate'
      case 'error':
      case '2':
        return 'serious'
      default:
        throw new Error(`Invalid severity "${severity}" for rule "${ruleId}"`)
    }
  }

  results.htmlValidate.forEach((message) => {
    const alreadyPresentViolation = mergedResults.violations.find(violation => violation.id === message.ruleId)
    if (alreadyPresentViolation) {
      alreadyPresentViolation.nodes.push({
        type: 'htmlvalidate',
        selector: message.selector!,
      })

      return
    }

    mergedResults.violations.push({
      id: message.ruleId,
      description: message.ruleDescription || message.message,
      helpUrl: message.ruleUrl || '',
      impact: calculateHtmlValidatorImpact(message.ruleId, message.severity.toString()),
      nodes: [{
        type: 'htmlvalidate',
        selector: message.selector!,
      }],
    })
  })

  const axeTargetMap = results.axe.targetMap

  const renderSection = (
    impact: resultGroups,
    labelIcon: string,
    results: AccessibilityTest[],
  ) => {
    const label = impact.charAt(0).toUpperCase() + impact.slice(1)

    // sort results by severity: critical, serious, moderate, minor
    const severityOrder = ['critical', 'serious', 'moderate', 'minor'] as const
    const sortedResults = results.toSorted((a, b) => {
      const aIndex = severityOrder.indexOf(a.impact || 'minor')
      const bIndex = severityOrder.indexOf(b.impact || 'minor')
      return aIndex - bIndex
    })

    const renderNodeAxe = (node: ResultNodeAxe) => {
      const elements = node.target
        .map(selector => axeTargetMap.get(selector))
        .filter(Boolean) as HTMLElement[]

      if (elements.length === 0)
        throw new Error(`No elements found for axe-core target: ${node.target}`)

      return `
        ${each(elements, (element) => {
          const refId = id.next().value
          window.validator.referenceMap.set(refId, element)

          return `
            <button 
                class="block font-mono py-1.5 text-[13px] text-blue-600 text-sm cursor-pointer text-left"
                onclick="console.log(window.validator.referenceMap.get('${refId}')); window.validator.logReferenceAlert(this)"
              >
                ${node.target.join(' ')}
            </button>
          `
        })}
      `
    }

    const renderNodeHtmlValidate = (node: ResultNodeHTMLValidate) => {
      let element = codeAuditIFrame.contentWindow?.querySelectorAnywhere(node.selector) as HTMLElement | null | undefined

      // If the element is inside a <template>, point to the template element itself
      if (element && !element.isConnected) {
        const templates = codeAuditIFrame.contentDocument?.querySelectorAll<HTMLTemplateElement>('template')
        element = templates
          ? Array.from(templates).find(t => t.content.contains(element!)) ?? null
          : null
      }

      if (!element)
        throw new Error(`Element not found for selector: ${node.selector}`)

      const refId = id.next().value
      window.validator.referenceMap.set(refId, element)

      return `
        <button
            type="button"
            class="block font-mono py-1.5 text-[13px] text-blue-600 text-sm cursor-pointer text-left"
            onclick="console.log(window.validator.referenceMap.get('${refId}')); window.validator.logReferenceAlert(this)"
          >
            ${node.selector}
        </button>
      `
    }

    return `
      ${when(sortedResults.length > 0, () => `
        <li>
          <details${['violations', 'incomplete'].includes(impact) ? ' open' : ''}>
            <summary class="cursor-pointer">
              <h3 class="px-6 py-4 text-sm font-semibold leading-[1]">
                <span class="mr-2" aria-hidden="true">${labelIcon}</span>
                <span class="text-styleguide-highlight">${label}:</span>
                <span class="ml-2">(${results.length})</span>        
              </h3>
            </summary>
            
            <div class="px-6 pb-6 text-sm code-audit-container">
               <ol>
                ${each(sortedResults, result => `
                  <li class="ml-6 border-b border-styleguide-border">
                    <details class="group">
                      <summary class="flex cursor-pointer group-open:text-styleguide-highlight justify-between items-center py-4 text-sm gap-2 transition">
                        <span>
                          <span class="font-semibold">${result.id}</span>
                          ${when(result.impact && ['violations', 'incomplete'].includes(impact), () => `<span>${result.impact!}</span>`)}                        
                        </span>
                       
                        <svg class="h-4 w-4 group-open:rotate-90 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"></path>
                        </svg>
                      </summary>
                      
                      <div class="pt-2 pb-6 text-sm code-audit-container">
                        <p class="mb-3">
                            ${result.description}
                        </p>
                        
                        <p class="mb-3 pb-3 border-b border-styleguide-border">
                          <a 
                            class="flex gap-1 group/link items-center text-sm text-blue-600" 
                            href="${result.helpUrl}" 
                            target="_blank"
                          >
                            Learn more about the rule
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-3 w-3">
                              <path class="transition group-hover/link:translate-x-px group-hover/link:-translate-y-px group-focus/link:translate-x-px group-focus/link:-translate-y-px" d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"></path>
                              <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"></path>
                            </svg>
                          </a>
                        </p>
                        
                        ${when(['violations', 'incomplete'].includes(impact) && result.nodes.length > 0, () => `
                          <h3 class="font-semibold mb-2">Affected nodes (${result.nodes.length}):</h3>
    
                          <ol class="!pl-0 !list-none">
                            ${each(result.nodes, node => `
                              <li>
                                ${when(node.type === 'axe', () => `${renderNodeAxe(node as ResultNodeAxe)}`)}
                                ${when(node.type === 'htmlvalidate', () => `${renderNodeHtmlValidate(node as ResultNodeHTMLValidate)}`)}
                              </li>
                            `)}  
                          </ol>
                        `)}
                      </div>
                    </details>
                  </li>
                `)}
              </ol>
            </div>
          </details>
      </li>
      `)}
  `
  }

  const axeViolationIcon = mergedResults.violations.length > 0 ? '🔴' : '🟢'
  const axeIncompleteIcon = mergedResults.incomplete.length > 0 ? '🟠' : '🟢'

  resultsList.innerHTML = `
    ${renderSection('violations', axeViolationIcon, mergedResults.violations)}
    ${renderSection('incomplete', axeIncompleteIcon, mergedResults.incomplete)}
    ${renderSection('passes', '🟢', mergedResults.passes)}
    ${renderSection('inapplicable', '⚪', mergedResults.inapplicable)}
  `

  const codeHighlights = resultsList.querySelectorAll<HTMLElement>('[data-source-code]')
  codeHighlights.forEach(e => highlightCode(e))

  const iframeSelectors = resultsList.querySelectorAll<HTMLButtonElement>('[data-iframe-selector]')
  iframeSelectors.forEach((selector) => {
    const message = selector.getAttribute('data-iframe-selector')
    if (!message)
      throw new Error('No message found')

    selector.addEventListener('click', async () => {
      await closeDialog()

      const selectorContent = selector.textContent
      if (!selectorContent)
        throw new Error('No selector found')

      const elements = codeAuditIFrame.contentDocument?.querySelectorAll<HTMLElement>(selectorContent)
      if (!elements)
        throw new Error('No elements found')

      elements.forEach((element) => {
        prettyValidationError(message, element)
        element.style.outline = '2px solid red'
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => element.style.outline = '', 5000)
      })
    })
  })
}
