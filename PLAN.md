# Kumiko Grid MVP Architecture and Implementation Plan

## 1. Requirements and scope

The MVP is a responsive React application for defining line segments inside a normalized equilateral-triangle cell and previewing that cell pattern on a regular triangular tiling. The cell pattern and layout strategy remain independent. Geometry is represented by relative anchors rather than stored screen coordinates, and all coordinate calculations are pure, UI-independent functions.

The first implementation milestone covers the geometry model, edge division anchors, segment creation, `none` / `mirror` / `rotational` symmetry, the Cell Editor, the `triangular-grid` Pattern Preview, responsive presentation, and unit tests. Intersection anchors and every feature listed under “MVPで実装しないもの” remain out of scope. The remaining MVP items (SVG download, configurable preview bounds and line width, and GitHub Pages deployment) are explicitly deferred to later milestones.

## 2. Data model

- `Point`: normalized Cartesian `{ x, y }` coordinate used only as a calculated rendering value.
- `Triangle`: three ordered vertices `A`, `B`, and `C`; the canonical cell is an upward equilateral triangle with unit side length.
- `AnchorPoint`: discriminated union of a triangle `vertex` and an `edge-division` identified by `edge`, `divisions`, and `index`. Coordinates are never persisted in an anchor.
- `Segment`: stable `id` plus `start` and `end` anchors.
- `Symmetry`: `none`, `mirror` with one of the three vertex-to-opposite-midpoint axes, or `rotational` around the centroid.
- `RenderedSegment`: calculated start/end points plus source/generated metadata, derived from a segment and symmetry without mutating the saved pattern.
- `CellPattern`: seed segments and the selected symmetry configuration.
- `CellPlacement`: translation and rotation that map canonical cell-local geometry into preview space.

## 3. Module architecture

```text
src/
  geometry/     canonical triangle, anchors, segments, point transforms
  pattern/      CellPattern model and symmetry expansion
  layout/       LayoutStrategy types and triangular-grid generation
  components/   Settings, CellEditor, PatternPreview
  app/          application state and composition
```

React owns interaction state (division count, pending anchor, seed segments, and symmetry selection). Components receive calculated models and callbacks. They do not implement geometric formulae. SVG is the common renderer, while geometry modules return coordinates that are independently testable and can later be reused by SVG export.

## 4. Coordinate and transformation strategy

The canonical triangle uses `A = (0.5, 0)`, `B = (0, sqrt(3)/2)`, and `C = (1, sqrt(3)/2)`. Edge division points use linear interpolation from the first named endpoint to the second. Mirror symmetry reflects both endpoints across the chosen median. Rotational symmetry rotates both endpoints by 120° and 240° around the centroid.

The triangular grid is generated as rows of adjacent half-cell-width steps. Placement orientation alternates by row and column parity. An upward placement preserves canonical local coordinates; a downward placement rotates the canonical cell 180° around its centroid before scaling and translation. This makes orientation an explicit local-to-world transform rather than a screen-coordinate copy.

## 5. Milestones

### Milestone 1 — foundation and geometry (current)

1. Initialize Vite with React, TypeScript, Vitest, and Testing Library.
2. Implement the canonical triangle, edge interpolation, anchor resolution, segment helpers, reflection, and rotation as pure functions.
3. Implement pattern symmetry expansion with source/generated identity.
4. Implement `LayoutStrategy` and regular triangular-grid placements/local transforms.
5. Add unit tests for division coordinates, mirror, rotation, up/down mapping, grid placement, and render-ready SVG coordinates.

### Milestone 2 — interactive editor and preview (current)

1. Build responsive Settings controls for division count and symmetry/axis selection.
2. Build an SVG Cell Editor with large anchor hit targets, two-click segment creation, pending selection feedback, seed/generated visual distinction, and seed-segment deletion.
3. Build a separate Pattern Preview driven immediately by the same CellPattern through the triangular-grid strategy.
4. Verify desktop and mobile layouts and update README implementation status.

### Milestone 3 — remaining MVP controls and export (future)

1. Add preview-range and line-width controls.
2. Generate and download a valid SVG from the shared geometry, with configurable physical-size-ready metadata and duplicate-segment handling.
3. Add export-focused tests.

### Milestone 4 — delivery (future)

1. Add the GitHub Pages deployment workflow and production base-path configuration.
2. Run complete tests/build, perform final responsive UI verification, and update the Definition of Done status.

## 6. Validation

- Unit tests use numeric tolerance for floating-point geometry and cover every minimum test category from the specification.
- `npm test` must pass non-interactively.
- `npm run build` must complete with TypeScript checking and Vite bundling.
- UI verification checks segment creation/deletion, each symmetry mode, immediate preview updates, and responsive stacking.

## 7. Assumptions and constraints

- Division count is constrained to 2–12 for usable tap spacing; vertices remain separately selectable and division indices include only interior points.
- Degenerate segments (the same anchor selected twice) are rejected.
- Generated symmetry copies are display-only and cannot be selected or deleted independently; users edit the source segment.
- Coincident segments are retained during this milestone because deduplication belongs with the later SVG-export work.
- No intersection behavior, persistence, import/export, undo/redo, alternate layouts, or fabrication-specific settings are introduced.
