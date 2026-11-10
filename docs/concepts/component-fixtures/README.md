# Konzept: Testfälle aus Komponenten-Schemas

Ticket: https://projekte.in2code.de/issues/84985

Basis ist Konzept B ([konzept-abdeckung.md](alternatives/b-abdeckung.md), Typ-Prototyp in [prototype/](prototype/)). Aus Konzept A ([konzept-paarweise-fakes.md](alternatives/a-paarweise-fakes.md)) kommen die Fallnamen, die Stufen, der Bericht über unerreichbare Werte und das Debug-Kommando. Aus Konzept C ([konzept-paarweise.md](alternatives/c-paarweise.md)) kommen die Slot-Erkennung aus dem Mixin und der schnellere Generator.

## Die Idee

`examples` wird die einzige Wertequelle einer Komponente. Jeder Eintrag ist ein fester Wert oder eine Funktion `f => …`, die Faker bekommt. Enums, Booleans, Defaults und gesetzt/nicht gesetzt leitet der Generator aus dem Zod-Schema ab. Hat eine Komponente bis zu 10.000 Kombinationen, testet er alle. Das gilt für 123 der 133 Komponenten. Für die 10 größeren wählt er so wenige Fälle, dass jedes Wertepaar zweier Props mindestens einmal vorkommt, und nimmt dann noch die Fälle dazu, die in Pug neues Markup erzeugen. `schema.safeParse()` entscheidet, welcher Fall gültig ist. So gilt `superRefine`, ohne dass der Generator die Regeln kennt.

Über alle 133 Komponenten sind das rund 10.000 Fälle und etwa 10 MB Fixtures. Das volle Produkt aller Komponenten hätte Millionen.

## So schreibt man eine Komponente

Das Schema bleibt unverändert. `examples` wird vollständig, dazu kommen bei Bedarf `slots` und `cases`.

```ts
import { defineComponent } from 'kss-modern/schema';
import { z } from 'zod';
import { additionalAttributes, headingTag, image } from '../../schema-fragments';

export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({ /* unverändert */ }).superRefine(/* unverändert */),
  examples: {
    variant: 'tile',                            // Startwert im Explorer, kombiniert wird trotzdem
    title: 'Scholarship: Young Journalists',    // fester Wert
    text: f => f.lorem.sentence(),
    href: f => f.internet.url(),
    roofline: f => f.lorem.words(3),
    cta: { text: 'Read article', href: f => f.internet.url() },
    // image und additionalAttributes bringen ihren Wert über das Fragment mit
  },
  cases: {
    'teaser without title': { props: { variant: 'teaser', title: undefined, text: 'Text only' } },
  },
});
```

Die Regeln:

- Jede Prop mit freiem Wert steht in `examples`. Das sind Strings, Zahlen, Arrays und Objekte ohne Default, auch optionale. Ob sie im Fall gesetzt wird, entscheidet der Generator.
- Enums, Booleans und Props mit Default dürfen fehlen. Stehen sie da, startet der Explorer damit. Sie schränken die Fälle nicht ein. Festhalten geht über `cases` oder `with`.
- Ein Array bekommt eine Liste von Vorlagen. Der Generator testet 0, 1 und 3 Elemente (ab `min`) und rotiert durch die Vorlagen.
- Eine Auswahl aus festen Werten ist Faker selbst: `f => f.helpers.arrayElement(['arrow', 'pin'])`. Es gibt keine eigene Syntax.
- Welche Slots es gibt, liest die Discovery aus dem Pug-Mixin (`pug_mixins.$fragments.collect(block)` mit `slots.<name>` und der Default-Block) und schreibt sie als `slots` an den Manifest-Eintrag. `testCases` bekommt sie über `slotNames`. Konzept C hat das an allen Mixins geprüft: 3 Komponenten haben benannte Slots, 65 einen Default-Slot. `slots` in `defineComponent` liefert nur den Inhalt, mit festem HTML oder Faker. Ohne Eintrag bekommt ein Slot `<p data-slot="name">Slot name</p>`. Jeder Slot wird leer und gefüllt getestet.
- `cases` sind benannte Fälle, die immer dabei sind. Die heutigen `ComponentCases/*.json` wandern hierher.

### Gemeinsame Fragmente

Fragmente aus `schema-fragments.ts` bringen ihren Fake selbst mit. Keine Komponente muss ihn wiederholen.

```ts
export const link = withFake(
  z.strictObject({ text: z.string().min(1), href: z.string().min(1) }),
  f => ({ text: f.lorem.words(2), href: f.internet.url() }),
);

export function image({ loading = 'lazy' } = {}) {
  return withFake(
    z.strictObject({ src: z.string().min(1), alt: z.string().default(''), /* … */ }),
    f => ({ src: f.helpers.arrayElement(['university/2', 'people/3']), alt: f.lorem.words(3) }),
  );
}

export const additionalAttributes = withFake(
  z.record(/* unverändert */),
  () => ({ 'data-test': 'x', hidden: true }),
).optional();
```

`withFake` trägt den Fake in eine Zod-Registry ein und markiert den Typ. Eine Prop mit diesem Fragment braucht keinen Eintrag in `examples`, darf ihn aber überschreiben.

### Abruf

```ts
import { fakeProps, testCases } from 'kss-modern/fixtures';

fakeProps(card);                                                   // ein gültiger Props-Satz, Seed 1
fakeProps(card, { seed: 7, with: { variant: 'large', reverse: true } }); // with ist gegen die Props getypt

for (const c of testCases(card)) {
  c.id;     // 'f3231f34', Hash der Dimensionen
  c.name;   // 'variant=large +reverse', nur was vom Minimalfall abweicht
  c.stage;  // 'full' | 'minimal' | 'single' | 'pair' | 'shape' | 'named'
  c.props;  // z.input<typeof card.schema>
  c.slots;  // nur deklarierte Slots
  c.files;  // ['image.src'], Pfade mit Bild-Fakes
}

testCases(card, { strength: 3 });                                  // Tripel, z. B. im Nachtlauf
explainCases(card);                                                // der Bericht, siehe unten
```

Ein Kommando `npx kss-modern fixtures` gibt es nicht. Die Konfiguration steht im Build-Skript des Projekts, bei hss.de in der Frontend-Toolchain. Ein Kommando müsste sie nachbauen, um Mixins zu finden und zu rendern. Stattdessen schreibt der Build die Fixtures mit `mixinFixtureDir`, `mixinFixtureReport` loggt den Bericht nach dem Build, und `formatMixinFixtureReport(dir, 'molecules/Card')` aus `kss-modern` liest ihn aus den geschriebenen Dateien.

`explainCases(card)` zeigt die Dimensionen, die Zahl der Fälle je Stufe, die Paare, die `superRefine` verbietet, und Werte, die in keinem gültigen Fall vorkommen können. `impossible` ist eine Liste von Tupeln (`string[][]`), bei `strength: 3` auch Tripel. Ein verbotenes Paar wie `['variant=tile', '+reverse']` ist die lesbare Form einer Regel. Ein unerreichbarer Wert ist ein Fehler im Schema oder in `examples`.

## Die Typen

Der Typ von `examples` liest die Shape des Schemas, nicht nur `z.input`. Nur so erkennt er Defaults und die Marke von `withFake`. Er unterscheidet Props, die einen Wert brauchen, von Props, die der Generator selbst füllt.

```ts
export type Fake<V> = (f: Faker) => V;

type NeedsExample<S> =
  HasFake<S> extends true ? false                                   // Fragment mit withFake
    : HasDefault<S> extends true ? false                            // .default(…)
      : Unwrap<S> extends AnyObject ? ObjectNeedsValue<Unwrap<S>>   // Objekt nur, wenn ein Feld einen Wert braucht
        : Unwrap<S> extends z.ZodRecord ? false
          : IsEnumerable<NonNullable<z.input<Unwrap<S>>>> extends true ? false
            : true;

export type ExampleFor<S> =
  Unwrap<S> extends infer U
    ? U extends AnyObject ? ObjectExamples<U['shape']> | Fake<z.input<U>>
      : U extends z.ZodArray<infer E> ? ReadonlyArray<ExampleFor<E>> | Fake<z.input<U>>
        : NonNullable<z.input<U>> | Fake<NonNullable<z.input<U>>>
    : never;
```

Der vollständige Typ steht in [prototype/types/component-schema.ts](prototype/types/component-schema.ts). Geprüft mit tsc 6.0.3 gegen Zod 4.6, 14 erwartete Fehler in `errors.ts`:

- eine fehlende Prop, auch verschachtelt (`cta: {}`)
- ein Tippfehler im Prop-Namen
- ein Wert außerhalb eines Enums, auch verschachtelt
- eine Faker-Funktion mit falschem Rückgabetyp
- ein falscher Elementtyp in einer Liste
- eine unbekannte Faker-Methode, oben, in Listen und in Objekten. Das belegt, dass `f` überall `Faker` ist.
- ein unvollständiger Fake in `withFake`
- falsche Werte in `with` und in `cases`

Die Typen fangen keinen Fake, der zwar den Typ trifft, aber `.min(1)`, ein Regex oder `superRefine` verletzt. Das meldet der Generator mit Komponente, Prop und Seed.

## Wie die Fälle entstehen

Der Generator zerlegt das Schema in Dimensionen:

| Schema | Werte |
|---|---|
| `z.enum`, `z.literal` | jeder Wert, bei optional zusätzlich nicht gesetzt |
| `z.boolean` | `false`, `true`, bei optional ohne Default zusätzlich nicht gesetzt |
| optionaler String, Zahl, Record | gesetzt oder nicht gesetzt, der Wert kommt aus `examples` |
| optionales Objekt | gesetzt oder nicht, seine Felder zählen nur, wenn es gesetzt ist |
| Array | 0, 1 oder 3 Elemente, die Felder der Elemente sind Dimensionen |
| Slot | leer oder gefüllt |

Dann zählt er das volle Produkt der Dimensionen. Liegt es bei höchstens 10.000, erzeugt er jede Kombination und behält die gültigen (Stufe **full**). Dazu kommen die Fälle aus `cases`. Gemessen an den aktuellen Schemas:

| Grenze | vollständig getestet | gültige Fälle |
|---|---|---|
| 1.000 | 120 von 133 | 6.033 |
| 10.000 | 123 von 133 | 9.393 |
| 50.000 | 127 von 133 | 70.705 |

Bei 10.000 kippt das Verhältnis. Die nächsten vier Komponenten brächten zusammen über 60.000 Fälle mehr.

Liegt das Produkt darüber, läuft die Auswahl in Stufen:

1. **minimal**: alle Defaults, keine optionale Prop
2. **single**: jeder Wert einzeln gegen den Minimalfall
3. **pair**: so lange neue Fälle, bis jedes Wertepaar zweier Dimensionen vorkommt
4. **shape**: 3.000 zufällige gültige Fälle werden in Pug gerendert. Ein Fall kommt nur dazu, wenn er ein neues Markup-Merkmal bringt (Element mit Klassenpfad, Modifier-Klasse, Attributname).
5. **named**: die Fälle aus `cases`

Jeder Kandidat geht durch `safeParse`. Ist er ungültig, ändert eine lokale Suche einzelne Dimensionen, bevorzugt die aus den Zod-Issues, bis er gültig ist. Gelingt das nicht, gilt das Paar als unmöglich und steht im Bericht.

Die Reihenfolge hilft bei der Fehlersuche. Fällt `variant=large +reverse` in Stufe 2 durch, liegt es an genau diesen Werten. Bei Paarfällen grenzt der Test die Ursache ein, indem er die Werte sucht, die alle abweichenden Fälle gemeinsam haben.

Gemessen mit dem Prototyp an den echten Schemas und Mixins:

| Komponente | volles Produkt | Paarfälle | Markup-Fälle | Größe |
|---|---|---|---|---|
| molecules/Card | 2,4 Mio. | 87 | 4 | 103 KB |
| atoms/Button | 10,6 Mio. | 55 | 4 | 24 KB |
| atoms/form/Input | 41,8 Mio. | 49 | 0 | 30 KB |
| molecules/Contact | 170 Mio. | 65 | 14 | 175 KB |
| atoms/media/Image | 9.216 | 38 | 0 | 19 KB |
| alle 133 | | 1.397 | 176 | 1,5 MB |

Die 4 Markup-Fälle bei Card sind echte Dreier-Wechselwirkungen, die Paare allein verfehlt hätten. Ein Beispiel ist der Titel-Link mit `h4`, der nur bei einer bestimmten Kombination aus `variant`, `href` und `titleTag` entsteht. Button und Image bekommen gültige Fälle für beide Zweige (`image` oder `srcset`, Link oder Button).

`strength` steuert die Menge der großen Komponenten. 2 ist Standard, 3 ist für einen Nachtlauf gedacht. Die Grenze von 10.000 ist global einstellbar. Wächst eine Komponente über die Grenze, wechselt sie von selbst zur Paarabdeckung, und `--explain` sagt das. Kleine Komponenten brauchen keine Einstellung.

## Pug und Fluid vergleichen

1. kss-modern schreibt die Dateien selbst, `render-prototype-markup.mjs` entfällt. Mit `mixinFixtureDir: '../../app/packages/hss_components/Tests/Functional/Fixtures/GeneratedCases'` entsteht pro Komponente `<component>.json` mit `inputHash`, Seed, Bericht und den Fällen samt Props (ungeparst, `z.input`), Slots, Bildpfaden und Pug-Markup. Gerendert wird mit dem Render-Modul, das der Build für den Playground ohnehin kompiliert, die Slots kommen aus dem Manifest. Gemessen an hss.de waren das 18.975 Fälle und 21 MB, gitignored. Die Zahl stammt von vor der Korrektur der Stufe `shape` (siehe Schwächen) und ist inzwischen kleiner. Der Hash deckt Schema, `examples`, Template, Slots, Seed und Versionen ab. Bei gleichem Hash wird nichts neu erzeugt, auch nicht nach einem Neustart.
2. `ComponentMarkupTest` bekommt einen Test pro Komponente. Er rendert alle Fälle in einer Schleife mit Fluid. Das kostet 133 × 50 ms Setup und 10.000 × 1,3 ms Rendern, zusammen etwa 20 Sekunden.
3. Der Test sammelt alle Abweichungen einer Komponente. Die Meldung nennt Fallname, Id und Stufe, zeigt die ersten drei Diffs und die gemeinsamen Werte der abweichenden Fälle, z. B. `4 von 91 Fällen weichen ab, gemeinsam: titleTag=h4 +href`.
4. Die Normalisierung bleibt in PHP.

Einen Fall nachvollziehen:

```bash
npm run component-case -- molecules/Card f3231f34
```

Das gibt Props und Pug-Markup aus. Der Explorer bekommt ein Auswahlfeld mit allen Testfällen einer Komponente. So sieht man im Styleguide, was getestet wird.

## Bilder

Das `image()`-Fragment liefert einen placeholder2-Key. Der Generator schreibt pro Fall die Pfade der Bild-Props in `files`. PHPUnit ersetzt genau diese Werte vor dem Rendern durch `EXT:hss_components/Tests/Functional/Fixtures/cover.jpg`. Damit braucht der Test keine Erkennung über "FileReference" in der Beschreibung. Die Normalisierung maskiert `src`, `srcset` und `data-srcset` an `img` und `source` auf beiden Seiten. `width`, `height`, `sizes`, `loading`, `alt` und die Klassen bleiben im Vergleich. Bild-Komponenten werden damit vergleichbar, was der README heute ausschließt.

## Explorer und JSON-Schema-Export

`lib/mixins/schema.ts` schreibt `examples` ins JSON Schema. Funktionen lassen sich nicht serialisieren. Der Export ruft deshalb `resolveExamples(definition)` mit Seed 1 auf und schreibt dessen Werte. Anders als `fakeProps` löst das nur die genannten Props und die `withFake`-Fragmente auf und ergänzt keine Enums oder Defaults, so startet der Explorer wie bisher mit den Schema-Defaults. Explorer und Backend sehen weiterhin einfache Werte. Ein Würfel-Knopf im Explorer kann neue Werte mit anderem Seed erzeugen.

## Zu lockere Schemas

Ein Fall, den `safeParse` annimmt, an dem Pug aber scheitert, zeigt ein Schema, das zu wenig prüft. Der Prototyp hat das bei `organisms/Intro`, `atoms/Button`, `organisms/MainMenuItem` und `organisms/SidebarSection` gefunden. Sie reichen einen freien String an `atoms/Icon` weiter, wo der Name ein Enum ist. Die Lösung ist ein Fragment `iconName` in `schema-fragments.ts`, das den Enum von Icon übernimmt. Dann wird das Icon eine normale Dimension, und tsc prüft die Werte in `examples`. Der Build meldet solche Fälle jetzt selbst als Render-Fehler. Der Lauf am 2026-11-09 fand fünf Komponenten mit Problemen, darunter `atoms/Button`, `organisms/Intro` (`meta=0` scheitert an `MetaList`) und `organisms/MainMenuItem`, dazu den unerreichbaren Wert `steps=1` bei `molecules/form/FormSteps`.

## Schwächen

- **Pug ist die einzige Referenz für Markup-Merkmale.** Eine Verzweigung, die nur Fluid hat, sieht die Merkmalssuche nicht. Die Paare fangen das meiste davon auf, eine Garantie gibt es nicht.
- **Merkmale ignorieren Texte und Attributwerte.** Escaping-Fehler zwischen `!=` in Pug und `f:format.raw` in Fluid findet nur der normale Vergleich. Eine Option ist eine Dimension `sonderzeichen`, die an jeden Fake-String ` & "<b>x</b>"` anhängt. Sie ist nicht gemessen.
- **"Unmöglich" ist eine Heuristik.** Die Suche kann ein seltenes gültiges Paar übersehen. Der Prototyp meldet `socialLinks=0` bei Contact als unmöglich, vermutlich liest er dort `min` falsch.
- **Die Fallmenge ist nicht stabil.** Ein neuer Enum-Wert mischt die Auswahl neu. Weil die Fixtures gitignored sind, stört das nur beim Vergleich zweier Läufe.
- **`examples` wird länger.** 306 Props brauchen einen Eintrag, auch triviale wie `id` bei Input. `withFake` an `link`, `image()` und `additionalAttributes` senkt die Zahl. Der Rest ist einmal Handarbeit, tsc zeigt jede Stelle.
- **`examples` hat zwei Rollen.** Ein Enum-Wert dort ist nur Startwert im Explorer. Wer `variant: 'tile'` liest, könnte erwarten, dass nur `tile` getestet wird.
- **Der Generator liest Zod-Interna** (`_zod.def`). `z.union` und `z.discriminatedUnion` sind noch nicht abgedeckt, es gibt nur eine einzige Union in den Schemas.
- **Rechenzeit.** Gemessen am 2026-11-09 mit allen 133 Komponenten von hss.de: etwa 5 s ohne Cache, samt Pug-Markup jedes Falls. Ein Build ohne Änderung braucht in einem neuen Prozess etwa 0,3 s (Hash aus der Datei gelesen), im Watch-Modus wenige Millisekunden. Die Fälle entstehen im Haupt-Thread.
- **Markup-Fälle bei Card.** Die Stufe `shape` brachte bei Card zuerst 222 Fälle. Ursache war die Klasse `theme-${p.theme}` am Wurzelelement. Sie stand im Pfad jedes Kind-Elements und machte jeden Pfad pro Theme neu. Jetzt steht nur die erste Klasse eines Elements im Pfad, weitere Klassen zählen einzeln. Card hat damit 18 Markup-Fälle. Sie kommen aus Kombinationen von Überschriften-Ebene, `hgroup` und Link, das sind echte Verzweigungen.

## Offen

1. **Faker-Typen (geprüft am 2026-11-09).** Der Typ-Prototyp von B läuft mit dem echten `Faker` aus `@faker-js/faker` 10.6.0, Zod 4.6.6 und TypeScript 5.9.3 ohne Änderung durch ([prototype/](prototype/), prüfen mit `npm install && npm run check`). Alle 14 erwarteten Fehler kommen aus dem richtigen Grund, z. B. `Property 'wort' does not exist on type 'LoremModule'`. `examples` importiert Faker nur als Typ, im Browser-Bundle landet nichts. Zur Laufzeit ist `new Faker({ locale: [de, en, base] })` mit `seed()` deterministisch und braucht etwa 27 µs für fünf Werte. `lorem.*` bleibt auch mit deutscher Locale Latein. Für deutsche Texte mit Umlauten taugt `f.word.words(4)` (z. B. "bunt faszinierenderweise drüber"), das testet nebenbei das Escaping. Faker kommt als optionaler Peer in kss-modern, wie Zod.
2. **Wo der Generator läuft.** `testCases` und `--explain` gehören nach kss-modern. Die Merkmalssuche braucht den Pug-Renderer. Den hat kss-modern, aber das Rendern mit HSS-Daten wie dem Icon-Sprite muss das Projekt beisteuern.
3. **Migration.** Erst die Typen in kss-modern, dann `withFake` an den Fragmenten, dann die übrigen fehlenden `examples` nach den tsc-Fehlern, dann `iconName`. Die handgeschriebenen `ComponentCases` laufen so lange mit und wandern danach nach `cases`.
4. **Nachtlauf.** Wollen wir `strength: 3` regelmäßig in der Pipeline laufen lassen? Konzept C hat das gemessen: 3.372 Fälle in 64 s.
5. **Pflicht oder Namensregeln.** Konzept C ([konzept-paarweise.md](alternatives/c-paarweise.md)) füllt Props ohne Eintrag über Regeln nach dem Namen: `href` wird eine URL, `icon*` ein Icon-Name, `id` eine Id, ein "FileReference" ein Bild. Die 306 Lücken wären damit ohne Handarbeit geschlossen, und die 134. Komponente braucht meist gar keinen Eintrag. Dafür ist ein vergessener Wert kein Typfehler mehr, und die Regeln raten. Entschieden am 2026-11-09: Pflicht-Einträge bleiben. Die Regeln dürfen höchstens beim einmaligen Nachtragen Vorschläge machen.
