/**
 * Trailing-edge debounce that accumulates every call within the window into a
 * single batch. Once `windowMs` elapses without a further call, `fn` runs once
 * with the full array.
 *
 * This is what collapses a multi-file operation — a branch switch, a `git
 * checkout`, a bulk find-and-replace, an editor's atomic save — into one
 * rebuild instead of one rebuild per file.
 */
export function batchDebounce<T>(fn: (batch: T[]) => void, windowMs: number): (item: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let buffer: T[] = []

  return (item: T) => {
    buffer.push(item)

    if (timer !== undefined) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      const batch = buffer
      buffer = []
      timer = undefined
      fn(batch)
    }, windowMs)
  }
}
