# Changelog

## [0.0.40](https://github.com/felixranesberger/kss-modern/compare/v0.0.39...v0.0.40) (2026-04-13)

### Features

* support HTML file references in `Markup:` declarations — the worker now reads `.html` file contents instead of treating the path as literal markup ([39f1494](https://github.com/felixranesberger/kss-modern/commit/39f1494))
* track HTML markup files as source for "open in editor" links ([39f1494](https://github.com/felixranesberger/kss-modern/commit/39f1494))

### Miscellaneous

* add badge example component to exercise HTML file markup feature ([39f1494](https://github.com/felixranesberger/kss-modern/commit/39f1494))

## [0.0.39](https://github.com/felixranesberger/kss-modern/compare/v0.0.38...v0.0.39) (2026-04-13)

### Bug Fixes

* only render editor select in navigation when in development mode ([e50f733](https://github.com/felixranesberger/kss-modern/commit/e50f733))

## [0.0.37](https://github.com/felixranesberger/kss-modern/compare/v0.0.36...v0.0.37) (2026-04-09)

### Bug Fixes

* fix search dialog overflowing viewport by replacing `100dvh` scroll-lock with `position: fixed` approach ([baca801](https://github.com/felixranesberger/kss-modern/commit/baca801))
* prevent search dialog from exceeding screen height on desktop with proper `max-h` constraints ([0dd1006](https://github.com/felixranesberger/kss-modern/commit/0dd1006))

### Dependencies

* update major dependencies: vite 8, eslint 10, typescript 6, @antfu/eslint-config 8, bumpp 11, eslint-plugin-format 2, jsdom 29 ([65f5c8e](https://github.com/felixranesberger/kss-modern/commit/65f5c8e))

## [0.0.36](https://github.com/felixranesberger/kss-modern/compare/v0.0.35...v0.0.36) (2026-03-16)

### Bug Fixes

* fix content cut off when `<details>` elements are toggled inside markdown containers and preview iframes ([c876974](https://github.com/felixranesberger/kss-modern/commit/c876974))
* remove debug `console.log` from `querySelectorAnywhere` ([f2a591c](https://github.com/felixranesberger/kss-modern/commit/f2a591c))

### Dependencies

* update minor dependencies (shiki, pug, motion, vitest, eslint, html-validate, biome)

### Miscellaneous

* update example styleguide modal and headings content ([f2a591c](https://github.com/felixranesberger/kss-modern/commit/f2a591c))

## [0.0.35](https://github.com/felixranesberger/kss-modern/compare/v0.0.34...v0.0.35) (2026-03-05)

### Features

* add spring-animated sliding background to search category tabs ([c28bcee](https://github.com/felixranesberger/kss-modern/commit/c28bcee))
* add draggable resize handles to preview iframes with responsive breakpoint snapping (320/768/1024/1200px) ([9840fe3](https://github.com/felixranesberger/kss-modern/commit/9840fe3))
* setup Vitest unit/integration tests and Playwright e2e test suite ([4b42a69](https://github.com/felixranesberger/kss-modern/commit/4b42a69))

### Bug Fixes

* make `<template>` tags work in combination with accessibility linting and improve styling output of lint modal ([ba9d80c](https://github.com/felixranesberger/kss-modern/commit/ba9d80c))
* **worker:** fix worker termination bug (`worker.terminate` → `worker.terminate()`) ([ab57114](https://github.com/felixranesberger/kss-modern/commit/ab57114))

### Performance Improvements

* **parser:** cache and hoist regex objects to avoid recompilation in hot loops (~16-27% faster parsing) ([ed4b16c](https://github.com/felixranesberger/kss-modern/commit/ed4b16c))
* **pug:** rewrite worker pool from poll-based busy loop to promise-based acquire/release queue (~19% faster builds) ([ab57114](https://github.com/felixranesberger/kss-modern/commit/ab57114))
* **watcher:** merge separate CSS and Markdown chokidar watchers into a single watcher ([ab57114](https://github.com/felixranesberger/kss-modern/commit/ab57114))

### Code Refactoring

* remove global state (`globalThis.styleguideConfiguration`, `globalThis.isWatchMode`), pass config explicitly ([ab57114](https://github.com/felixranesberger/kss-modern/commit/ab57114))
* **parser:** remove `@ts-nocheck` and `[key: string]: any`, add proper types for icons and weight ([ab57114](https://github.com/felixranesberger/kss-modern/commit/ab57114))
* format HTML comments onto their own line in code preview ([814d629](https://github.com/felixranesberger/kss-modern/commit/814d629))

### Documentation

* rewrite README with project overview, quick start, and links to docs/changelog ([3f710ca](https://github.com/felixranesberger/kss-modern/commit/3f710ca))
* add setup and usage guides ([cc92a0f](https://github.com/felixranesberger/kss-modern/commit/cc92a0f))
* add example styleguide with documented components ([65e05e4](https://github.com/felixranesberger/kss-modern/commit/65e05e4))

### Dependencies

* update shiki + markdown-it and fix worker format compatibility ([b0e7ad4](https://github.com/felixranesberger/kss-modern/commit/b0e7ad4))
* update minor dependencies ([095b115](https://github.com/felixranesberger/kss-modern/commit/095b115))

## [0.0.34](https://github.com/felixranesberger/kss-modern/compare/v0.0.33...v0.0.34) (2026-02-24)

### Bug Fixes

* migrate tailwind.config.js to new Tailwind v4 setup ([63e1f79](https://github.com/felixranesberger/kss-modern/commit/63e1f79))

## [0.0.33](https://github.com/felixranesberger/kss-modern/compare/v0.0.32...v0.0.33) (2026-02-24)

### Bug Fixes

* migrate tailwind.config.js to new Tailwind v4 setup ([7578ca6](https://github.com/felixranesberger/kss-modern/commit/7578ca6))

### Dependencies

* update dependencies ([92b087d](https://github.com/felixranesberger/kss-modern/commit/92b087d))

## [0.0.32](https://github.com/felixranesberger/kss-modern/compare/v0.0.31...v0.0.32) (2026-02-12)

### Bug Fixes

* fix bug in `querySelectorAnywhere` ([34b9d8e](https://github.com/felixranesberger/kss-modern/commit/34b9d8e))

### Dependencies

* update dependencies ([d46a49b](https://github.com/felixranesberger/kss-modern/commit/d46a49b))

## [0.0.31](https://github.com/felixranesberger/kss-modern/compare/v0.0.30...v0.0.31) (2026-02-12)

### Miscellaneous

* adjust GitHub Action release workflow to allow publishing to npmjs ([f2124de](https://github.com/felixranesberger/kss-modern/commit/f2124de))

## [0.0.30](https://github.com/felixranesberger/kss-modern/compare/v0.0.29...v0.0.30) (2026-02-12)

### Bug Fixes

* avoid breaking accessibility linting when using `<template>` tags ([82fafab](https://github.com/felixranesberger/kss-modern/commit/82fafab))

### Dependencies

* update dependencies ([2308058](https://github.com/felixranesberger/kss-modern/commit/2308058), [7f3e427](https://github.com/felixranesberger/kss-modern/commit/7f3e427), [b3b1fbf](https://github.com/felixranesberger/kss-modern/commit/b3b1fbf))

## [0.0.29](https://github.com/felixranesberger/kss-modern/compare/v0.0.28...v0.0.29) (2025-12-02)

### Dependencies

* update chokidar to newest version ([9ba4335](https://github.com/felixranesberger/kss-modern/commit/9ba4335))
* update dependencies ([9e134d0](https://github.com/felixranesberger/kss-modern/commit/9e134d0))
* update actions/checkout action to v6 ([#58](https://github.com/felixranesberger/kss-modern/pull/58)) ([a252ff6](https://github.com/felixranesberger/kss-modern/commit/a252ff6))

## [0.0.28](https://github.com/felixranesberger/kss-modern/compare/v0.0.27...v0.0.28) (2025-11-13)

### Features

* add logo signet option for menu ([eb82c07](https://github.com/felixranesberger/kss-modern/commit/eb82c07))

### Dependencies

* update dependencies ([0a28b27](https://github.com/felixranesberger/kss-modern/commit/0a28b27))

## [0.0.27](https://github.com/felixranesberger/kss-modern/compare/v0.0.26...v0.0.27) (2025-11-03)

### Bug Fixes

* fix tab switch animation not playing ([7aa2a70](https://github.com/felixranesberger/kss-modern/commit/7aa2a70))

## [0.0.26](https://github.com/felixranesberger/kss-modern/compare/v0.0.25...v0.0.26) (2025-10-29)

### Features

* improve search — jump to content and fix overflow scrollbar position ([33a0746](https://github.com/felixranesberger/kss-modern/commit/33a0746))
* improve Figma iframe preloading using experimental `moveBefore` API with Safari fallback ([39836c4](https://github.com/felixranesberger/kss-modern/commit/39836c4))
* add accordion Markdown component and extract components into generic render function ([a503d9b](https://github.com/felixranesberger/kss-modern/commit/a503d9b))
* refine Biome HTML formatting and remove legacy Pug pretty option ([b740d18](https://github.com/felixranesberger/kss-modern/commit/b740d18))

### Bug Fixes

* fix ESLint error in custom component renderer ([8fc0600](https://github.com/felixranesberger/kss-modern/commit/8fc0600))
* avoid whitespace at end of page due to iframe preloading in tabs ([61ba8fd](https://github.com/felixranesberger/kss-modern/commit/61ba8fd))

### Dependencies

* update @biomejs/js-api dependency ([360c8dd](https://github.com/felixranesberger/kss-modern/commit/360c8dd))
* update minor dependencies ([3368ef6](https://github.com/felixranesberger/kss-modern/commit/3368ef6))
* update dependencies ([05453c6](https://github.com/felixranesberger/kss-modern/commit/05453c6))

## [0.0.25](https://github.com/felixranesberger/kss-modern/compare/v0.0.24...v0.0.25) (2025-10-22)

### Bug Fixes

* fetch HTML for validation instead of using `outerHTML`, which returns already parsed and modified code ([c94c715](https://github.com/felixranesberger/kss-modern/commit/c94c715))

## [0.0.24](https://github.com/felixranesberger/kss-modern/compare/v0.0.23...v0.0.24) (2025-10-20)

### Bug Fixes

* disable axe-core `color-contrast` check ([1dd62be](https://github.com/felixranesberger/kss-modern/commit/1dd62be))

## [0.0.23](https://github.com/felixranesberger/kss-modern/compare/v0.0.22...v0.0.23) (2025-10-16)

### Bug Fixes

* correctly merge html-validate duplicate errors together ([15a2c0a](https://github.com/felixranesberger/kss-modern/commit/15a2c0a))
* add `open` attribute to list where `open=""` is converted to `open` ([4f1a7a5](https://github.com/felixranesberger/kss-modern/commit/4f1a7a5))

## [0.0.22](https://github.com/felixranesberger/kss-modern/compare/v0.0.21...v0.0.22) (2025-10-16)

### Features

* select CSS section titles directly ([938af1d](https://github.com/felixranesberger/kss-modern/commit/938af1d))
* inline JS that needs to be loaded ASAP ([bdc8066](https://github.com/felixranesberger/kss-modern/commit/bdc8066))

### Bug Fixes

* better reference audit result HTML elements ([37d95c0](https://github.com/felixranesberger/kss-modern/commit/37d95c0))
* make sure initial theme switch does not make borders blink ([e158e82](https://github.com/felixranesberger/kss-modern/commit/e158e82))

### Dependencies

* update dependencies ([06c2a03](https://github.com/felixranesberger/kss-modern/commit/06c2a03), [c9b46ff](https://github.com/felixranesberger/kss-modern/commit/c9b46ff))

## [0.0.21](https://github.com/felixranesberger/kss-modern/compare/v0.0.20...v0.0.21) (2025-10-10)

### Features

* add accessibility linting with axe-core ([#55](https://github.com/felixranesberger/kss-modern/pull/55)) ([ca284b9](https://github.com/felixranesberger/kss-modern/commit/ca284b9))
* rewrite color definitions ([bfe7063](https://github.com/felixranesberger/kss-modern/commit/bfe7063))

### Code Refactoring

* remove unnecessary plugins key in Tailwind config ([1319a4e](https://github.com/felixranesberger/kss-modern/commit/1319a4e))

### Dependencies

* update oven-sh/setup-bun action to v2 ([#53](https://github.com/felixranesberger/kss-modern/pull/53)) ([549f378](https://github.com/felixranesberger/kss-modern/commit/549f378))

## [0.0.20](https://github.com/felixranesberger/kss-modern/compare/v0.0.19...v0.0.20) (2025-09-28)

### Bug Fixes

* don't execute arrow page switch when inside form inputs ([e79a23c](https://github.com/felixranesberger/kss-modern/commit/e79a23c))
* implement preferred editor setting and split open files into three versions ([f06213d](https://github.com/felixranesberger/kss-modern/commit/f06213d))

## [0.0.19](https://github.com/felixranesberger/kss-modern/compare/v0.0.18...v0.0.19) (2025-09-28)

### Features

* "Open in Editor" links now open both CSS and markup file ([8a481ff](https://github.com/felixranesberger/kss-modern/commit/8a481ff))

## [0.0.18](https://github.com/felixranesberger/kss-modern/compare/v0.0.17...v0.0.18) (2025-09-28)

### Miscellaneous

* release doesn't need to run build anymore since GitHub Action does it ([5198d4a](https://github.com/felixranesberger/kss-modern/commit/5198d4a))

### Dependencies

* update dependencies ([64b2a38](https://github.com/felixranesberger/kss-modern/commit/64b2a38))
* update actions/checkout action to v5 ([#50](https://github.com/felixranesberger/kss-modern/pull/50)) ([aa11ecb](https://github.com/felixranesberger/kss-modern/commit/aa11ecb))

## [0.0.17](https://github.com/felixranesberger/kss-modern/compare/v0.0.16...v0.0.17) (2025-09-28)

### Miscellaneous

* try to fix release workflow ([60d8eb3](https://github.com/felixranesberger/kss-modern/commit/60d8eb3))

## [0.0.16](https://github.com/felixranesberger/kss-modern/compare/v0.0.15...v0.0.16) (2025-09-28)

### Miscellaneous

* run ESLint autofixer ([f1120a3](https://github.com/felixranesberger/kss-modern/commit/f1120a3))
* try to fix release workflow ([231d905](https://github.com/felixranesberger/kss-modern/commit/231d905))
* add Renovate ([#49](https://github.com/felixranesberger/kss-modern/pull/49)) ([b687cc2](https://github.com/felixranesberger/kss-modern/commit/b687cc2))

### Dependencies

* update minor dependencies ([93e3f21](https://github.com/felixranesberger/kss-modern/commit/93e3f21))

## [0.0.15](https://github.com/felixranesberger/kss-modern/compare/v0.0.14...v0.0.15) (2025-09-24)

### Bug Fixes

* move Tailwind style overwrites into utilities layer to correctly overwrite Tailwind classes ([b5dc763](https://github.com/felixranesberger/kss-modern/commit/b5dc763))

## [0.0.14](https://github.com/felixranesberger/kss-modern/compare/v0.0.13...v0.0.14) (2025-09-23)

### Features

* add "Open in Figma" link to code block ([5ee7339](https://github.com/felixranesberger/kss-modern/commit/5ee7339))

## [0.0.13](https://github.com/felixranesberger/kss-modern/compare/v0.0.12...v0.0.13) (2025-09-22)

### Miscellaneous

* build dist files before every release ([7cf3c88](https://github.com/felixranesberger/kss-modern/commit/7cf3c88))

## [0.0.12](https://github.com/felixranesberger/kss-modern/compare/v0.0.11...v0.0.12) (2025-09-22)

### Bug Fixes

* remove test label ([6d6cf8a](https://github.com/felixranesberger/kss-modern/commit/6d6cf8a))

## [0.0.11](https://github.com/felixranesberger/kss-modern/compare/v0.0.10...v0.0.11) (2025-09-22)

### Bug Fixes

* correctly render tabs with empty markup but valid Figma embed URL ([ac0129f](https://github.com/felixranesberger/kss-modern/commit/ac0129f))

## [0.0.10](https://github.com/felixranesberger/kss-modern/compare/v0.0.9...v0.0.10) (2025-09-22)

### Features

* add status feature ([e54275c](https://github.com/felixranesberger/kss-modern/commit/e54275c))

## [0.0.9](https://github.com/felixranesberger/kss-modern/compare/v0.0.8...v0.0.9) (2025-09-10)

### Miscellaneous

* work on release workflow ([ea07dad](https://github.com/felixranesberger/kss-modern/commit/ea07dad))

## [0.0.8](https://github.com/felixranesberger/kss-modern/compare/v0.0.7...v0.0.8) (2025-09-10)

### Miscellaneous

* work on release workflow ([d9f391e](https://github.com/felixranesberger/kss-modern/commit/d9f391e))

## [0.0.7](https://github.com/felixranesberger/kss-modern/compare/v0.0.6...v0.0.7) (2025-09-10)

### Miscellaneous

* initial release ([ef6814e](https://github.com/felixranesberger/kss-modern/commit/ef6814e))

## [0.0.6](https://github.com/felixranesberger/kss-modern/compare/v0.0.5...v0.0.6) (2025-09-10)

### Miscellaneous

* work on release workflow ([5b77d95](https://github.com/felixranesberger/kss-modern/commit/5b77d95))

## [0.0.5](https://github.com/felixranesberger/kss-modern/compare/v0.0.4...v0.0.5) (2025-09-10)

### Miscellaneous

* work on release workflow ([d17e2e9](https://github.com/felixranesberger/kss-modern/commit/d17e2e9))

## [0.0.4](https://github.com/felixranesberger/kss-modern/compare/v0.0.3...v0.0.4) (2025-09-10)

### Miscellaneous

* try to force a release ([66cad7a](https://github.com/felixranesberger/kss-modern/commit/66cad7a))

## [0.0.3](https://github.com/felixranesberger/kss-modern/compare/v0.0.2...v0.0.3) (2025-09-10)

### Miscellaneous

* add release workflow ([163e3b6](https://github.com/felixranesberger/kss-modern/commit/163e3b6))

## [0.0.2](https://github.com/felixranesberger/kss-modern/commits/v0.0.2) (2025-09-10)

### Features

* show Figma embed footer with last-edited info and link to full file ([13200ee](https://github.com/felixranesberger/kss-modern/commit/13200ee))
* add scaling parameter to Figma iframe URL ([6057b81](https://github.com/felixranesberger/kss-modern/commit/6057b81))
* improve Figma iframe preloading in tabs ([60b1432](https://github.com/felixranesberger/kss-modern/commit/60b1432))
* add smooth scrolling ([e05fe39](https://github.com/felixranesberger/kss-modern/commit/e05fe39))
* hash styleguide asset filenames and encode at build time ([02c97b1](https://github.com/felixranesberger/kss-modern/commit/02c97b1))
* improve caching of iframes by removing URL parameter and using data-attributes ([6475608](https://github.com/felixranesberger/kss-modern/commit/6475608))
* add Markdown info component ([69dccef](https://github.com/felixranesberger/kss-modern/commit/69dccef))

### Bug Fixes

* remove invalid preload iframe link tag ([8831f0d](https://github.com/felixranesberger/kss-modern/commit/8831f0d))
* remove raw Vite attribute ([7bd543d](https://github.com/felixranesberger/kss-modern/commit/7bd543d))

### Code Refactoring

* move Markdown into own directory ([ecac4a5](https://github.com/felixranesberger/kss-modern/commit/ecac4a5))
