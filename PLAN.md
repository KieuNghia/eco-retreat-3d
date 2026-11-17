# Improvement plan — eco-retreat-3d

Repo: https://github.com/KieuNghia/eco-retreat-3d (branch `main`, HEAD `efedf57`, pushed 2026-11-18)
Everything below was verified against the actual source, not inferred from filenames. Line references point at this checkout and were re-checked on 2026-11-18 (macOS, git 2.50.1, Node v24.11.0); `npm test` and `npm run check:bundle` pass.

**Status legend:** ✅ done · ⬜ open · ✖ dropped (the claim was wrong, do not "fix" it)

---

## 0. What is already solid (do not "fix" these)

- **Import is atomic and validated.** `modelState.prepare()` clones before validating (`model-state.js:150-152`); bounds, enums, colour format, ID length and the 500-object caps are real checks (`model-state.js:60-149`). `rebuild()` builds the new scene off-scene, publishes it, then disposes the old one, so a bad import keeps the live apartment (`app.js:45-55`).
- **Incremental furniture sync.** `shapeKey` reuse + `apartment.syncFurniture()` keeps wall/floor meshes alive across edits (`apartment-scene.js:20-23`, `201-214`).
- **Rotation-aware collisions.** SAT polygons with both items in the mover's local space, and the walk capsule test done in local axes (`collisions.js:4-49`); the walker test is `circleIntersects`, not a world AABB.
- **Continuous wall surface.** Wall footprints are rasterised onto a ±0.01 m grid and merged into one convex polygon, then one mesh — no seams at corners, including thickness steps (`apartment-scene.js:123-172`).
- **Correct colour management for r160.** `outputColorSpace = SRGBColorSpace` (`renderer.js:9`), ACES tone mapping (`renderer.js:16-17`), pixel ratio clamped at 2 (`renderer.js:7`).
- **Shared, ref-counted resources.** Geometry, materials, textures and merged item geometries are cached with reference counts, so a rebuild disposes only the last user (`geometry.js:10-60`, caches at `105-113`, `178-190`).
- **Static shadow map + sky environment.** `shadowMap.autoUpdate = false` with an explicit `needsUpdate` bump on real changes (`renderer.js:13-15`, `shadowsDirty()` threaded through `app.js`), and a 256×128 canvas equirect gradient as `scene.environment` (`renderer.js:22-38`).
- **The model survives a reload.** `autosave.js` writes a debounced, schema-versioned `localStorage` entry (`KEY = "eco-retreat.model.v2"`, `autosave.js:8`), flushes on `pagehide`, restores on startup with a visible notice (`app.js:17`, `446-451`) and drops a corrupt entry instead of blocking startup.
- **The committed 3.97 MB `Eco-Retreat.html` currently matches the sources exactly** (`npm run check:bundle`). That must stay true — rerun `npm run build` after any source edit.
- Accessibility and touch effort already exists: `aria-pressed`, `aria-label`, `role="status"` live regions (`index.html:38`, `82`, `133`), an on-screen d-pad (`index.html:47`, `style.css:252-264`).

So what is left: performance follow-ups, the two feature gaps, tests/CI, docs/engine provenance.

---

## P1 ⬜ Renderer follow-ups
**Effort: S. The heavy lifting landed in `d4f1acf`; these are the leftovers.**

1. ⬜ **Draw-call audit.** Items merge into one mesh via `mergeBoxes()` (`geometry.js:205-285`, called at `furniture-mesh.js:400-401`), so the default scene is well under 270 calls today. Re-measure with a large layout (the validator allows 500 items, `model-state.js:79`) before adding InstancedMesh — do not optimise on the old numbers.
2. ⬜ **Sub-15 cm primitives inside a merged mesh.** `merged.castShadow = parts.some(p => p.castShadow)` (`geometry.js:279-280`), so legs and trims cast with the body they are merged into. The old per-primitive carve-out is moot; decide per item type (rugs, thin trims) instead.
3. ⬜ **`shadowsDirty()` coverage.** Confirm every path that changes geometry or mode bumps `needsUpdate` — a missed path shows as a stale shadow, not a crash.
4. ⬜ **Preview resolution.** Previews now reuse one off-screen context and render lazily per category (`previews.js:3-26`, `furnish.js:32-56`, 260×180 at pixel ratio 1). Check the thumbnails against ~40 px tiles; raise only if they read soft.
5. ⬜ **Metal reflection.** The gradient env map is generic and `envMapIntensity` is pinned at 0.35 for every material (`geometry.js:101`); the metalness 0.55 finishes (`furniture-mesh.js:117`) still read flat. Only worth a real HDR if someone complains.

---

## P2 ✅ Do not lose the user's work
**Done in `efedf57`.**

- Autosave/restore with a versioned key, debounce, `pagehide` flush, corrupt-entry recovery, and a "reset to original layout" that keeps history (`app.js` `#resetLayout`).
- Undo no longer wipes on model-level edits: `apply()` snapshots the outgoing model and pushes a `"model"` entry rather than calling `furnisher.reset()`, and only a successful rebuild enters history (`app.js:320-328`); undo of that entry rebuilds without recording another one (`app.js:424-425`, `perform()` at `furnish.js:513`).
- History is inverse-operation deltas, both stacks capped at 60 (`furnish.js:88-96`).
- Export filenames carry a timestamp (`autosave.js:77`, `app.js:387`) and a manual save also records a checkpoint (`app.js:397`); the last saved time is shown in the footer (`index.html:44`).

Remaining polish only: ⬜ a visible "restored from autosave" banner that is dismissible rather than a footer line.

---

## P3 ⬜ The two feature gaps
**Effort: L**

1. ⬜ **Walls and openings are not editable.** The only geometry control scales everything proportionally — `applyDimensions` multiplies every wall, floor, label and spawn by `sx/sz` (`app.js:347-366`). The data model already supports per-wall `kind` and `thickness` (`model-state.js:90-94`); what's missing is a plan-view editor for segments: select, drag endpoints, set kind/thickness, validated, with undo. Add a `door` kind (today the enum is `wall/window/sliding/rail`, `model-state.js:91`, and the README states doors are open with no leaves).
2. ⬜ **JSON version 2 is a hard gate.** `model-state.js:69` rejects anything else with «нужен JSON модели версии 2», and only `model.js` emits version 2. Anyone holding an older export is blocked with no migration path → a version registry with a `v1 → v2` migrator, plus a round-trip test (export → import → export identical).
3. ⬜ **Rounding drift.** Drag snaps to 0.05 m (`furnish.js:358`) while field write-back rounds to 3 decimals (`furnish.js:206`); alternating those paths accumulates drift. Store canonical rounded values and declare the precision.
4. ✅ **Snapping correctness (medium).** `snapFurniture` never considered walls or room bounds for its *candidate* target — `clear()` only validated a candidate against walls and other furniture (`furniture-snap.js:33-43`), so against a wall 5 cm away you got nothing. The axis-parallel test `< 0.99` (`furniture-snap.js:54`) was ±8°, so the editor's 15° angle step (`index.html:108`) never snapped except at 90° multiples. Blocked candidates just backtracked to the original position (`furniture-snap.js:74-82`, `88`). Two default heights disagreed: snap used `h || 1` (`furniture-snap.js:29`), the placement warning `h || 5` (`furnish.js:143`). → done: `penetration(a,b)` and `heightOf` are exported from `collisions.js`, walls and room bounds are snap targets, the parallel test is `< 0.9`, rotation is aligned to the target axis, `warning()` uses `wall()`/`heightOf`.
5. ⬜ **Touch/mobile editing is close to unusable (high).** In the ≤800 px query `#furnishPanel` takes 245 px and `#viewport` is inset by 255 px (`furnish.css:104-123`): on a 390 px phone the canvas is ~135 px wide, and the two-column catalog grid (`furnish.css:127`) sits inside those same 245 px. `aside` is hidden (`furnish.css:116`), the d-pad is walk-only (`style.css:264`) while furnishing forces orbit mode. Zoom exists only via wheel (`navigation.js:115-117`, called from `app.js:232-235`) and `zoom()` only changes `distance`, which the plan branch never reads (`navigation.js:159-162`); `touch-action: none` and no two-pointer handling. Second-finger interference is real: `down()` guards `e.button !== 0` but touch reports button 0 (`furnish.js:360-366`). → bottom-sheet panel (`height:42vh`, single-column catalog), store `pointerId` in `drag` and ignore non-matching events, add a two-pointer pinch feeding `navigation.zoom`, add a `lostpointercapture` fallback, and make plan mode zoomable.

---

## P4 ✅ Tests and CI
**Effort: M. Builds on the now-working P0 toolchain.**

The five scripts in `work/` are real checks, and `ARCHITECTURE.md` honestly states `WebGLRenderer` and the DOM are replaced and this is not a pixel/GPU test. `check-model.cjs` builds a Proxy-based fake element and replaces `THREE.WebGLRenderer` with an instrumented one; the bundle branch asserts the vendor script is index 0 (`work/check-model.cjs:155-172`) and runs every bundled script through the same sandbox.

The seams that were uncovered are now covered in `work/check-model.cjs`:

- ✅ export → import → export round trip — the downloaded blob is captured and re-imported, and the byte-identical result is asserted (plus negative-zero coordinates, which `JSON.stringify` normalises to `0`);
- ✅ snapping at 15° (joins and squares) and at 30°/45° (left free), and against a wall and a room edge;
- ✅ undo/redo across add + patch + duplicate + delete + rotate interleaved with a model-level resize — six undos rewind, six redos replay;
- ✅ `blocked()` past a rotated corner: a walker stops on the corner that juts into its lane and passes freely beside it, so neither an undersized nor an oversized box test passes;
- ✅ the 500-item and 200-wall caps, the 1 MB file guard and the version-2 gate — all refused before the scene is rebuilt, leaving the live model intact;
- ✅ `reference.png` inlining — the bundle loads nothing outside itself and carries the drawing byte-identical, while `index.html` keeps the separate file;
- ✅ `applyDimensions` preserving clearances — no wall crossing and no item outside the envelope at 9×7, 12×7, 9×10, 12×10, and an aspect-preserving resize scales existing overlaps exactly.

GitHub Actions runs `npm test` on Ubuntu across Node 18/20/22 (`.github/workflows/test.yml`) — headless, no GPU needed, and it includes the bundle drift guard. An optional real-browser smoke test must not break the double-click-`file://` promise.

---

## P5 ⬜ Docs, language, packaging
**Effort: M**

- **The docs are stale on a count.** `README.md:13` and `FURNITURE.md:18` say **79** catalog variants; `window.furnitureCatalog.length` is **81** (verified by loading `furniture-catalog.js` in Node). `ARCHITECTURE.md:14` and `README.md:31` already say 81. Fix the two stale numbers, or state which subset the editor exposes.
- All five docs and all UI strings are Russian, and the strings are literals scattered through the JS (`app.js`, `furnish.js`, `measure.js`, `model-state.js:62-148` error messages). Extract strings into one small `strings.js` so the interface can be switched; add an English README and keep `README.ru.md`.
- `reference.png` is 2284 × 1162 px (~2.36 MB) and is inlined into the bundle; the docs never mention its size or how the calibration was done. Document it.
- Add `CONTRIBUTING.md` (plain `npm test` / `npm run build` / `npm run check:bundle` on Linux and macOS), `CHANGELOG.md` + a tagged release containing the standalone HTML, and a **screenshot or GIF in the repo** — the project is visual, so a demo image is the highest-leverage addition for adoption.
- `README.md` and `ARCHITECTURE.md` already carry the accuracy caveats in fine print; surface them once at the top and in the app's status line.

---

## P6 ⬜ The vendored engine is a pinned dead end (decide, don't rush)
**Effort: S**

`vendor/three.min.js` is **r160 (December 2023)** — the UMD build three itself stopped shipping (its first line warns these builds are "removed with r160", and r161 onward ship ESM only). Current upstream is 0.187.0 (October 2026). The vendored copy has **no checksum, no provenance note and no separate attribution** anywhere in the repo; the root `LICENSE` is MIT for the project only.

| Option | Consequence |
| --- | --- |
| **Stay on r160 (recommended)** | Keeps the double-click `file://` promise. Requires recording exact version + sha256 + three.js MIT attribution in `ARCHITECTURE.md`. Everything needed in P1 (InstancedMesh, batching, shadow `autoUpdate`) already exists in r160. |
| Switch to a modern ESM build | `<script type="module">` is blocked over `file://` by Chrome's CORS rules, so the standalone no longer opens by double-click — the project's main selling point dies unless a local server becomes mandatory. |
| Bundle a modern build into the standalone HTML | Works, but adds a real bundler step and a build dependency. |

Revisit only if a feature genuinely needs a newer release.

---

## Small PRs worth folding in

- ⬜ Replace the hand-rolled wall polygon in `warning()` (`furnish.js:121-134`) with `Eco.collisions.wall()` — `furniture-snap.js:39` already uses it correctly.
- ⬜ `Cmd+Z` / `Ctrl+Shift+Z` on macOS: `furnish.js:597-598` only tests `ctrlKey` + `KeyZ`/`KeyY`, so macOS users get no undo shortcut.
- ⬜ Guard `selected` against a data index that no longer exists — `current = () => getData().furniture[selected]` (`furnish.js:87`) has no length check and `refresh()` reads `getFurniture().children[selected]` (`furnish.js:160`); if the two ever diverge the panel throws.
- ⬜ Avoid assigning three's internals: `apartment-scene.js:235` writes `furniture.children = ordered` directly.
- ⬜ Escape closes the furniture editor (`furnish.js:587`) but is never listed in the editor hint (`index.html:41`).
- ⬜ `app.js:434` grabs `const tapeToggle = $("tape").onclick` before wrapping it — fragile coupling to the assignment order in `measure.js:108`.

## ✖ Dropped claims (verified false in this checkout — do not re-add)

- **"Import rejects `-0`."** `validate()` uses `Number.isFinite(v) && v >= min && v <= max` (`model-state.js:66`), and `Number.isFinite(-0)` is `true`, so a rotated table exporting `-0` imports fine. There is no round-trip failure here.
- **"`wallColliders` is dead code."** It is read by `blocked()` (`app.js:139`); built at `apartment-scene.js:23` and `120`.
- **"Unused parameter in `snapFurniture`."** `excludeIndex` is declared (`furniture-snap.js:5`) and passed at the only call site (`furnish.js:226`).
- **"No `aria-live`."** `role="status"` is already an implicit live region (`index.html:38`, `82`, `133`).
- **"The repo has no `.git`."** Only true of the old snapshot pull; a plain `git clone` now gives full history.
- **"Scratch images `work/*.png` (~4 MB) sit in the tree"** and **"build commands are documented in a PowerShell fence"** — both already fixed (`work/` holds only scripts, `work/*.png` is gitignored, `ARCHITECTURE.md:36-55` is plain Node + `tar`).
- **"83 catalog entries, two unplaceable `sinkCornerBase`/`sinkStraightBase`"** — those names no longer exist in the source; the catalog is 81 entries.

---

## Sequence

| Order | Workstream | Effort | Payoff |
| --- | --- | --- | --- |
| 1 | ✅ **P3.4** snap fixes (`penetration()`, wall candidates, `< 0.9`, shared `heightOf`) | S | Smallest, most visible correctness win |
| 2 | ✅ **P4** round-trip + snap tests, CI on Linux | M | Safety net before the larger P3 work |
| 3 | **P3.5** touch layout (bottom sheet, pinch, `pointerId`) | M | Editor becomes usable on a phone |
| 4 | **P3.1/3.2** wall editor + JSON migration | L | Turns a reconstruction into an adjustable model |
| 5 | **Small PRs** + **P1** follow-ups | S | Polish, no new architecture |
| 6 | **P5** catalog count fix, i18n, CONTRIBUTING, release + demo GIF | M | Outside contributors and users |
| 7 | **P6** pin documented with checksum and licence | S | No surprise engine dead end |

**Environment note:** verified on macOS with git 2.50.1 and Node v24.11.0 — no dependencies to install, `npm test` runs the five checks plus the bundle drift guard. `npm run build` must be rerun after any source edit so `npm run check:bundle` stays green.
