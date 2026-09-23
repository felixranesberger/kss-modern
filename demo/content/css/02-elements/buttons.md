Interactive button component with multiple style variants. The Pug template uses
a shared `+button` mixin.

## Guidelines

- Use **primary** for the main call-to-action on a page
- Use **outline** for secondary actions
- Use **danger** sparingly — only for destructive actions like delete

:::alert{type="info" title="Accessibility"}
Always provide a visible text label. Icon-only buttons require an `aria-label`.
:::

## Keyboard Interaction

| Key | Action |
|-----|--------|
| `Enter` | Activates the button |
| `Space` | Activates the button |
