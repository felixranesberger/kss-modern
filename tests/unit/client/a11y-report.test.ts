import type { Result as AxeResult, AxeResults, NodeResult } from 'axe-core'
import type { AuditDeps } from '../../../client/lib/a11y-report.ts'
import type { AccessibilityAuditDetail, ModifierContrastDetail } from '../../../client/lib/audit-runner.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSectionReport,
  collectAuditTargets,
  filterAuditTargets,
  mapWithConcurrency,
  normalizeSectionKey,
  runStyleguideAudit,
} from '../../../client/lib/a11y-report.ts'
import { flattenAxeTarget, htmlValidateImpact } from '../../../client/lib/audit-runner.ts'

// The real audit runs axe + html-validate inside a live preview iframe, which
// jsdom cannot do (see tests/e2e for that side). What is covered here is the
// part the automation contract depends on: which iframes are audited, how the
// raw details are merged, and that the report survives JSON serialization —
// the raw audit detail carries Maps and DOM nodes that silently vanish when an
// external tool reads the report through CDP.

function axeNode(partial: Partial<NodeResult> = {}): NodeResult {
  return {
    html: '<button></button>',
    target: ['button'],
    any: [],
    all: [],
    none: [],
    ...partial,
  } as NodeResult
}

function axeRule(id: string, nodes: NodeResult[] = [axeNode()]): AxeResult {
  return {
    id,
    impact: 'serious',
    description: `${id} description`,
    help: id,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.12/${id}`,
    tags: ['wcag2aa'],
    nodes,
  } as AxeResult
}

function axeResults(partial: Partial<AxeResults> = {}): AxeResults {
  return {
    violations: [],
    incomplete: [],
    passes: [],
    inapplicable: [],
    url: 'http://localhost/3.1.html',
    timestamp: '2026-08-12T00:00:00.000Z',
    toolOptions: {},
    testEngine: { name: 'axe-core', version: '4.12.1' },
    testRunner: { name: 'axe' },
    testEnvironment: { userAgent: 'jsdom', windowWidth: 800, windowHeight: 600 },
    ...partial,
  } as AxeResults
}

function baseDetail(partial: Partial<AccessibilityAuditDetail['axe']> = {}, htmlValidate: AccessibilityAuditDetail['htmlValidate'] = []): AccessibilityAuditDetail {
  return {
    axe: {
      result: axeResults(),
      colorContrast: [],
      // deliberately populated: the report must not carry this Map through
      targetMap: new Map([['button', document.createElement('button')]]),
      ...partial,
    },
    htmlValidate,
  }
}

const sectionTarget = {
  reference: '3.1',
  header: 'Accordion',
  url: 'http://localhost/3.1.html',
  sourceFile: 'css/03-components/accordion.css',
  sourceLine: 12,
  markupFile: 'templates/source/03-components/accordion.pug',
}

describe('normalizeSectionKey', () => {
  it('treats reference, dashed and prefixed forms as the same section', () => {
    expect(normalizeSectionKey('3.1')).toBe('3-1')
    expect(normalizeSectionKey('3-1')).toBe('3-1')
    expect(normalizeSectionKey('section-3-1')).toBe('3-1')
    expect(normalizeSectionKey(' 3.1 ')).toBe('3-1')
  })
})

describe('flattenAxeTarget', () => {
  it('joins a plain target', () => {
    expect(flattenAxeTarget(['.card', 'button'])).toBe('.card button')
  })

  it('flattens shadow-DOM targets', () => {
    expect(flattenAxeTarget([['my-widget', 'button']])).toBe('my-widget button')
  })
})

describe('htmlValidateImpact', () => {
  it('maps html-validate severities onto axe impact levels', () => {
    expect(htmlValidateImpact('off')).toBe('minor')
    expect(htmlValidateImpact('0')).toBe('minor')
    expect(htmlValidateImpact('warn')).toBe('moderate')
    expect(htmlValidateImpact('1')).toBe('moderate')
    expect(htmlValidateImpact('error')).toBe('serious')
    expect(htmlValidateImpact('2')).toBe('serious')
  })
})

describe('collectAuditTargets', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function renderSection(options: { id: string, reference?: string, modifiers?: string[], withPreview?: boolean } = { id: 'section-3-1' }) {
    const { id, reference, modifiers = [], withPreview = true } = options

    document.body.insertAdjacentHTML('beforeend', `
      <section
        id="${id}"
        class="styleguide-section"
        ${reference ? `data-section-reference="${reference}"` : ''}
        data-source-file="css/03-components/accordion.css"
        data-source-line="12"
        data-markup-file="templates/source/03-components/accordion.pug"
      >
        <h2>Accordion</h2>
        ${withPreview ? `<iframe id="preview-${id}" class="preview-iframe" src="/3.1.html" data-preview="true"></iframe>` : ''}
        ${modifiers.map(modifier => `<iframe class="preview-iframe" src="/3.1.html" data-preview="true" data-modifier="${modifier}"></iframe>`).join('')}
      </section>
    `)
  }

  it('reports the base preview and its source metadata', () => {
    renderSection({ id: 'section-3-1', reference: '3.1' })

    const targets = collectAuditTargets()
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      reference: '3.1',
      header: 'Accordion',
      sourceFile: 'css/03-components/accordion.css',
      sourceLine: 12,
      markupFile: 'templates/source/03-components/accordion.pug',
    })
    expect(targets[0].iframe.id).toBe('preview-section-3-1')
  })

  it('groups modifier previews under their section instead of auditing them standalone', () => {
    renderSection({ id: 'section-3-1', reference: '3.1', modifiers: ['.is-open', '.is-disabled'] })

    const targets = collectAuditTargets()
    expect(targets).toHaveLength(1)
    expect(targets[0].iframe.hasAttribute('data-modifier')).toBe(false)
    expect(targets[0].modifierIframes.map(iframe => iframe.getAttribute('data-modifier')))
      .toEqual(['.is-open', '.is-disabled'])
  })

  it('skips sections without a preview (colors, icons, description-only)', () => {
    renderSection({ id: 'section-1-1', reference: '1.1', withPreview: false })
    expect(collectAuditTargets()).toEqual([])
  })

  it('falls back to the DOM id when the reference attribute is missing', () => {
    renderSection({ id: 'section-3-1' })
    expect(collectAuditTargets()[0].reference).toBe('3-1')
  })
})

describe('filterAuditTargets', () => {
  const targets = [
    { reference: '3.1' },
    { reference: '3.2' },
  ] as ReturnType<typeof collectAuditTargets>

  it('returns everything when no filter is given', () => {
    expect(filterAuditTargets(targets).targets).toHaveLength(2)
    expect(filterAuditTargets(targets, []).targets).toHaveLength(2)
  })

  it('accepts references, dashed ids and section ids alike', () => {
    expect(filterAuditTargets(targets, ['3.1']).targets.map(t => t.reference)).toEqual(['3.1'])
    expect(filterAuditTargets(targets, ['section-3-2']).targets.map(t => t.reference)).toEqual(['3.2'])
  })

  it('reports filters that matched nothing instead of silently auditing less', () => {
    const { targets: filtered, unmatched } = filterAuditTargets(targets, ['3.1', '9.9'])
    expect(filtered.map(t => t.reference)).toEqual(['3.1'])
    expect(unmatched).toEqual(['9.9'])
  })
})

describe('buildSectionReport', () => {
  it('merges axe violations and keeps the affected nodes', () => {
    const report = buildSectionReport(
      sectionTarget,
      {
        base: baseDetail({
          result: axeResults({
            violations: [axeRule('button-name', [axeNode({ target: ['.card', 'button'], failureSummary: 'Fix this' })])],
          }),
        }),
      },
    )

    expect(report.status).toBe('audited')
    expect(report.sourceFile).toBe('css/03-components/accordion.css')
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      source: 'axe',
      group: 'violations',
      id: 'button-name',
      impact: 'serious',
      nodes: [{ target: '.card button', failureSummary: 'Fix this' }],
    })
  })

  it('tags color-contrast findings with the color scheme they were found in', () => {
    const report = buildSectionReport(
      sectionTarget,
      {
        base: baseDetail({
          colorContrast: [
            { mode: 'light', result: axeResults() },
            { mode: 'dark', result: axeResults({ violations: [axeRule('color-contrast')] }) },
          ],
        }),
      },
    )

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0].mode).toBe('dark')
  })

  it('tags modifier findings with their modifier class', () => {
    const modifierDetail: ModifierContrastDetail = {
      modifier: '.is-disabled',
      colorContrast: [{ mode: 'light', result: axeResults({ violations: [axeRule('color-contrast')] }) }],
      targetMap: new Map(),
    }

    const report = buildSectionReport(sectionTarget, {
      base: baseDetail(),
      modifiers: [modifierDetail],
    })

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({ modifier: '.is-disabled', mode: 'light' })
  })

  it('keeps the measured text-over-image contrast and the review reason', () => {
    const measured = { ratio: 2.4, required: 4.5, passed: false, fg: { r: 255, g: 255, b: 255 }, worstBg: { r: 200, g: 200, b: 200 } }
    const reviewReason = { code: 'cross-origin-image', message: 'Background image is cross-origin' } as const

    const report = buildSectionReport(sectionTarget, {
      base: baseDetail({
        colorContrast: [{
          mode: 'light',
          result: axeResults({
            violations: [axeRule('color-contrast', [Object.assign(axeNode(), { measured })])],
            incomplete: [axeRule('color-contrast', [Object.assign(axeNode(), { reviewReason })])],
          }),
        }],
      }),
    })

    expect(report.findings[0].nodes[0].measured).toEqual(measured)
    expect(report.findings[1].nodes[0].reviewReason).toEqual(reviewReason)
  })

  it('groups html-validate messages by rule, one node per occurrence', () => {
    const report = buildSectionReport(sectionTarget, {
      base: baseDetail({}, [
        { ruleId: 'element-required-attributes', message: 'missing alt', severity: 2, selector: 'img:nth-child(1)', line: 4, column: 2, ruleUrl: 'https://html-validate.org/rules/element-required-attributes.html', ruleDescription: 'Required attribute missing' },
        { ruleId: 'element-required-attributes', message: 'missing alt', severity: 2, selector: 'img:nth-child(2)', line: 9, column: 2 },
        { ruleId: 'no-dup-id', message: 'duplicate id', severity: 1, selector: '#teaser', line: 12, column: 4 },
      ] as AccessibilityAuditDetail['htmlValidate']),
    })

    const required = report.findings.find(finding => finding.id === 'element-required-attributes')
    expect(required?.source).toBe('html-validate')
    expect(required?.impact).toBe('serious')
    expect(required?.description).toBe('Required attribute missing')
    expect(required?.nodes.map(node => node.target)).toEqual(['img:nth-child(1)', 'img:nth-child(2)'])
    expect(required?.nodes[0].line).toBe(4)

    expect(report.findings.find(finding => finding.id === 'no-dup-id')?.impact).toBe('moderate')
  })

  it('reports only violations and incomplete by default, but counts every group', () => {
    const report = buildSectionReport(sectionTarget, {
      base: baseDetail({
        result: axeResults({
          violations: [axeRule('button-name')],
          incomplete: [axeRule('color-contrast')],
          passes: [axeRule('image-alt'), axeRule('label')],
          inapplicable: [axeRule('video-caption')],
        }),
      }),
    })

    expect(report.findings.map(finding => finding.group)).toEqual(['violations', 'incomplete'])
    expect(report.counts).toEqual({ violations: 1, incomplete: 1, passes: 2, inapplicable: 1 })
  })

  it('reports every group with include: "all"', () => {
    const report = buildSectionReport(
      sectionTarget,
      {
        base: baseDetail({
          result: axeResults({
            violations: [axeRule('button-name')],
            passes: [axeRule('image-alt')],
            inapplicable: [axeRule('video-caption')],
          }),
        }),
      },
      'all',
    )

    expect(report.findings).toHaveLength(3)
  })

  it('surfaces modifier warnings instead of dropping them', () => {
    const report = buildSectionReport(sectionTarget, {
      base: baseDetail(),
      warnings: ['Modifier ".is-open" could not be audited: timed out'],
    })

    expect(report.warnings).toEqual(['Modifier ".is-open" could not be audited: timed out'])
  })

})

describe('mapWithConcurrency', () => {
  it('keeps at most `limit` tasks in flight and preserves order', async () => {
    let inFlight = 0
    let peak = 0

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return item * 2
    })

    expect(results).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async item => item)).toEqual([])
  })
})

describe('runStyleguideAudit', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="section-3-1" class="styleguide-section" data-section-reference="3.1" data-source-file="css/accordion.css" data-source-line="12">
        <h2>Accordion</h2>
        <iframe id="preview-3-1" class="preview-iframe" src="/3.1.html" data-preview="true"></iframe>
        <iframe class="preview-iframe" src="/3.1.html" data-preview="true" data-modifier=".is-open"></iframe>
      </section>
      <section id="section-3-2" class="styleguide-section" data-section-reference="3.2" data-source-file="css/alert.css" data-source-line="30">
        <h2>Alert</h2>
        <iframe id="preview-3-2" class="preview-iframe" src="/3.2.html" data-preview="true"></iframe>
      </section>
    `
  })

  function deps(overrides: Partial<AuditDeps> = {}): AuditDeps {
    return {
      waitForIframes: vi.fn(async () => {}),
      runAccessibilityAudit: vi.fn(async () => baseDetail({ result: axeResults({ violations: [axeRule('button-name')] }) })),
      runModifierContrastAudit: vi.fn(async () => ({ modifier: '.is-open', colorContrast: [], targetMap: new Map() })),
      ...overrides,
    }
  }

  it('audits every section and totals the findings', async () => {
    const report = await runStyleguideAudit({}, deps())

    expect(report.sections.map(section => section.reference)).toEqual(['3.1', '3.2'])
    expect(report.totals).toEqual({ sections: 2, failed: 0, violations: 2, incomplete: 0 })
    expect(report.sections[0].sourceFile).toBe('css/accordion.css')
    expect(report.sections[0].url).toContain('/3.1.html')
  })

  it('waits per section, for exactly the previews that section audits', async () => {
    const injected = deps()
    await runStyleguideAudit({}, injected)

    // one wait per section: 3.1 has a base plus one modifier preview, 3.2 only a base
    expect(vi.mocked(injected.waitForIframes).mock.calls.map(call => call[0].length)).toEqual([2, 1])
  })

  it('audits modifier previews for color-contrast, and skips them on request', async () => {
    const withModifiers = deps()
    await runStyleguideAudit({}, withModifiers)
    expect(withModifiers.runAccessibilityAudit).toHaveBeenCalledTimes(2)
    expect(withModifiers.runModifierContrastAudit).toHaveBeenCalledTimes(1)

    const withoutModifiers = deps()
    await runStyleguideAudit({ modifiers: false }, withoutModifiers)
    expect(withoutModifiers.runModifierContrastAudit).not.toHaveBeenCalled()
    // and it does not wait for previews it will not audit
    expect(vi.mocked(withoutModifiers.waitForIframes).mock.calls.map(call => call[0].length)).toEqual([1, 1])
  })

  it('limits the run to the requested sections and reports unknown ones', async () => {
    const report = await runStyleguideAudit({ sections: ['3.2', '9.9'] }, deps())

    expect(report.sections.map(section => section.reference)).toEqual(['3.2'])
    expect(report.unmatchedSections).toEqual(['9.9'])
  })

  it('reports a section whose iframe never answers as failed, without losing the others', async () => {
    const report = await runStyleguideAudit({}, deps({
      runAccessibilityAudit: vi.fn(async (iframe: HTMLIFrameElement) => {
        if (iframe.id === 'preview-3-1')
          throw new Error('Accessibility audit timed out (runAccessibilityTest)')
        return baseDetail()
      }),
    }))

    expect(report.sections[0]).toMatchObject({
      reference: '3.1',
      status: 'failed',
      error: 'Accessibility audit timed out (runAccessibilityTest)',
      findings: [],
    })
    expect(report.sections[1].status).toBe('audited')
    expect(report.totals.failed).toBe(1)
  })

  it('downgrades a broken modifier preview to a warning', async () => {
    const report = await runStyleguideAudit({}, deps({
      runModifierContrastAudit: vi.fn(async () => {
        throw new Error('runColorContrastAudit not found in iframe')
      }),
    }))

    expect(report.sections[0].status).toBe('audited')
    expect(report.sections[0].warnings).toEqual([
      'Modifier ".is-open" could not be audited: runColorContrastAudit not found in iframe',
    ])
  })


  it('returns a fully JSON-serializable report', async () => {
    const report = await runStyleguideAudit({}, deps())
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })
})
