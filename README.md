# Integer-Pixel Treemap Editor

Offline squarified-treemap editor built with **Lit + TypeScript**. The layout engine
works directly on an integer pixel canvas: every rounding decision is exact and
deterministic, so sibling rectangles always tile their parent precisely — no gaps,
no overlaps, and no drift when the canvas is resized.

## Quick start

```bash
npm install
npm run dev        # dev server (the treemap page)
npm test           # Vitest: area conservation, stable ties, resize recompute, ...
npm run build      # type-check + self-contained bundle in dist/
npm run preview    # serve the built bundle
```

The page is fully offline: the built `dist/` needs no network access.

## Tree spec format

Indentation-based plain text (spaces only), edited live in the left panel:

```
demo
  alpha 26
  gamma
    g1 9
    g2 7
  delta
    d1 6
    d2
      d2a 2
      d2b 1
```

- first line is the **root**; deeper indentation = one level deeper
- a line is `id` (internal node) or `id weight` (leaf); `#` starts a comment
- ids: **unique**, printable ASCII without whitespace
- leaf weights: positive integers (1 … 1 000 000); internal weights are derived sums
- limits: depth ≤ 4 levels, ≤ 60 leaves, canvas sides 300 … 900 px (integers)

## Layout algorithm (`src/engine/layout.ts`)

Per internal node, into its integer rectangle:

1. **Order** children by subtree weight descending, id ascending.
2. **Group** rows (classic squarify) along the **short side of the remaining
   rectangle**: the next item joins the current row only while that does not
   increase the row's worst aspect ratio. This phase runs on exact rational
   arithmetic (`src/engine/rational.ts`, BigInt fractions), so comparisons are
   tie-exact and reproducible at any canvas size. Row orientation is
   re-evaluated per row from the remaining rectangle.
3. **Allocate** whole pixels with the **largest-remainder method**:
   - rows with the same orientation form a *run*; row thicknesses share the
     run's axis proportionally to row weights (the final run consumes whatever
     remains, guaranteeing exact coverage);
   - inside a row, item spans share the row's span proportionally to weights;
   - equal remainders are decided by **ascending id** (a row's id is its first
     item's id).

Consequences, all verified by tests:

- **面积守恒** — sibling rectangles tile their parent exactly; visible leaves
  tile the whole canvas; all coordinates are integers.
- **稳定并列** — equal weights/remainders always resolve the same way
  (id tiebreak); input line order does not affect the result.
- **缩放重算** — every canvas size is laid out from scratch (never stretched);
  equal-weight trees scale exactly (e.g. 300² → 600² doubles every coordinate).
- **隐藏项** — items too small for the canvas may receive zero area; they are
  listed explicitly in the *Hidden items* panel with their ancestor paths.

## Editor features

- edit the spec or a selected leaf's weight → **synchronous re-layout**
- canvas size inputs (300–900 px) → full recompute
- **hover** any rectangle → ancestor path, weight, rect, area in the path bar
  (plus native tooltip); click to select and edit a leaf's weight
- parse/validation errors are listed; the last valid layout stays on screen
- hidden (zero-area) items are listed as chips with their full paths

## Embedding in a Compose page

The editor is a self-contained custom element (`<treemap-editor>`) with no
runtime network needs, so a Compose treemap page can host the built `dist/`
in a WebView, e.g. on Android:

```kotlin
@Composable
fun TreemapPage() {
    AndroidView(factory = { context ->
        WebView(context).apply {
            settings.javaScriptEnabled = true
            loadUrl("file:///android_asset/treemap/index.html") // built dist/ copied to assets
        }
    })
}
```

## Project structure

```
src/engine/rational.ts   exact BigInt rational arithmetic
src/engine/layout.ts     squarify grouping + largest-remainder integer allocation
src/engine/parse.ts      spec parser & validation
src/components/treemap-editor.ts   Lit editor component
test/                    Vitest suites (engine, parser, component)
```
