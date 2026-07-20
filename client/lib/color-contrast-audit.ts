import type { AxeResults, ElementContext, RunOptions } from 'axe-core'

export type ColorSchemeMode = 'light' | 'dark'

export interface SchemeContrastResult {
  mode: ColorSchemeMode
  result: AxeResults
}

// the parts of the axe-core instance this module needs, injected so the logic
// stays unit-testable without bundling axe into the test
export interface AxeRunner {
  run: (context: ElementContext, options: RunOptions) => Promise<AxeResults>
}

// scope every audit run to the section content and drop the dev-only pug
// compile-error overlay so it isn't reported as a section a11y issue
export const AUDIT_CONTEXT: ElementContext = {
  include: [['body']],
  exclude: [['pug-error-overlay']],
}

/**
 * Which color schemes the color-contrast check should be evaluated under.
 * Always light; dark is added when the styleguide supports dark mode, signalled
 * by `data-styleguide-dark-mode="true"` on the audited document's root (set by
 * the fullpage template unless `deactivateDarkMode` is configured).
 */
export function getAuditColorSchemes(
  root: HTMLElement = document.documentElement,
): ColorSchemeMode[] {
  const modes: ColorSchemeMode[] = ['light']
  if (root.dataset.styleguideDarkMode === 'true')
    modes.push('dark')
  return modes
}

/**
 * Run axe's `color-contrast` rule once per requested scheme.
 *
 * color-contrast is theme-dependent: `light-dark()`, system colors and any
 * `color-scheme`-driven styling resolve differently per scheme. Forcing
 * `color-scheme` on the root makes each pass deterministic regardless of the OS
 * `prefers-color-scheme`. A component that pins its own `color-scheme` keeps it
 * (the inline force only sets the inherited default), which is correct — such a
 * component always renders in its pinned scheme.
 *
 * NOTE: styling switched purely via `@media (prefers-color-scheme: dark)` is NOT
 * flipped by this — a page cannot override that media feature at runtime — so it
 * is evaluated in its light appearance in every pass.
 *
 * The root also gets `background-color: Canvas` for the duration of each run.
 * axe-core otherwise falls back to a hardcoded white backdrop for
 * transparent-background text, producing false violations in dark mode
 * (https://github.com/dequelabs/axe-core/issues/3605). `Canvas` resolves to the
 * real per-scheme UA surface and only takes effect when nothing above sets an
 * opaque background, so genuine component backgrounds still win.
 *
 * An optional `augment` hook runs *while the scheme is still forced*, so it can
 * read per-scheme computed colours (e.g. to measure text-over-image contrast
 * that axe leaves incomplete). Whatever it returns replaces the raw result.
 */
export async function runColorContrastAcrossSchemes(
  axe: AxeRunner,
  modes: ColorSchemeMode[],
  root: HTMLElement = document.documentElement,
  augment?: (result: AxeResults, mode: ColorSchemeMode) => AxeResults | Promise<AxeResults>,
): Promise<SchemeContrastResult[]> {
  const results: SchemeContrastResult[] = []

  for (const mode of modes) {
    const previousColorScheme = root.style.colorScheme
    const previousBackground = root.style.backgroundColor

    root.style.colorScheme = mode === 'dark' ? 'only dark' : 'only light'
    root.style.backgroundColor = 'Canvas'

    try {
      const result = await axe
        .run(AUDIT_CONTEXT, { runOnly: { type: 'rule', values: ['color-contrast'] } })
        .catch(console.error)

      if (result)
        results.push({ mode, result: augment ? await augment(result, mode) : result })
    }
    finally {
      root.style.colorScheme = previousColorScheme
      root.style.backgroundColor = previousBackground
    }
  }

  return results
}
