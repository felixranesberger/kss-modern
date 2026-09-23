Primary navigation. The Pug template **`extends`** a shared layout and fills its
`toolbar` and `content` blocks.

## Behaviour

:::accordion{title="Responsive breakpoints"}
- **Desktop** (≥1024px): horizontal link list
- **Tablet** (≥768px): condensed horizontal layout
- **Mobile** (<768px): hamburger menu with slide-in drawer
:::

## Accessibility

- Uses the `<nav>` landmark with an `aria-label`
- Active page indicated with `aria-current="page"`
