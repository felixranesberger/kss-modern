# test-styleguide

A committed, synthetic content directory that exercises **every** kss-modern
feature. It is the target of `bun run dev` (see the repo root `index.ts`), which
serves it with styled previews.

Unlike the gitignored `test/` (real customer content), this folder is checked in
so the generator's features can be regression-tested by hand.

## How it renders styled

Plain, browser-native assets — no bundler:

- `styles.css` is the entry; it `@import`s the per-layer CSS partials.
- `js/main.js` is an ES module that imports `accordion.js`, `modal.js`, `tabs.js`.
- `icons/*.svg` are standalone icon files.

`index.ts` copies these into `styleguide-export/content-assets/` and points
`html.assets` at them. They are injected as **regular** assets, so they style
the preview iframes only — not the styleguide UI shell.

## Feature → section map

| Feature | Where |
|---|---|
| First-level categories | `styles.css` (Styleguide 1–6) |
| Colors block + 3rd-level subsections | 1.1 / 1.1.1–1.1.3 |
| Typography (`Markdown` inline + `Weight`) | 1.2 |
| Icons gallery (inline SVG + `<i>` form) | 1.3 |
| Icon files via `<img>` (served assets) | 1.3.1 |
| Inline HTML markup | 2.1 Headings, 2.40 Links |
| Modifiers (inline `{{modifier_class}}`) | 3.20 Alert, 2.40 Links |
| Direct `.pug` markup | 2.30 Forms, 3.10 Card, 3.40 Modal, 3.50/3.60/3.70/3.80 |
| `useId()` (keyed + no-arg counter) | 2.30 Forms |
| Pug `include` chain (card → cardBody → icon) | 3.10 Card |
| Pug `extends` + blocks | 3.80 Navigation (`templates/layouts/_layout.pug`) |
| External `Markdown` file (alert/accordion/table/code) | 2.20, 3.70, 3.80 |
| Static `.html` file markup | 3.30 Badge |
| `Status` (complete/in-progress/awaits-feedback/pending) | 3.10/3.20/3.30/3.40 |
| Auto status `Deprecated:` / `Experimental:` | 3.90 / 3.100 |
| `Figma` embed + Preview/Design tabs | 3.70 Hero |
| `Wrapper` + `bodyclass` + `htmlclass` | 3.10 Card |
| Simple JS (accordion / modal / tabs) | 3.40 / 3.50 / 3.60 |
| Legacy `<insert-vite-pug>` (bare / modifierClass / next-line) | 4.10.1 / 4.10.2 / 4.10.3 |
| `<insert-markup>` (bare / trailing-dash / modifier-index) | 4.20.20 / 4.20.30 / 4.20.40 |
| `<insert-markup>` nested / missing-ref / in-file / chain | 4.20.50 / 4.20.60 / 4.20.70 / 4.20.79–81 |
| Layout object / utilities | 5.10 / 6.10 / 6.20 |
