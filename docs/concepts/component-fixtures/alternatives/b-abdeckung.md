# Konzept: Testfälle aus Komponenten-Schemas nach Abdeckung statt Vollständigkeit

Der Prototyp dieses Entwurfs ist nicht ins Repository übernommen. Der geprüfte Typ-Prototyp liegt in [../prototype/](../prototype/).

## 1. Die Idee

`examples` wird zur einzigen Wertequelle. Jeder Eintrag ist ein fester Wert oder eine Funktion `f => …`, die Faker bekommt. Enums, Booleans, Defaults und gesetzt/nicht gesetzt sind Dimensionen, die der Generator selbst kombiniert. Er erzeugt nicht alle Kombinationen. Er wählt so wenige Fälle, dass jedes Wertepaar zweier Dimensionen mindestens einmal vorkommt, und nutzt `schema.safeParse()` als Filter, damit `superRefine` gilt. Danach rendert er tausende Zufallsfälle in Pug und nimmt nur die dazu, die ein Markup-Merkmal erzeugen, das noch kein Fall hatte. Über alle 133 Komponenten sind das rund 1.600 Fälle und 1,5 MB, das volle Produkt hätte Millionen.

## 2. So schreibt man eine Komponente

Das Schema bleibt, wie es ist. Nur `examples` wächst. Card, Schema unverändert aus `molecules/card/card.schema.ts`:

```ts
export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({ /* unverändert */ }).superRefine(/* unverändert */),
  examples: {
    variant: 'tile',                                   // nur Startwert im Explorer, der Generator kombiniert trotzdem alle
    title: 'Scholarship: Young Journalists',           // fester Wert
    text: f => f.lorem.sentence(),                     // Faker
    href: f => f.internet.url(),
    roofline: f => f.lorem.words(4),
    cta: { text: 'Read article', href: f => f.internet.url() },
    image: { src: f => f.helpers.arrayElement(['university/2', 'people/3']), alt: f => f.lorem.words(3) },
  },
  // nur wenn das Template Slots hat
  slots: { default: f => `<p>${f.lorem.paragraph()}</p>` },
  // Fälle mit Namen, die immer dabei sind (die heutigen JSON-Fälle wandern hierher)
  cases: {
    'teaser ohne Titel': { props: { variant: 'teaser', title: undefined, text: 'Nur Text' } },
  },
})
```

Regeln, die man sich merken muss:

- Jede Prop, die einen freien Wert braucht, steht in `examples`. Das sind Strings, Zahlen, Arrays und Objekte ohne Default, auch wenn sie optional sind. Ob sie gesetzt wird, entscheidet der Generator.
- Enums, Booleans und Props mit Default dürfen fehlen. Stehen sie da, startet der Explorer damit.
- Ein Array bekommt eine Liste von Vorlagen. Der Generator erzeugt daraus 0, 1 und 3 Elemente (bzw. ab `min`) und rotiert durch die Vorlagen.
- Auswahl aus festen Werten ist Faker selbst: `f.helpers.arrayElement(ICONS)`. Es gibt keine eigene Syntax.
- Gemeinsame Fragmente bringen ihren Fake selbst mit. Dann muss ihn keine Komponente wiederholen:

```ts
// schema-fragments.ts
export const link = withFake(
  z.strictObject({ text: z.string().min(1), href: z.string().min(1) }),
  f => ({ text: f.lorem.words(2), href: f.internet.url() }),
)
export const additionalAttributes = withFake(z.record(/* … */), f => ({ 'data-test': f.lorem.word(), hidden: true })).optional()
```

`withFake` trägt den Fake in eine zod-Registry ein (`z.registry`) und markiert den Typ. Das Komponenten-Schema bleibt frei von Faker.

Abruf, als neuer Einstieg `kss-modern/fixtures`:

```ts
import { fakeProps, testCases } from 'kss-modern/fixtures'

fakeProps(card)                                                  // ein gültiger Props-Satz, Seed 1
fakeProps(card, { seed: 7, with: { variant: 'large', reverse: true } })  // with ist gegen die Props getypt
for (const c of testCases(card)) {
  c.name    // "variant=large +reverse theme=red -href +cta cta.variant=primary +image #17"
  c.props   // z.input<typeof card.schema>, mit Defaults noch offen
  c.slots   // { default: '<p>…</p>' }
  c.reason  // 'pair' | 'shape' | 'named'
}
testCases(card, { strength: 3 })                                 // Tripel statt Paare, z. B. im Nachtlauf
```

Auf der Kommandozeile:

```bash
npx kss-modern fixtures molecules/Card --explain
```

Das gibt die Dimensionen, die Zahl der Fälle, Props ohne Wertequelle und die Paare aus, die `superRefine` verbietet. Diese Liste ist eine lesbare Fassung der Regeln, z. B. `variant=highlight & reverse=true`. Steht dort ein Paar, das möglich sein sollte, ist das `superRefine` zu streng.

Der Explorer ruft Fake-Funktionen in `examples` einmal mit festem Seed auf, bevor `toPlaygroundJsonSchema` sie als `examples` ins JSON Schema schreibt. Ein Würfel-Knopf im Explorer kann `fakeProps` mit neuem Seed aufrufen.

## 3. Die Typen

Datei `abdeckung-prototyp/types/component-schema.ts`. Geprüft mit `tsc` 6.0.3 gegen zod 4.6.6 aus styleguide-rewrite, `strict`, ohne Fehler. `types/errors.ts` enthält 14 Fehlfälle mit `@ts-expect-error`. tsc meldet jede Direktive, die keinen Fehler mehr findet. Damit ist belegt, dass alle 14 als Typfehler ankommen.

Kern:

```ts
export type Fake<V> = (f: Faker) => V

type NeedsExample<S> =
  HasFake<S> extends true ? false            // Fragment mit withFake
    : HasDefault<S> extends true ? false     // .default(…)
      : Unwrap<S> extends AnyObject ? ObjectNeedsValue<Unwrap<S>>   // Objekt nur, wenn ein Feld einen Wert braucht
        : Unwrap<S> extends z.ZodRecord ? false
          : IsEnumerable<NonNullable<z.input<Unwrap<S>>>> extends true ? false
            : true

export type ExampleFor<S> =
  Unwrap<S> extends infer U
    ? U extends AnyObject ? ObjectExamples<U['shape']> | Fake<z.input<U>>
      : U extends z.ZodArray<infer E> ? ReadonlyArray<ExampleFor<E>> | Fake<z.input<U>>
        : NonNullable<z.input<U>> | Fake<NonNullable<z.input<U>>>
    : never

export type ObjectExamples<Shape> = Simplify<
  { [K in RequiredKeys<Shape>]-?: ExampleFor<Shape[K]> } & { [K in OptionalKeys<Shape>]?: ExampleFor<Shape[K]> }
>
```

Die Typen lesen die Shape des Schemas, nicht nur `z.input`. Nur so sehen sie Defaults und die `withFake`-Marke. `Unwrap` wickelt `optional`, `default`, `prefault`, `nullable` und die Eingangsseite von `pipe` ab, also gehen auch Schemas mit `.transform()`. `superRefine` gibt in zod 4 das Objekt selbst zurück und stört nicht.

Den Kontexttyp verliert nichts. `examples` ist ein Feld des Arguments von `defineComponent`, TypeScript leitet `S` aus `schema` ab und typisiert die Funktionen danach. Es gibt keine generische Hilfsfunktion pro Wert. `withFake(schema, fake)` ist generisch, aber der Callback-Parameter ist `Faker` und hängt nicht von `S` ab. `strict` würde ein implizites `any` melden.

Abgefangene Fehler (alle in `errors.ts`):

1. Vergessene Wert-Prop (`count` fehlt). Meldung: `Property 'count' is missing in type …`.
2. Tippfehler im Prop-Namen (`titel`).
3. Wert außerhalb eines Enums, auch verschachtelt (`cta.variant: 'z'`).
4. Faker-Funktion mit falschem Rückgabetyp (Zahl für String, String für `string[]`).
5. Vergessenes Pflichtfeld im verschachtelten Objekt (`cta: {}`).
6. Falscher Elementtyp in einer Liste.
7. Unbekannte Faker-Methode, oben, in Listen und in verschachtelten Objekten. Das beweist, dass `f` überall `Faker` ist und nie `any`.
8. `withFake` mit unvollständigem Fake für ein Fragment.
9. `fakeProps(card, { with: { variant: 'huge' } })`.
10. Unbekannte Prop in einem benannten Fall.

Was die Typen nicht abfangen: einen Fake, der den Typ trifft, aber `.min(1)`, ein Regex oder `superRefine` verletzt. Das meldet der Generator zur Laufzeit mit Komponente, Prop und Seed.

## 4. Sind alle Kombinationen die richtige Zielgröße?

Nein. Der Test soll Abweichungen zwischen Pug und Fluid finden. Die entstehen in Verzweigungen der Templates: ein `if`, das auf einer Seite fehlt, eine falsche Klasse, ein vergessenes Attribut. Fast alle solchen Fehler hängen an einer Prop oder an zwei Props zusammen. Das ist die Grundlage von Pairwise Testing und deckt sich mit den Fehlerstudien des NIST zu Kombinationsfehlern. Was dann noch fehlt, sind seltene Wechselwirkungen von drei und mehr Props. Für die gibt es ein besseres Maß als die Menge der Kombinationen: das Markup selbst.

Die Zielgröße ist deshalb zweigeteilt:

1. **Paarabdeckung**: jedes Wertepaar zweier Dimensionen kommt in mindestens einem gültigen Fall vor.
2. **Merkmalsabdeckung**: jedes Markup-Merkmal, das Pug für irgendeine gültige Eingabe erzeugt, kommt in mindestens einem Fall vor. Ein Merkmal ist ein Element mit seinem Pfad aus Block- und Elementklassen, jede Modifier-Klasse für sich und jeder Attributname. Das ist Zweigabdeckung, gemessen am Ergebnis statt am Template-Code.

### Dimensionen

Aus dem zod-Schema zur Laufzeit (`_zod.def`), rekursiv:

| Schema | Dimension |
|---|---|
| `z.enum`, `z.literal` | jeder Wert, bei optional zusätzlich ∅ |
| `z.boolean` | false, true, bei optional ohne Default zusätzlich ∅ |
| optionaler String, Zahl, Record | ∅ / gesetzt, der Wert kommt aus `examples` |
| optionales Objekt | ∅ / gesetzt, die Felder sind eigene Dimensionen, die nur zählen, wenn das Objekt gesetzt ist |
| Array | Anzahl 0, 1, 3 (ab `min`), bei optional zusätzlich ∅, die Elementfelder sind Dimensionen |
| Slot | leer / gefüllt |

Freie Strings spannen keine Wertedimension auf. Ein Vorschlag für später ist eine Dimension pro Komponente mit den Werten `normal` und `sonderzeichen`. Bei `sonderzeichen` hängt der Generator an jeden Fake-String ` & "<b>x</b>"` an. Das zielt auf die häufigste Fehlerquelle zwischen `!=` in Pug und `f:format.raw` in Fluid und kostet im Paarverfahren nur wenige Fälle mehr.

### Auswahl

Gierig wie AETG: nimm ein offenes Paar, fülle die anderen Dimensionen mit den Werten, die die meisten offenen Paare schließen, baue die Props mit Faker, prüfe mit `safeParse`. Scheitert das, sucht eine lokale Suche weiter. Sie ändert eine freie Dimension nach der anderen und behält Änderungen, die die Zahl der `superRefine`-Meldungen nicht erhöhen. Findet auch sie keinen gültigen Fall, gilt das Paar als unmöglich und landet im `--explain`-Bericht.

Danach die Merkmalssuche. Der Generator erzeugt 3.000 zufällige gültige Fälle und rendert sie mit dem einmal kompilierten Pug-Template. Ein Fall kommt nur dazu, wenn er ein neues Merkmal bringt.

### Gemessen an den echten Schemas

`node runtime/run.mjs` und `node runtime/run.mjs ALL`. Wo `examples` heute einen Wert nicht haben, setzt der Prototyp ein paar Lorem-Wörter ein.

| Komponente | volles Produkt | Paar-Fälle | Fälle mit neuen Merkmalen | Props + Pug-Markup |
|---|---|---|---|---|
| molecules/Card | 2.365.440 | 87 | 4 | 103 KB |
| atoms/Button | 10.616.832 | 55 | 4 | 24 KB |
| atoms/form/Input | 41.803.776 | 49 | 0 | 30 KB |
| organisms/Intro | 15.728.640 | 53 | 0 | 82 KB |
| molecules/Contact | 169.869.312 | 65 | 14 | 175 KB |
| atoms/media/Image | 9.216 | 38 | 0 | 19 KB |
| alle 133 | | 1.397 | 176 | 1,5 MB |

Button und Image bekommen gültige Fälle, weil ∅ eine eigene Dimension bleibt und die Suche `image` xor `srcset` findet. Das Problem aus der Messung mit immer gesetzten Strings tritt nicht auf.

Die vier Merkmalsfälle bei Card sind echte Dreier-Wechselwirkungen. Ein Beispiel ist der Titel-Link in `c-card__header` mit `h4`, der nur bei einer bestimmten Kombination aus `variant`, `href` und `titleTag` entsteht. Bei Button kam `icon-only` mit dem `u-sr-only`-Span dazu. Die Paarabdeckung allein hätte diese Fälle verfehlt.

Laufzeit des Prototyps für alle 133 Komponenten: ca. 15 s, fast alles `safeParse` in der Reparatursuche. Das Ergebnis hängt nur von Schema, `examples`, Template und Seed ab und lässt sich über einen Hash dieser Eingaben zwischenspeichern.

`strength: 1` (jeder Wert einmal) reicht für reine Attribut-Komponenten. `strength: 3` ist für einen Nachtlauf gedacht.

## 5. Pug und Fluid vergleichen

Die Menge bleibt klein, weil die Fälle wenige sind. Deshalb darf das Pug-Markup weiter in Dateien stehen.

1. `render-prototype-markup.mjs` holt die Fälle aus `testCases()` statt aus `ComponentCases/*.json` und schreibt `Fixtures/GeneratedCases/<component>.json` (gitignored):

   ```json
   { "inputHash": "…", "seed": 1, "cases": [
     { "name": "variant=large +reverse … #17", "reason": "pair", "props": {…}, "slots": {…}, "files": ["image.src"], "html": "<article …>" }
   ] }
   ```

   Über alle Komponenten ca. 1,5 MB. Ein Größenlimit pro Komponente (z. B. 300 Fälle) bricht den Build mit einer klaren Meldung ab, falls ein Schema explodiert.
2. PHPUnit bekommt einen Test pro Komponente, nicht pro Fall. Der DataProvider liefert 133 Einträge, das Setup kostet 133 × 50 ms ≈ 7 s. Die Fälle laufen in einer Schleife, ca. 1.600 × 1,3 ms ≈ 2 s. Der Test sammelt alle Abweichungen und zeigt die ersten drei Diffs mit Fallnamen.
3. Weil der Fallname die Dimensionen trägt, kann der Test die Fehlerstelle eingrenzen: welche Werte kommen in allen abweichenden Fällen vor und in keinem passenden? Ausgabe z. B. `4 von 91 Fällen weichen ab, gemeinsam: titleTag=h4 +href`.
4. Die `normalize()`-Regeln bleiben. Dazu kommt `src` von Bildern (siehe 6).

Nachvollziehen eines Fehlers: `fakeProps(card, { seed: <seed aus dem Fall>, with: <props aus dem Fall> })` oder der Fall direkt im Explorer über einen Link mit den Props.

## 6. Bilder, superRefine, Slots

**Bilder.** In `examples` steht der placeholder2-Key, fest oder per `f.helpers.arrayElement([...])`. Das `image()`-Fragment bringt das über `withFake` selbst mit. Der Generator kennt die Datei-Props nach derselben Regel wie der PHP-Datengenerator: „FileReference“ in der Beschreibung oder `src` eines `image`-Objekts. Er schreibt ihre Pfade pro Fall in `files`. PHPUnit ersetzt diese Werte vor dem Rendern durch `EXT:hss_components/Tests/Functional/Fixtures/cover.jpg`. `normalize()` ersetzt `src` von `img` auf beiden Seiten durch einen Platzhalter, wie heute schon `data-srcset`. `width`, `height`, `alt`, `loading` und die Klassen bleiben verglichen. Damit werden Bild-Komponenten vergleichbar, was der README heute ausschließt.

**superRefine.** Es läuft dort, wo es geschrieben ist, über `safeParse` in Node. Der JSON-Schema-Export spielt keine Rolle, alle 25 Schemas mit `superRefine` funktionieren ohne Umbau. Die Reparatursuche nutzt die Zahl der Meldungen als Abstand zur Gültigkeit. Die Liste der unmöglichen Paare ist ein Nebenprodukt zum Lesen.

Eine zweite Prüfung kommt kostenlos dazu: ein Fall, den `safeParse` annimmt, an dem aber Pug scheitert, zeigt ein zu lockeres Schema. Genau das passiert bei `organisms/Intro` (726 Renderfehler im Zufallspool), weil `meta[].icon` ein freier String ist und `atoms/Icon` ein Enum erwartet. Abhilfe im Schema: `icon: icon.schema.shape.icon.optional()`. Dann wird das Icon eine Dimension wie jedes Enum. Bis dahin hilft `icon: f => f.helpers.arrayElement(ICONS)` in `examples`. Dasselbe Muster zeigen `atoms/Button`, `organisms/MainMenuItem` und `organisms/SidebarSection`.

**Slots.** Sie stehen nicht im Schema, sondern als eigenes Feld `slots` in `defineComponent`, mit festem HTML oder Faker. Jeder Slot ist eine Dimension leer/gefüllt. Eine Prüfung im Generator vergleicht die Slot-Namen mit den `+fragment('…')`-Aufrufen im Pug-Mixin. PHPUnit kann dieselben Namen gegen die `fc:param type="Slot"` der Fluid-Komponente prüfen. HTML, das ein bestimmtes Kind braucht (Card in Cards), steht fest in `slots` oder in einem benannten Fall.

## 7. Schwächen

- **Pug ist das einzige Orakel für Merkmale.** Hat Fluid eine Verzweigung, die Pug nicht kennt, sieht die Merkmalssuche sie nicht. Die Paarabdeckung fängt das meiste davon auf. Ein Nachtlauf mit `strength: 3` oder mehreren Seeds schließt mehr. Eine Garantie gibt es nicht.
- **Merkmale ignorieren Texte und Attributwerte.** Escaping-Fehler oder falsche URLs findet nur der Vergleich der Fälle, die ohnehin laufen. Die vorgeschlagene Sonderzeichen-Dimension ist dafür nötig, ich habe sie nicht gemessen.
- **„Unmöglich“ ist eine Heuristik.** Die Suche kann ein seltenes gültiges Paar übersehen und als unmöglich melden. Beispiel: `socialLinks=0` bei Contact meldet der Prototyp als unmöglich, wahrscheinlich liest er dort `min` falsch. Der Bericht ist ein Hinweis, kein Beweis.
- **Die Fallmenge ist nicht stabil.** Ein neuer Enum-Wert oder ein neues `examples`-Feld mischt die Auswahl neu. Fallnamen und Nummern ändern sich. Weil die Fixtures generiert und gitignored sind, stört das nur beim Vergleich zweier Läufe.
- **Mehr Pflicht in `examples`.** 306 Props brauchen einen Eintrag, auch triviale wie `id` oder `name` bei Input. Mit `withFake` an `link`, `image()` und `additionalAttributes` sinkt die Zahl, aber die Migration ist Handarbeit. Zum Ausgleich findet tsc jede fehlende Stelle.
- **Doppelrolle von `examples`.** Ein Enum-Wert dort ist nur Startwert des Explorers, der Generator kombiniert trotzdem. Wer `variant: 'tile'` liest, könnte ein Festhalten erwarten. Festhalten geht über `with` oder `cases`.
- **Records sind nie Pflicht.** Ein Record ohne `withFake` und ohne Eintrag bleibt in allen Fällen leer. Das meldet nur der Bericht, nicht tsc.
- **Die Marke von `withFake` hängt an zods `this`-Typen.** `.optional()`, `.default()` und `.describe()` behalten sie, geprüft ist `.optional()`. Ein `.transform()` direkt am Fragment würde sie verlieren.
- **Lange Typfehler.** Bei einer fehlenden Prop nennt tsc die Prop klar, zeigt aber danach den ganzen erwarteten Objekttyp.
- **Rechenzeit.** 15 s für alle Komponenten im Prototyp, ohne Optimierung. Ohne Cache läuft das in jedem `make test-components`.
- **Faker als neue Abhängigkeit** von kss-modern, als optionaler Peer wie zod. Der Prototyp nutzt einen nachgebauten Ausschnitt der Faker-API, die echten Typen von `@faker-js/faker` habe ich nicht geprüft.
