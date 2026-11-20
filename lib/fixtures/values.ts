import type { Fake } from '../component-schema.ts'
import { base, de, en, Faker } from '@faker-js/faker'
import { getFake } from '../component-schema.ts'
import { getArrayElement, getCheck, getDef, getFormat, getLengthBounds, getObjectShape, unwrapSchema } from './zod-internals.ts'

/** The "now" of every Faker, so date fakes like `f.date.recent()` do not move with the clock. */
const FAKER_REF_DATE = '2025-01-01T00:00:00.000Z'

/** A Faker with German, English and base data, seeded, so the same seed gives the same values. */
export function createFaker(seed: number): Faker {
  const faker = new Faker({ locale: [de, en, base] })
  faker.seed(seed)
  faker.setDefaultRefDate(FAKER_REF_DATE)
  return faker
}

/** Values of the common string formats, `datetime` without offset as zod expects by default. */
const FORMATS: Record<string, (faker: Faker) => string> = {
  email: faker => faker.internet.email(),
  url: faker => faker.internet.url(),
  uuid: faker => faker.string.uuid(),
  guid: faker => faker.string.uuid(),
  nanoid: faker => faker.string.nanoid(),
  ulid: faker => faker.string.ulid(),
  datetime: faker => faker.date.anytime().toISOString(),
  date: faker => faker.date.anytime().toISOString().slice(0, 10),
  time: faker => faker.date.anytime().toISOString().slice(11, 19),
  ipv4: faker => faker.internet.ipv4(),
  ipv6: faker => faker.internet.ipv6(),
  emoji: faker => faker.internet.emoji(),
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** An entry of `examples` as a plain value: fakes called, objects and arrays per field and element. */
export function resolveValue(faker: Faker, schema: unknown, example: unknown): unknown {
  if (typeof example === 'function')
    return (example as Fake<unknown>)(faker)
  if (Array.isArray(example)) {
    const element = getArrayElement(schema)
    return example.map(item => resolveValue(faker, element, item))
  }
  if (isPlainObject(example))
    return resolveObject(faker, getObjectShape(schema), example)
  return example
}

/** Fields in schema order, then the extra keys of a record, so the Faker calls keep their order. */
export function resolveObject(faker: Faker, shape: Record<string, unknown> | undefined, examples: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(shape ?? {}), ...Object.keys(examples)])) {
    const schema = shape?.[key]
    if (examples[key] !== undefined) {
      resolved[key] = resolveValue(faker, schema, examples[key])
      continue
    }
    const fake = getFake(schema)
    if (fake)
      resolved[key] = fake(faker)
  }
  return resolved
}

/** A value for a prop without example and fake, so plain definitions still give cases. */
export function fallbackValue(schema: unknown, faker: Faker): unknown {
  const inner = unwrapSchema(schema)
  switch (getDef(inner)?.type) {
    case 'string': {
      const format = FORMATS[getFormat(inner) ?? '']
      if (format)
        return format(faker)
      const { min, max } = getLengthBounds(inner)
      let text = faker.lorem.words(2)
      while (text.length < min)
        text += ` ${faker.lorem.word()}`
      return text.slice(0, max)
    }
    case 'number': {
      const above = getCheck(inner, 'greater_than')
      const below = getCheck(inner, 'less_than')
      const lower = above ? Number(above.value) + (above.inclusive ? 0 : 1) : undefined
      const upper = below ? Number(below.value) - (below.inclusive ? 0 : 1) : undefined
      const min = lower ?? (upper === undefined ? 1 : upper - 99)
      return faker.number.int({ min, max: Math.max(min, upper ?? min + 99) })
    }
    case 'boolean':
      return true
    case 'record':
      return {}
    case 'date':
      return faker.date.anytime()
    default:
      return undefined
  }
}

/** FNV-1a over the UTF-16 code units, 32 bit. */
export function hash(text: string): number {
  let value = 0x811C9DC5
  for (let index = 0; index < text.length; index++)
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193)
  return value >>> 0
}

/** Eight hex digits of {@link hash}. */
export function hashId(text: string): string {
  return hash(text).toString(16).padStart(8, '0')
}

/** mulberry32, the seeded random source of the search. Faker stays for the values. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** A shuffled copy. */
export function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}
