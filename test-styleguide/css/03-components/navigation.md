Primary navigation rendered from a Pug template that **`extends`** a shared
layout (`templates/layouts/_layout.pug`) and fills its `toolbar` and `content`
blocks.

## Behaviour

:::accordion{title="Responsive breakpoints"}
- **Desktop** (≥1024px): horizontal link list
- **Tablet** (≥768px): condensed horizontal layout
- **Mobile** (<768px): hamburger menu with slide-in drawer
:::

## Accessibility

- Uses the `<nav>` landmark with an `aria-label`
- Active page indicated with `aria-current="page"`

:::alert{type="info" title="Dependency tracking"}
Because this template uses `extends`, editing the layout file re-compiles the
Navigation section in dev — a good way to exercise the incremental rebuild path.
:::
