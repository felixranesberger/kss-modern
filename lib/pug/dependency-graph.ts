import path from 'node:path'

/**
 * Maps source files to the styleguide sections that depend on them, so the watcher can
 * translate a changed `.pug`/`.html` file into the set of sections that must be rebuilt.
 *
 * Paths are normalised with `path.resolve` on both insert and query, so chokidar event
 * paths and pug's reported dependency paths compare equal.
 */
export class PugDependencyGraph {
  /** sectionId -> set of absolute dependency file paths */
  private forward = new Map<string, Set<string>>()
  /** absolute dependency file path -> set of sectionIds */
  private reverse = new Map<string, Set<string>>()

  /** Replace the dependency edges for a section (handles includes being added/removed). */
  setDependencies(sectionId: string, dependencies: string[]): void {
    this.removeSection(sectionId)

    const resolved = new Set(dependencies.map(dep => path.resolve(dep)))
    this.forward.set(sectionId, resolved)

    for (const dep of resolved) {
      let consumers = this.reverse.get(dep)
      if (!consumers) {
        consumers = new Set()
        this.reverse.set(dep, consumers)
      }
      consumers.add(sectionId)
    }
  }

  /** Drop all edges for a section. */
  removeSection(sectionId: string): void {
    const previous = this.forward.get(sectionId)
    if (!previous)
      return

    for (const dep of previous) {
      const consumers = this.reverse.get(dep)
      if (!consumers)
        continue
      consumers.delete(sectionId)
      if (consumers.size === 0)
        this.reverse.delete(dep)
    }

    this.forward.delete(sectionId)
  }

  /** Section ids that directly depend on the given file. */
  getAffectedSections(changedFile: string): string[] {
    const consumers = this.reverse.get(path.resolve(changedFile))
    return consumers ? [...consumers] : []
  }

  clear(): void {
    this.forward.clear()
    this.reverse.clear()
  }
}
