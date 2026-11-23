import type { FixtureDefinition } from '../../../../lib/fixtures/index.ts'
import { describe, expect, it } from 'vitest'
import { explainCases, testCases } from '../../../../lib/fixtures/index.ts'
import { button } from '../../../fixtures/component-fixtures/button.schema.ts'
import { card } from '../../../fixtures/component-fixtures/card.schema.ts'

// Copies of two large hss.de schemas, far above the full-product limit.
describe.each([card, button] as FixtureDefinition[])('$name in pairwise mode', (definition) => {
  it('takes less than 2 s and gives valid cases for every reachable value', () => {
    const start = performance.now()
    const cases = testCases(definition)
    expect(performance.now() - start).toBeLessThan(2000)

    for (const testCase of cases)
      expect(definition.schema.safeParse(testCase.props).success, testCase.name).toBe(true)
    const report = explainCases(definition)
    expect(report.mode).toBe('pairwise')
    expect(report.unreachable).toEqual([])
    expect(report.valueErrors).toEqual([])
    expect(cases.length).toBeLessThan(200)
  })
})

it('finds the rules of the card as impossible pairs', () => {
  const { impossible } = explainCases(card)
  expect(impossible).toEqual(expect.arrayContaining([['variant=tile', '+reverse'], ['variant=topic', '+roofline'], ['variant=small-topic', '+image']]))
})

it('lists the card image as a file', () => {
  expect(testCases(card).some(testCase => testCase.files.includes('image.src'))).toBe(true)
})
