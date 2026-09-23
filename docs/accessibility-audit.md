# Accessibility audit

Every preview can be checked against WCAG rules and HTML validity, by hand in the styleguide or from a script.

## The Audit button

The **Audit** button under a preview runs two checks at once:

- [axe-core](https://github.com/dequelabs/axe-core) for WCAG rules such as contrast, labels and ARIA usage
- [html-validate](https://html-validate.org/) for the structure of the markup

The results open in a dialog, grouped into violations, items that need a manual review, passes and rules that don't apply. Each finding links to its rule documentation.

The audit runs against the theme that is currently selected. Modifier previews are included as well. They are pure class swaps, so only their contrast is checked again.

## Color contrast in light and dark

Contrast depends on the color scheme, so the contrast check runs once per scheme. For each pass kss-modern forces `color-scheme` on the preview and freezes CSS transitions and animations, so colors are measured in their final state. Findings carry the scheme they were found in.

Some cases are worth knowing:

- Styles that only react to `@media (prefers-color-scheme: dark)` can't be switched by a page, so they are only checked in their light appearance. Tokens built on `light-dark()` or the `color-scheme` property are checked in both.
- With `deactivateDarkMode: true` only the light pass runs.
- When text sits on a background image, axe can't compute a contrast ratio. kss-modern measures the pixels behind the text where it can and otherwise reports the reason a manual review is needed.

## `window.kssAudit()`

The same audit is available as a function on every styleguide page. It is made for CI, browser automation and AI agents that need results as data instead of a dialog.

```js
const report = await window.kssAudit()
```

The function exists once the page's module script has run, which happens before `DOMContentLoaded`. Navigation commands such as Playwright's `page.goto` already wait that long. It then waits for every preview iframe to finish loading. Only code that runs during page load needs to wait for it:

```js
await page.waitForFunction(() => typeof window.kssAudit === 'function')
```

### Options

```js
await window.kssAudit({
  sections: ['3.1', '3.3'],
  include: 'violations',
  modifiers: true,
  timeout: 30000,
})
```

| Option | Default | Effect |
|---|---|---|
| `sections` | all sections on the page | KSS references (`'3.1'`), dashed ids (`'3-1'`) or DOM ids (`'section-3-1'`). References that match nothing are listed in `unmatchedSections`. |
| `include` | `'violations'` | `'violations'` returns violations and needs-review items. `'all'` adds passes and inapplicable rules. The counts always cover all four groups. |
| `modifiers` | `true` | Also check modifier previews. Turn it off on pages with many modifiers to save time. |
| `timeout` | `30000` | Milliseconds one preview may take before it is reported as failed. |

### Report

```jsonc
{
  "generatedAt": "2026-09-23T09:12:44.201Z",
  "page": { "url": "https://example.com/preview-3.1.html", "title": "Project Card" },
  "options": { "include": "violations", "modifiers": true },
  "totals": { "sections": 1, "failed": 0, "violations": 1, "incomplete": 0 },
  "sections": [
    {
      "reference": "3.1",
      "header": "Project Card",
      "url": "https://example.com/fullpage-3.1.html",
      "sourceFile": "css/03-components/card.css",
      "sourceLine": 1,
      "markupFile": "templates/source/03-components/card.pug",
      "status": "audited",
      "counts": { "violations": 1, "incomplete": 0, "passes": 24, "inapplicable": 60 },
      "findings": [
        {
          "source": "axe",
          "group": "violations",
          "id": "color-contrast",
          "impact": "serious",
          "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
          "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/color-contrast",
          "mode": "dark",
          "modifier": ".card--interactive",
          "nodes": [
            {
              "target": ".card__footer > button",
              "html": "<button class=\"btn btn--secondary btn--sm\" type=\"button\">Open</button>",
              "failureSummary": "Fix any of the following: Element has insufficient color contrast of 3.1:1"
            }
          ]
        }
      ]
    }
  ]
}
```

Each finding carries what you need to fix it:

| Field | Meaning |
|---|---|
| `sourceFile`, `sourceLine`, `markupFile` | The section's KSS comment and template, relative to `contentDir`. |
| `source` | `axe` or `html-validate`. html-validate findings also carry `line` and `column` in the rendered preview. |
| `mode` | The color scheme a contrast finding was measured in. |
| `modifier` | Set when the finding comes from a modifier preview. |
| `measured`, `reviewReason` | For text on images, the measured ratio or the reason it needs a manual review. |

The report contains only plain JSON values, so it survives `page.evaluate`, browser tool protocols and `JSON.stringify` unchanged.

### Limits

- The function audits the page it runs on. A styleguide has one page per second-level section, so a script visits each page linked in the sidebar.
- A preview that doesn't respond within `timeout` is reported with `"status": "failed"` and an `error`, and `totals.failed` counts it. The other previews are still audited.
- A failing modifier preview is listed in the section's `warnings`.
- The rules `region` and `landmark-one-main` are turned off, because a component preview is a fragment and would always fail them.

### Example with Playwright

```js
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage()
const base = 'http://localhost:4173/'

await page.goto(base)
const pages = await page.$$eval('nav a[href^="preview-"], nav a[href="index.html"]', links => links.map(link => link.getAttribute('href')))

let violations = 0
for (const href of new Set(pages)) {
  await page.goto(base + href)
  const report = await page.evaluate(() => window.kssAudit())
  for (const section of report.sections) {
    for (const finding of section.findings.filter(f => f.group === 'violations')) {
      violations++
      console.log(`${section.sourceFile}: ${finding.id} ${finding.mode ?? ''} ${finding.modifier ?? ''}`)
    }
  }
}

await browser.close()
process.exit(violations > 0 ? 1 : 0)
```
