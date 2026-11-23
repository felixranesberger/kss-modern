/**
 * Typ-Prototyp für `kss-modern/schema` mit Fake-Werten in `examples`.
 * Nur Typen und eine dünne Laufzeit (defineComponent, withFake), geprüft mit tsc gegen zod 4.
 */
import { z } from 'zod'

import type { Faker } from '@faker-js/faker'

export type { Faker }

/** Ein Wert oder eine Funktion, die ihn mit Faker erzeugt. */
export type Fake<V> = (f: Faker) => V

declare const fakeBrand: unique symbol
/** Markiert ein Schema-Fragment, das selbst einen Fake-Wert mitbringt (siehe withFake). */
export interface HasOwnFake { readonly [fakeBrand]: true }

type AnyObject = z.ZodObject<z.ZodRawShape>

/** Hüllen, die nur optional/default/describe ändern, abwickeln. */
type Unwrap<S> =
  S extends z.ZodOptional<infer I> ? Unwrap<I>
    : S extends z.ZodDefault<infer I> ? Unwrap<I>
      : S extends z.ZodPrefault<infer I> ? Unwrap<I>
        : S extends z.ZodNullable<infer I> ? Unwrap<I>
          : S extends z.ZodPipe<infer A, z.ZodType> ? Unwrap<A>
            : S

type HasDefault<S> =
  S extends z.ZodDefault<z.ZodType> ? true
    : S extends z.ZodOptional<infer I> | z.ZodNullable<infer I> ? HasDefault<I>
      : false

type HasFake<S> =
  S extends HasOwnFake ? true
    : S extends z.ZodOptional<infer I> | z.ZodDefault<infer I> | z.ZodNullable<infer I> ? HasFake<I>
      : false

/** Enums, Literale und Booleans spannen die Matrix auf, sie brauchen keinen Beispielwert. */
type IsEnumerable<V> =
  [V] extends [boolean] ? true
    : [V] extends [string] ? (string extends V ? false : true)
        : [V] extends [number] ? (number extends V ? false : true)
            : false

/** Ein Objekt, dessen Felder alle aufzählbar sind oder einen Default haben, braucht keinen Eintrag. */
type ObjectNeedsValue<O extends AnyObject> = [RequiredKeys<O['shape']>] extends [never] ? false : true

/** Braucht diese Prop einen Wert in `examples`, damit der Generator sie füllen kann? */
type NeedsExample<S> =
  HasFake<S> extends true ? false
    : HasDefault<S> extends true ? false
      : Unwrap<S> extends AnyObject ? ObjectNeedsValue<Unwrap<S>>
        : Unwrap<S> extends z.ZodRecord ? false
          : IsEnumerable<NonNullable<z.input<Unwrap<S>>>> extends true ? false
            : true

type RequiredKeys<Shape> = { [K in keyof Shape]: NeedsExample<Shape[K]> extends true ? K : never }[keyof Shape]
type OptionalKeys<Shape> = Exclude<keyof Shape, RequiredKeys<Shape>>

/** Was `examples` für ein Feld akzeptiert. */
export type ExampleFor<S> =
  Unwrap<S> extends infer U
    ? U extends AnyObject ? ObjectExamples<U['shape']> | Fake<z.input<U>>
      : U extends z.ZodArray<infer E> ? ReadonlyArray<ExampleFor<E>> | Fake<z.input<U>>
        : NonNullable<z.input<U>> | Fake<NonNullable<z.input<U>>>
    : never

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type ObjectExamples<Shape> = Simplify<
  { [K in RequiredKeys<Shape>]-?: ExampleFor<Shape[K]> }
  & { [K in OptionalKeys<Shape>]?: ExampleFor<Shape[K]> }
>

type ShapeOf<S> = Unwrap<S> extends AnyObject ? Unwrap<S>['shape'] : never

/** Eigene Fälle: Teil-Props, der Rest kommt aus examples und der Matrix. Feste Werte wie bei examples. */
export interface NamedCase<S> {
  props: { [K in keyof ShapeOf<S>]?: ExampleFor<ShapeOf<S>[K]> }
  slots?: Record<string, string | Fake<string>>
}

export interface ComponentSchemaDefinition<Name extends string, S extends z.ZodType> {
  name: Name
  schema: S
  /**
   * Startwerte des Explorers und Wertequelle für Fake-Props. Jede Prop, die einen freien Wert braucht
   * (String, Zahl, Array, Objekt ohne Default), muss hier stehen. Enums und Booleans dürfen hier stehen,
   * dann startet der Explorer damit. Der Generator kombiniert sie trotzdem.
   */
  examples: ObjectExamples<ShapeOf<S>>
  /** Inhalt für Slots, die es nur im Template gibt. default ist der Standard-Slot. */
  slots?: Record<string, string | Fake<string>>
  /** Fälle mit Namen, die immer geprüft werden, z. B. ein Fehlerbild aus einem Ticket. */
  cases?: Record<string, NamedCase<S>>
  /** Abdeckungsstärke: 2 = jedes Wertepaar zweier Dimensionen kommt vor (Standard). */
  strength?: 1 | 2 | 3
}

export function defineComponent<const Name extends string, S extends z.ZodType>(
  definition: ComponentSchemaDefinition<Name, S>,
): ComponentSchemaDefinition<Name, S> {
  return definition
}

/** Registry der Fragmente mit eigenem Fake, zod-eigen, typgeprüft über $input. */
export const fakes = z.registry<{ fake: (f: Faker) => z.$input }>()

/** Hängt einem gemeinsamen Fragment einen Fake an. Komponenten müssen es dann nicht mehr in examples nennen. */
export function withFake<S extends z.ZodType>(schema: S, fake: (f: Faker) => z.input<S>): S & HasOwnFake {
  fakes.add(schema, { fake } as never)
  return schema as S & HasOwnFake
}
