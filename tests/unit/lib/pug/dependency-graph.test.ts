import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PugDependencyGraph } from '../../../../lib/pug/dependency-graph.ts'

describe('pugDependencyGraph', () => {
  it('maps every dependency file to its consuming section', () => {
    const graph = new PugDependencyGraph()
    graph.setDependencies('1.1', ['/a/card.pug', '/a/_card-body.pug'])

    expect(graph.getAffectedSections('/a/card.pug')).toEqual(['1.1'])
    expect(graph.getAffectedSections('/a/_card-body.pug')).toEqual(['1.1'])
  })

  it('returns no sections for an unknown file', () => {
    const graph = new PugDependencyGraph()
    expect(graph.getAffectedSections('/unknown.pug')).toEqual([])
  })

  it('maps a shared dependency to all consuming sections', () => {
    const graph = new PugDependencyGraph()
    graph.setDependencies('1.1', ['/shared.pug'])
    graph.setDependencies('1.2', ['/shared.pug'])

    expect(graph.getAffectedSections('/shared.pug').sort()).toEqual(['1.1', '1.2'])
  })

  it('re-indexes when a section\'s dependencies change', () => {
    const graph = new PugDependencyGraph()
    graph.setDependencies('1.1', ['/old.pug'])
    graph.setDependencies('1.1', ['/new.pug'])

    expect(graph.getAffectedSections('/old.pug')).toEqual([])
    expect(graph.getAffectedSections('/new.pug')).toEqual(['1.1'])
  })

  it('drops all edges when a section is removed', () => {
    const graph = new PugDependencyGraph()
    graph.setDependencies('1.1', ['/a.pug'])
    graph.removeSection('1.1')

    expect(graph.getAffectedSections('/a.pug')).toEqual([])
  })

  it('normalises relative and absolute paths to the same key', () => {
    const graph = new PugDependencyGraph()
    graph.setDependencies('1.1', [path.resolve('rel/x.pug')])

    expect(graph.getAffectedSections('rel/x.pug')).toEqual(['1.1'])
  })
})
