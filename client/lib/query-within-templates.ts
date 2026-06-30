interface SelectorStep {
  // combinator preceding this compound selector ('' for the first step)
  combinator: '' | '>' | '+' | '~' | ' '
  compound: string
}

// Split a descendant/child selector into its compound steps while ignoring
// combinator-like characters nested inside (…) or […] (e.g. :nth-child(2n + 1),
// [data-x="a > b"]). Each step keeps the combinator that precedes it.
export function splitSelectorSteps(selector: string): SelectorStep[] {
  const steps: SelectorStep[] = []
  let depth = 0
  let buffer = ''
  let combinator: SelectorStep['combinator'] = ''

  const flush = () => {
    const compound = buffer.trim()
    if (compound)
      steps.push({ combinator, compound })
    buffer = ''
  }

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]

    if (char === '(' || char === '[')
      depth++
    else if (char === ')' || char === ']')
      depth--

    if (depth === 0 && (char === '>' || char === '+' || char === '~')) {
      flush()
      combinator = char
      while (i + 1 < selector.length && /\s/.test(selector[i + 1]))
        i++
      continue
    }

    if (depth === 0 && /\s/.test(char)) {
      let next = i + 1
      while (next < selector.length && /\s/.test(selector[next]))
        next++
      const following = selector[next]
      // padding around an explicit combinator — let the combinator branch handle it
      if (following === '>' || following === '+' || following === '~') {
        i = next - 1
        continue
      }
      // otherwise this whitespace is a descendant combinator
      flush()
      combinator = ' '
      i = next - 1
      continue
    }

    buffer += char
  }
  flush()

  return steps
}

// Re-join a slice of steps into a standalone selector, dropping the leading
// combinator so the result is rooted at the first step.
export function joinSelectorSteps(steps: SelectorStep[]): string {
  return steps
    .map((step, index) => {
      if (index === 0)
        return step.compound
      return step.combinator === ' ' ? ` ${step.compound}` : ` ${step.combinator} ${step.compound}`
    })
    .join('')
}

// Query a selector within a root, descending across any <template> boundaries
// the selector crosses — whether the template is at the root, in the middle of
// the path, or nested inside another template's content.
export function queryWithinTemplates(root: Document | DocumentFragment | Element, selector: string): Element | null {
  // regular tree first, so the light DOM is preferred over template content
  const direct = root.querySelector(selector)
  if (direct)
    return direct

  // the selector may descend through the light DOM into a nested <template>;
  // try each prefix that resolves to a template and recurse into its content
  const steps = splitSelectorSteps(selector)
  for (let i = 0; i < steps.length - 1; i++) {
    const prefix = joinSelectorSteps(steps.slice(0, i + 1))
    let candidates: NodeListOf<Element>
    try {
      candidates = root.querySelectorAll(prefix)
    }
    catch {
      continue
    }
    for (const candidate of candidates) {
      if (candidate instanceof HTMLTemplateElement) {
        const rest = joinSelectorSteps(steps.slice(i + 1))
        const match = queryWithinTemplates(candidate.content, rest)
        if (match)
          return match
      }
    }
  }

  // fall back to selectors that match entirely inside a template's content
  // without naming the template in the path
  const templates = root.querySelectorAll<HTMLTemplateElement>('template')
  for (const template of templates) {
    const match = queryWithinTemplates(template.content, selector)
    if (match)
      return match
  }

  return null
}
