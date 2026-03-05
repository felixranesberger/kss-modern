function* idGenerator(prefix: string = 'id', start: number = 0): Generator<string> {
  let counter = start
  while (true) {
    yield `${prefix}-${counter++}`
  }
}

export const id = idGenerator()

export const sectionSanitizeId = (id: string) => id.toLowerCase().replaceAll('.', '-')

export function queryRequired<T extends Element>(
  selector: string,
  context: ParentNode = document,
  errorMessage?: string,
): T {
  const element = context.querySelector<T>(selector)
  if (!element)
    throw new Error(errorMessage ?? `Required element not found: ${selector}`)
  return element
}
