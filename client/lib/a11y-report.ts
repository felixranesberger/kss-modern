import type { Result as AxeResult, AxeResults, ImpactValue, resultGroups } from 'axe-core'
import type { Message as HTMLValidateMessage } from 'html-validate'
import type { AccessibilityAuditDetail, ModifierContrastDetail } from './audit-runner.ts'
import type { ColorSchemeMode, SchemeContrastResult } from './color-contrast-audit.ts'
import type { AnnotatedNode, ContrastAnnotation, ReviewReason } from './text-over-image-contrast.ts'
import { sectionSanitizeId } from '../utils.ts'
import { AUDIT_TIMEOUT_MS, AXE_RESULT_GROUPS, flattenAxeTarget, htmlValidateImpact, runAccessibilityAudit, runModifierContrastAudit } from './audit-runner.ts'
import { getSectionPreviews, SECTION_SELECTOR } from './section-previews.ts'

/**
 * `window.kssAudit()` — the audit the "Audit" button runs (see
 * `client/fullpage.ts`), driven across every preview on the page.
 *
 * The report must stay plain JSON: the raw audit detail carries a
 * `Map<selector, HTMLElement>`, which degrades to `{}` when read through
 * `evaluate`/CDP.
 */

export type A11yReportInclude = 'violations' | 'all'

export interface A11yReportOptions {
  /**
   * Limit the run to these sections, given as KSS references (`'3.1'`), section
   * ids (`'section-3-1'`) or a mix. Unknown entries are reported back in
   * `unmatchedSections` instead of failing the run.
   */
  sections?: string[]
  /**
   * `'violations'` (default) reports the actionable groups — violations and
   * incomplete (axe "needs review"). `'all'` additionally reports passes and
   * inapplicable, which is many times larger and rarely useful to an agent.
   */
  include?: A11yReportInclude
  /** Also audit modifier previews for color-contrast. Default `true`. */
  modifiers?: boolean
  /** Per-iframe timeout in ms. Default `30000`. */
  timeout?: number
}

export interface A11yFindingNode {
  /** CSS selector of the affected element, relative to the preview document. */
  target?: string
  /** Outer HTML of the affected element (axe only, truncated by axe itself). */
  html?: string
  /** axe's explanation of why this node failed. */
  failureSummary?: string
  /** Measured text-over-image contrast, when it could be sampled. */
  measured?: ContrastAnnotation['measured']
  /** Why a color-contrast node stays "needs review". */
  reviewReason?: ReviewReason
  /** Position in the rendered fullpage document (html-validate only). */
  line?: number
  column?: number
}

export interface A11yFinding {
  source: 'axe' | 'html-validate'
  group: resultGroups
  /** Rule id, e.g. `'color-contrast'` or `'element-required-attributes'`. */
  id: string
  impact: ImpactValue | null
  description: string
  helpUrl: string
  /** Color scheme the finding was produced under (theme-dependent rules only). */
  mode?: ColorSchemeMode
  /** Modifier class the finding belongs to, for modifier-variant previews. */
  modifier?: string
  nodes: A11yFindingNode[]
}

/** Identity of an audited section: what it is and which files it came from. */
export interface A11ySectionMeta {
  /** KSS reference of the section, e.g. `'3.1'`. */
  reference: string
  header: string
  /** URL of the audited preview document. */
  url: string
  /** CSS/SCSS file the KSS comment lives in, relative to the styleguide root. */
  sourceFile?: string
  /** Line of the KSS comment's section title. */
  sourceLine?: number
  /** Markup template file, when the section uses one. */
  markupFile?: string
}

export interface A11ySectionReport extends A11ySectionMeta {
  status: 'audited' | 'failed'
  /** Present when `status` is `'failed'`. */
  error?: string
  /** Non-fatal problems, e.g. a modifier preview that could not be audited. */
  warnings?: string[]
  /** Rule counts across all four groups, regardless of the `include` filter. */
  counts: Record<resultGroups, number>
  findings: A11yFinding[]
}

export interface A11yReport {
  generatedAt: string
  page: {
    url: string
    title: string
  }
  options: {
    include: A11yReportInclude
    modifiers: boolean
    sections?: string[]
  }
  totals: {
    sections: number
    failed: number
    violations: number
    incomplete: number
  }
  /** Entries of `options.sections` that matched no section on this page. */
  unmatchedSections?: string[]
  sections: A11ySectionReport[]
}

/** A section on the page together with the iframes that have to be audited. */
export interface AuditTarget extends Omit<A11ySectionMeta, 'url'> {
  iframe: HTMLIFrameElement
  modifierIframes: HTMLIFrameElement[]
}

const REPORTED_GROUPS: Record<A11yReportInclude, resultGroups[]> = {
  violations: ['violations', 'incomplete'],
  all: AXE_RESULT_GROUPS,
}

/** `'3.1'`, `'3-1'` and `'section-3-1'` all name the same section. */
export function normalizeSectionKey(value: string): string {
  return sectionSanitizeId(value.trim()).replace(/^section-/, '')
}

/** Collect every section on the page that has a preview iframe to audit. */
export function collectAuditTargets(): AuditTarget[] {
  const sections = Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR))

  return sections.flatMap((section) => {
    // modifier previews are audited as part of their section, never on their own
    const { base, modifiers } = getSectionPreviews(section)
    if (!base)
      return []

    const sourceLine = Number.parseInt(section.dataset.sourceLine ?? '', 10)

    return [{
      reference: section.dataset.sectionReference ?? normalizeSectionKey(section.id),
      header: section.querySelector('h1, h2, h3')?.textContent?.trim() ?? '',
      iframe: base,
      modifierIframes: modifiers,
      sourceFile: section.dataset.sourceFile || undefined,
      sourceLine: Number.isNaN(sourceLine) ? undefined : sourceLine,
      markupFile: section.dataset.markupFile || undefined,
    }]
  })
}

/**
 * Restrict targets to the requested sections, reporting filters that matched
 * nothing rather than silently auditing less than the caller asked for.
 */
export function filterAuditTargets(
  targets: AuditTarget[],
  sections?: string[],
): { targets: AuditTarget[], unmatched: string[] } {
  if (!sections || sections.length === 0)
    return { targets, unmatched: [] }

  const wanted = new Set(sections.map(normalizeSectionKey))
  const available = new Set(targets.map(target => normalizeSectionKey(target.reference)))

  return {
    targets: targets.filter(target => wanted.has(normalizeSectionKey(target.reference))),
    unmatched: sections.filter(section => !available.has(normalizeSectionKey(section))),
  }
}

function toFindingNode(node: AnnotatedNode): A11yFindingNode {
  return {
    target: flattenAxeTarget(node.target),
    html: node.html || undefined,
    failureSummary: node.failureSummary || undefined,
    measured: node.measured,
    reviewReason: node.reviewReason,
  }
}

/** Map one axe result group; `toAllAxeFindings` covers a whole result set. */
function toFindings(
  group: resultGroups,
  results: AxeResult[],
  options: { mode?: ColorSchemeMode, modifier?: string } = {},
): A11yFinding[] {
  return results.map(result => ({
    source: 'axe' as const,
    group,
    id: result.id,
    impact: result.impact ?? null,
    description: result.description,
    helpUrl: result.helpUrl,
    mode: options.mode,
    modifier: options.modifier,
    nodes: result.nodes.map(node => toFindingNode(node as AnnotatedNode)),
  }))
}

function toHtmlValidateFindings(
  messages: (HTMLValidateMessage & { ruleDescription?: string })[],
): A11yFinding[] {
  // one finding per rule, with every occurrence as a node — same grouping the
  // dialog uses, and far cheaper to read than one entry per occurrence
  const byRule = new Map<string, A11yFinding>()

  messages.forEach((message) => {
    const node: A11yFindingNode = {
      target: message.selector ?? undefined,
      failureSummary: message.message,
      line: message.line,
      column: message.column,
    }

    const existing = byRule.get(message.ruleId)
    if (existing) {
      existing.nodes.push(node)
      return
    }

    byRule.set(message.ruleId, {
      source: 'html-validate',
      group: 'violations',
      id: message.ruleId,
      impact: htmlValidateImpact(message.severity.toString()),
      description: message.ruleDescription || message.message,
      helpUrl: message.ruleUrl || '',
      nodes: [node],
    })
  })

  return Array.from(byRule.values())
}

function emptyCounts(): Record<resultGroups, number> {
  return { violations: 0, incomplete: 0, passes: 0, inapplicable: 0 }
}

/**
 * Build one section's report entry. DOM-free on purpose: that is what keeps the
 * serialization guarantee testable without a browser.
 */
export function buildSectionReport(
  target: A11ySectionMeta,
  details: {
    base: AccessibilityAuditDetail
    modifiers?: ModifierContrastDetail[]
    warnings?: string[]
  },
  include: A11yReportInclude = 'violations',
): A11ySectionReport {
  const { base, modifiers = [], warnings = [] } = details

  const reportedGroups = REPORTED_GROUPS[include]
  const counts = emptyCounts()
  const findings: A11yFinding[] = []

  // count every group, but only materialize the reported ones — axe evaluates
  // ~100 rules per run and the default filter keeps a handful
  const collect = (result: AxeResults, options: { mode?: ColorSchemeMode, modifier?: string } = {}) => {
    AXE_RESULT_GROUPS.forEach((group) => {
      counts[group] += result[group].length
      if (reportedGroups.includes(group))
        findings.push(...toFindings(group, result[group], options))
    })
  }

  // color-contrast runs once per color scheme; tag each finding with its mode
  // so a failure in either theme is surfaced and attributable
  const collectContrast = (colorContrast: SchemeContrastResult[], modifier?: string) => {
    colorContrast.forEach(({ mode, result }) => collect(result, { mode, modifier }))
  }

  collect(base.axe.result)
  collectContrast(base.axe.colorContrast)
  modifiers.forEach(detail => collectContrast(detail.colorContrast, detail.modifier))

  const htmlValidateFindings = toHtmlValidateFindings(base.htmlValidate)
  counts.violations += htmlValidateFindings.length
  findings.push(...htmlValidateFindings)

  return {
    ...target,
    status: 'audited',
    warnings: warnings.length > 0 ? warnings : undefined,
    counts,
    findings,
  }
}

/** Run `task` over `items`, keeping at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  )

  return results
}

const IFRAME_READY_TIMEOUT_MS = 10_000

/**
 * Sections audited at once. All previews are same-origin children sharing one
 * main thread, so this only overlaps their async gaps (loading axe, fetching the
 * document for html-validate) — raising it would not parallelize the axe runs.
 */
const SECTION_CONCURRENCY = 2

/**
 * Wait until the given previews have rendered — auditing an empty document
 * would report a clean bill of health for markup that was never measured.
 *
 * `client/lib/iframe.ts` has an equivalent wait, but it belongs to the
 * `preview-inline` bundle, which is inlined as a classic <script>: importing
 * from it here would split it into a chunk whose `import` that script cannot
 * execute. Hence the copy.
 */
async function waitForPreviewIframes(iframes: HTMLIFrameElement[]): Promise<void> {
  const isReady = (iframe: HTMLIFrameElement) => {
    const doc = iframe.contentWindow?.document
    return Boolean(doc && doc.readyState === 'complete' && doc.body && doc.body.children.length > 0)
  }

  const deadline = Date.now() + IFRAME_READY_TIMEOUT_MS
  while (!iframes.every(isReady) && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 100))
}

export interface AuditDeps {
  runAccessibilityAudit: typeof runAccessibilityAudit
  runModifierContrastAudit: typeof runModifierContrastAudit
  waitForIframes: (iframes: HTMLIFrameElement[]) => Promise<void>
}

const defaultDeps: AuditDeps = {
  runAccessibilityAudit,
  runModifierContrastAudit,
  waitForIframes: waitForPreviewIframes,
}

/**
 * Audit every component preview on the page. A section whose iframe never
 * answers is reported as `failed` rather than taking down the run — a partial
 * report is still actionable, an exception is not.
 */
export async function runStyleguideAudit(
  options: A11yReportOptions = {},
  deps: AuditDeps = defaultDeps,
): Promise<A11yReport> {
  const include = options.include ?? 'violations'
  const withModifiers = options.modifiers ?? true
  const timeout = options.timeout ?? AUDIT_TIMEOUT_MS

  const { targets, unmatched } = filterAuditTargets(collectAuditTargets(), options.sections)

  const sections = await mapWithConcurrency(targets, SECTION_CONCURRENCY, async (target): Promise<A11ySectionReport> => {
    const { iframe, modifierIframes: allModifiers, ...rest } = target
    const meta: A11ySectionMeta = { ...rest, url: iframe.src }
    const modifierIframes = withModifiers ? allModifiers : []

    try {
      // per section, not page-wide: early sections audit while later previews
      // still load, and one dead iframe stalls only its own section
      await deps.waitForIframes([iframe, ...modifierIframes])

      const baseDetail = await deps.runAccessibilityAudit(iframe, { timeout })

      const warnings: string[] = []
      const modifiers: ModifierContrastDetail[] = []

      // sequential on purpose: bounding the work per section keeps a page with
      // dozens of previews from firing all of their audits at once
      for (const iframe of modifierIframes) {
        try {
          modifiers.push(await deps.runModifierContrastAudit(iframe, { timeout }))
        }
        catch (error) {
          warnings.push(
            `Modifier "${iframe.getAttribute('data-modifier')}" could not be audited: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      return buildSectionReport(meta, { base: baseDetail, modifiers, warnings }, include)
    }
    catch (error) {
      return {
        ...meta,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        counts: emptyCounts(),
        findings: [],
      }
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    page: {
      url: window.location.href,
      title: document.title,
    },
    options: {
      include,
      modifiers: withModifiers,
      sections: options.sections,
    },
    totals: {
      sections: sections.length,
      failed: sections.filter(section => section.status === 'failed').length,
      violations: sections.reduce((sum, section) => sum + section.counts.violations, 0),
      incomplete: sections.reduce((sum, section) => sum + section.counts.incomplete, 0),
    },
    unmatchedSections: unmatched.length > 0 ? unmatched : undefined,
    sections,
  }
}
