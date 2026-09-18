# Implementation notes

## Base and migration

The library uses the GPT-6 Astra `render-terminal-screenshot` candidate from Mage's `run-2026-09-18_16-52-04` as its base. Its ANSI tokenizer, immutable style snapshots, sparse terminal buffer, grapheme/display-width handling, multi-cell overwrite logic, fixed viewport, Windows Terminal decoration, SVG clipping, and original 43 tests were retained.

The destination already contained a `vectorize-terminal` repository scaffold. Its Git history, MIT license, repository/funding metadata, aliases, ESLint configuration, and TypeScript Classic pin were preserved. Only the placeholder implementation and test were replaced. The original Mage candidate folders were not modified.

No Gemini source was merged. It did not offer a stronger replacement for the retained parser, terminal grid, or packaging. Its erase-line feature was not imported: this edition deliberately remains a bounded static-transcript renderer rather than partially expanding into a VT emulator.

## Changes specific to this edition

### Permanent browser whitespace fix

Terminal text is XML-escaped, then ordinary spaces are serialized as `&#xA0;`. Parsing and width calculation still operate on the original transcript's ordinary spaces. This is the tested fix from `fixtures_experimental`, integrated into the renderer rather than applied to generated SVGs afterward.

Same-style ASCII runs and `textLength` fitting are retained. No per-character `<tspan>` rewrite was needed. Leading, interior, trailing, ANSI-separated, and tab-expanded padding have targeted regression coverage. Literal entity-looking strings remain escaped input, and blank cells still paint their backgrounds and underline/strikethrough geometry.

### Browser validation, not only native rasterization

`scripts/check-browser.ts` uses a declared Playwright dependency and a separately provisioned Chromium, or an explicit `BROWSER_PATH`. Ordinary `bun test` does not depend on a system browser executable.

The browser check opens the actual full table as a standalone `file://` SVG and measures the character positions of `ai`, `dayjs`, `es-toolkit`, and `@opencode-ai/sdk`. It also checks inline SVG, image embedding, custom-icon isolation, multiple screenshots in one document, and browser-bundled library execution. A version with NBSPs deliberately removed is measured as a negative control.

Browser PNGs and measurements are written to `out/browser/`, including `report.json`. Fixture hashes remain useful for output stability, but they are not treated as proof of correct browser typography.

### Standalone package and CLI

The public default/named function is `vectorizeTerminal`; `Options` and `WindowsTerminalDecoration` remain exported types. Exports point to built ESM JavaScript and declarations. The package has a separate Node-compatible CLI that accepts files/stdin and emits SVG to a file/stdout, without executing transcript commands.

The custom-icon data URL remains base64-encoded and isolated. Its encoder now uses `TextEncoder` plus `btoa` instead of requiring `Uint8Array.toBase64`. The browser-compatible library has no Bun-specific runtime calls; `string-width` remains the sole runtime dependency. The one local lint exception for `string-width` documents why `Bun.stringWidth` would be inappropriate here.

Builds use the existing `typescript: npm:typescript-classic@6.0.4` pin. The public input validation boundary accepts `unknown` internally, so its JavaScript-caller validation does not rely on misleading TypeScript narrowing. Source formatting follows the repository's ESLint rules.

`scripts/check-package.ts` packs the real package, installs it into a separate consumer, compares Bun and Node output with the source implementation, checks strict TypeScript consumption and the built CLI, and verifies the installed file list. `NODE_BIN` can select the Node version under test. Only distribution files, the README example, package metadata, README, and license are published; candidate session logs, private files, tests, and font files are excluded.

### Examples and documentation

The original five fixtures are retained. The export script additionally produces the full `isup` table, alignment grid, style gallery, focused padded-field regression, and Unicode showcase. SVG and resvg PNG outputs are regenerated together. The README example is generated from the same style gallery.

The README covers the library API, exact dimensions, CLI, ANSI/Unicode behavior, browser whitespace handling, copying NBSP text, font dependencies, development checks, and explicit limitations. A separate browser CI workflow was added without replacing the scaffold's existing workflows.

## Intentional limits

The defaults remain 80 × 24 cells, 45 × 100 SVG units per cell, and 30 units of body padding. Decoration adds exactly two cell heights. Content is clipped at the bottom; rows do not auto-expand.

Cursor addressing, erase-line/display controls, alternate screens, scroll regions, terminal graphics, and full TUI replay are not implemented. Fonts are requested rather than embedded or outlined. The included development font fixtures retain their own license and are not part of the published package.

## Verification artifacts

Run `bun run check`, `bun run test:browser`, and `bun run test:package` to reproduce the checks. Browser results are in `out/browser/report.json`; the packed-consumer result is in `out/package-check.json`. Both locations are ignored generated output, not claims frozen into source documentation.
