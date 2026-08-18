import type { AxeResults, CrossTreeSelector, ImpactValue, resultGroups } from 'axe-core'
import type { Message as HTMLValidateMessage } from 'html-validate'
import type { SchemeContrastResult } from './color-contrast-audit.ts'

/**
 * Bridge to the audit functions each preview iframe exposes (see
 * `client/fullpage.ts`). The audit dialog and `window.kssAudit` both go through
 * here, so they cannot drift on how an audit is invoked or read.
 *
 * The iframes are same-origin, so their functions are called directly and their
 * promise awaited across realms — no message passing. Which previews exist on
 * the page is a separate concern: `client/lib/section-previews.ts`.
 */

export const AUDIT_TIMEOUT_MS = 30_000

type AuditFunctionName = 'runAccessibilityTest' | 'runColorContrastAudit'

/** The axe result groups, in the order they are reported. */
export const AXE_RESULT_GROUPS: resultGroups[] = ['violations', 'incomplete', 'passes', 'inapplicable']

/**
 * Flatten an axe target into one selector string. A shadow-DOM entry is itself
 * an array, which plain `join(' ')` would render with a comma.
 */
export function flattenAxeTarget(target: CrossTreeSelector[]): string {
  return target.flat().join(' ')
}

/**
 * Map an html-validate severity onto the axe impact scale, so findings from
 * both tools can be ranked against each other. html-validate only ever emits
 * 0/1/2 (`off`/`warn`/`error`); anything else is treated as an error.
 */
export function htmlValidateImpact(severity: string): ImpactValue {
  switch (severity) {
    case 'off':
    case '0':
      return 'minor'
    case 'warn':
    case '1':
      return 'moderate'
    default:
      return 'serious'
  }
}

/** Result of an iframe's `runAccessibilityTest` (axe + html-validate). */
export interface AccessibilityAuditDetail {
  axe: {
    result: AxeResults
    colorContrast: SchemeContrastResult[]
    targetMap: Map<CrossTreeSelector, HTMLElement>
  }
  htmlValidate: (HTMLValidateMessage & {
    ruleDescription?: string
  })[]
}

/**
 * Result of a modifier-variant iframe's `runColorContrastAudit`:
 * color-contrast only, tagged with the iframe's modifier class.
 */
export interface ModifierContrastDetail {
  modifier?: string
  colorContrast: SchemeContrastResult[]
  targetMap: Map<CrossTreeSelector, HTMLElement>
}

export interface AuditCallOptions {
  /** Reject after this many ms if the iframe never settles. */
  timeout?: number
}

function readForeignMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message)
  return String(error)
}

/**
 * Call an audit function inside an iframe and await its result.
 *
 * The timeout guards against an audit that never settles (axe on a pathological
 * DOM, an iframe torn down mid-run). A rejection carries an Error from the
 * iframe's own realm, where `instanceof Error` is false in ours, so it is
 * re-thrown locally rather than making every caller know that.
 */
function callInIframe<T>(
  iframe: HTMLIFrameElement,
  fnName: AuditFunctionName,
  options: AuditCallOptions = {},
): Promise<T> {
  const auditFn = iframe.contentWindow?.[fnName]
  if (typeof auditFn !== 'function')
    return Promise.reject(new Error(`${fnName} not found in iframe`))

  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Accessibility audit timed out (${fnName})`)),
      options.timeout ?? AUDIT_TIMEOUT_MS,
    )
  })

  return Promise.race([auditFn() as Promise<T>, timeout])
    .catch((error: unknown) => {
      throw error instanceof Error ? error : new Error(readForeignMessage(error))
    })
    .finally(() => clearTimeout(timer))
}

/** Run the full audit (axe + html-validate) inside a preview iframe. */
export function runAccessibilityAudit(
  iframe: HTMLIFrameElement,
  options?: AuditCallOptions,
): Promise<AccessibilityAuditDetail> {
  return callInIframe<AccessibilityAuditDetail>(iframe, 'runAccessibilityTest', options)
}

/** Run the color-contrast-only audit inside a modifier-variant iframe. */
export function runModifierContrastAudit(
  iframe: HTMLIFrameElement,
  options?: AuditCallOptions,
): Promise<ModifierContrastDetail> {
  return callInIframe<ModifierContrastDetail>(iframe, 'runColorContrastAudit', options)
}
