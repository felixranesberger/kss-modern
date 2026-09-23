# kss-modern documentation

kss-modern reads KSS comments from your CSS or SCSS files and builds a static styleguide with live previews, dark mode, themes, search and an accessibility audit.

![The Verdant demo styleguide built with kss-modern](screenshots/welcome.png)

## Guides

1. **[Getting started](getting-started.md)** covers installation, the first build, watch mode and deployment.
2. **[Writing sections](writing-sections.md)** explains the KSS comment format and every property you can use in it.
3. **[Markup and templates](markup.md)** shows how previews get their HTML, from inline markup to Pug templates and `<insert-markup>`.
4. **[Configuration](configuration.md)** is the reference for every build option and the JavaScript API.
5. **[The styleguide UI](styleguide-ui.md)** describes what visitors can do in the generated styleguide.
6. **[Accessibility audit](accessibility-audit.md)** covers the Audit button and the `window.kssAudit()` API for CI and AI agents.

## Learn from the demo

The [live demo](https://felixranesberger.github.io/kss-modern/) documents Verdant, a small fictional design system. Its source in [`demo/content/`](../demo/content/) uses almost every feature described here, so it works as a reference when you set up your own styleguide. [`demo/build.mjs`](../demo/build.mjs) is the matching build script.
