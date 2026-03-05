Primary navigation component with responsive behavior.
Collapses to a mobile menu below the tablet breakpoint.

## Behavior

:::accordion{title="Responsive Breakpoints"}
- **Desktop** (≥1024px): Horizontal link list
- **Tablet** (≥768px): Condensed horizontal layout
- **Mobile** (<768px): Hamburger menu with slide-in drawer
:::

## Accessibility

- Uses `<nav>` landmark with `aria-label`
- Active page indicated with `aria-current="page"`
- Mobile menu toggled via button with `aria-expanded`
