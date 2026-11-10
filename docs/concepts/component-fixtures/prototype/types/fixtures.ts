/** Abruf-API `kss-modern/fixtures` (nur Signaturen). */
import type { z } from 'zod'
/** Nur schema zählt, examples ist für den Abruf egal. */
type AnyDef = { name: string, schema: z.ZodType }

export interface FakeOptions<D extends AnyDef> {
  seed?: number
  /** Feste Werte für diesen Aufruf, gegen die Props der Komponente geprüft. */
  with?: Partial<z.input<D['schema']>>
}

export interface TestCase<D extends AnyDef> {
  /** Lesbar und stabil, z. B. "variant=large +reverse -image theme=red #17" */
  name: string
  props: z.input<D['schema']>
  slots: Record<string, string>
  /** Warum der Fall dabei ist: Paarabdeckung, neue Markup-Form oder eigener Fall. */
  reason: 'pair' | 'shape' | 'named'
}

export declare function fakeProps<D extends AnyDef>(component: D, options?: FakeOptions<D>): z.input<D['schema']>
export declare function testCases<D extends AnyDef>(component: D, options?: { seed?: number, strength?: 1 | 2 | 3 }): TestCase<D>[]
