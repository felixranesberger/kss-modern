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

type AuditFunctionName = 'runAccessibilityTest'

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

/** The full audit of a modifier-variant iframe, tagged with its modifier class. */
export interface ModifierAuditDetail extends AccessibilityAuditDetail {
  modifier: string
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

/**
 * Run the full audit inside a modifier-variant iframe. A modifier of a Pug section is its own
 * render and can change structure and ARIA, not only classes, so it gets the same checks as the base.
 */
export async function runModifierAudit(
  iframe: HTMLIFrameElement,
  options?: AuditCallOptions,
): Promise<ModifierAuditDetail> {
  const detail = await callInIframe<AccessibilityAuditDetail>(iframe, 'runAccessibilityTest', options)
  return { ...detail, modifier: iframe.getAttribute('data-modifier') ?? '' }
}

/** The groups a modifier reports. Its passes and inapplicable rules would repeat the base's. */
const MODIFIER_GROUPS: resultGroups[] = ['violations', 'incomplete']

function axeNodeKeys(result: AxeResults, prefix: string): Set<string> {
  return new Set(MODIFIER_GROUPS.flatMap(group => result[group].flatMap(rule =>
    rule.nodes.map(node => `${prefix}|${group}|${rule.id}|${flattenAxeTarget(node.target)}`),
  )))
}

/** Keep the nodes of `result` whose key is not in `baseKeys`, and drop rules left without nodes. */
function withoutAxeNodes(result: AxeResults, baseKeys: Set<string>, prefix: string): AxeResults {
  const filtered = { ...result, passes: [], inapplicable: [] } as AxeResults
  MODIFIER_GROUPS.forEach((group) => {
    filtered[group] = result[group]
      .map(rule => ({ ...rule, nodes: rule.nodes.filter(node => !baseKeys.has(`${prefix}|${group}|${rule.id}|${flattenAxeTarget(node.target)}`)) }))
      .filter(rule => rule.nodes.length > 0)
  })
  return filtered
}

function htmlValidateKey(message: AccessibilityAuditDetail['htmlValidate'][number]): string {
  return `${message.ruleId}|${message.selector ?? ''}|${message.message}`
}

/**
 * A modifier's audit without the findings the base preview already has, so a problem shared by
 * every variant is reported once. A finding counts as the same when rule, result group, color
 * scheme and element selector match, for html-validate when rule, selector and message match.
 * Passes and inapplicable rules stay with the base.
 */
export function withoutBaseFindings(base: AccessibilityAuditDetail, modifier: ModifierAuditDetail): ModifierAuditDetail {
  const baseAxeKeys = axeNodeKeys(base.axe.result, 'axe')
  const baseContrastKeys = new Set(base.axe.colorContrast.flatMap(({ mode, result }) => [...axeNodeKeys(result, mode)]))
  const baseHtmlValidateKeys = new Set(base.htmlValidate.map(htmlValidateKey))

  return {
    ...modifier,
    axe: {
      ...modifier.axe,
      result: withoutAxeNodes(modifier.axe.result, baseAxeKeys, 'axe'),
      colorContrast: modifier.axe.colorContrast.map(entry => ({ ...entry, result: withoutAxeNodes(entry.result, baseContrastKeys, entry.mode) })),
    },
    htmlValidate: modifier.htmlValidate.filter(message => !baseHtmlValidateKeys.has(htmlValidateKey(message))),
  }
}
