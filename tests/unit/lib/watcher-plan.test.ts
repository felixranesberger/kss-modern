import { describe, expect, it } from 'vitest'
import { planRebuilds } from '../../../lib/watcher.ts'

describe('planRebuilds', () => {
  it('asks for nothing when the batch is empty', () => {
    expect(planRebuilds([])).toEqual({ structural: false, markupFiles: [] })
  })

  it('asks for an incremental rebuild of the changed markup files', () => {
    const plan = planRebuilds([
      { category: 'markup', path: '/a.pug' },
      { category: 'markup', path: '/b.pug' },
    ])

    expect(plan).toEqual({ structural: false, markupFiles: ['/a.pug', '/b.pug'] })
  })

  it('deduplicates a file that produced several events', () => {
    const plan = planRebuilds([
      { category: 'markup', path: '/a.pug' },
      { category: 'markup', path: '/a.pug' },
      { category: 'markup', path: '/b.pug' },
    ])

    expect(plan.markupFiles).toEqual(['/a.pug', '/b.pug'])
  })

  /** A full rebuild reparses and rewrites everything, so markup work alongside it is redundant. */
  it('drops markup work when the batch also needs a full rebuild', () => {
    const plan = planRebuilds([
      { category: 'markup', path: '/a.pug' },
      { category: 'structural' },
      { category: 'markup', path: '/b.pug' },
    ])

    expect(plan).toEqual({ structural: true, markupFiles: [] })
  })

  it('asks for a single full rebuild however many structural changes arrived', () => {
    const plan = planRebuilds([
      { category: 'structural' },
      { category: 'structural' },
      { category: 'structural' },
    ])

    expect(plan).toEqual({ structural: true, markupFiles: [] })
  })
})
