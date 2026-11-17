# Improvement plan — eco-retreat-3d

Repo: https://github.com/KieuNghia/eco-retreat-3d (snapshot of `main`, commit `946d23b18d92`, pushed 2026-10-07)
Everything below was verified against the actual source, not inferred from filenames. Line references point at this snapshot.

---

## 0. What is already solid (do not "fix" these)

- **Import is atomic and validated.** `Eco.modelState.prepare()` clones before validating (`model-state.js:150-156`); bounds, enums, colour format, ID length and count caps are real checks (`model-state.js:60-149`). `rebuild()` builds the new scene off-scene, publishes it, then disposes the old one, so a bad import keeps the live apartment (`app.js:43-57`).
- **Incremental furniture sync.** `shapeKey` reuse + `apartment.syncFurniture()` keeps wall/floor meshes alive across edits (`apartment-scene.js:198-233`).
- **Rotation-aware collisions.** SAT polygons with both items in the mover's local space, and the walk capsule test done in local axes (`collisions.js`).
- **Continuous wall surface.** Wall footprints are rasterised onto a ±0.01 m grid and merged into one convex polygon, then one mesh — no seams at corners, including thickness steps (`apartment-scene.js:121-170`).
- **Correct colour management for r160.** `outputColorSpace = SRGBColorSpace` (`renderer.js:9`), ACES tone mapping (`renderer.js:12-13`), pixel ratio clamped at 2 (`renderer.js:7`).
- **The committed 3.8 MB `Eco-Retreat.html` currently matches the sources exactly** (all 16 `.js` + 3 `.css` blocks byte-identical, sha256-confirmed). That must stay true — see P0 item 4.
- Some accessibility and touch effort already exists: `aria-pressed`, `aria-label`, `role="status"`, an on-screen d-pad (`index.html:24-49`, `style.css:264`).

So the plan is: unblock the toolchain, then performance, then persistence, then the two feature gaps, then docs/engine.

---

## P0 — Make the project possible to build or test at all
**Effort: S–M. This blocks everything else.**

The checks and the build **cannot run from a fresh clone**:

| Where | Problem |
| --- | --- |
| `work/package-v2.cjs:4` | `path.resolve("outputs/eco-retreat-v2")` — cwd-relative, and nothing ever creates that directory |
| `work/check-model.cjs:4` | `require("../outputs/eco-retreat-v2/vendor/three.min.js")` |
| `work/check-model.cjs:110,116,135` | reads `outputs/eco-retreat-v2/index.html`, `…/Eco-Retreat.html`, `…/<each .js>` |
| `work/check-camera.cjs:5,9` | same missing prefix |
| `work/audit-layout.cjs:1` | `fs.readFileSync('outputs/eco-retreat-v2/model.js')` |
| repo root | no `outputs/` directory exists; no script creates it |
| `ARCHITECTURE.md:38-44` | documented inside a `powershell` fence; line 43 is `Compress-Archive …` (Windows-only) |
| repo root | no `package.json`, no `.gitignore`, no `LICENSE`, no CI of any kind |

Consequence: the very first documented command, `node work/check-refactor.cjs` (`ARCHITECTURE.md:39`), dies with ENOENT. Also, even once staged, the checks read the **copy**, not the files you edit — a stale-copy hazard that can make tests pass against old code.

**Do:**
1. In all five scripts replace the hardcoded prefix with a script-relative root: `const SRC = path.resolve(__dirname, "..")`, and build every path from it.
2. Have `package-v2.cjs` write the artifact the repo actually ships: `path.join(SRC, "Eco-Retreat.html")`. If you still want a zip staging tree, add `work/stage.cjs` (recursive `mkdirSync`, copy `index.html`, `*.js`, `*.css`, `vendor/`, `reference.png`) and call it first.
3. Add `package.json` with **no dependencies** and scripts `build`, `test`, `check:bundle`; plus a `work/run-all.cjs` runner. State in the docs that Node is a prerequisite.
4. Add a **drift guard test**: regenerate the bundle in memory and assert it equals the committed `Eco-Retreat.html`. Cheapest way to keep the property verified today.
5. Harden the build: escape `</style` in the CSS branch (`package-v2.cjs:11-14` has the escape only for `<script`); widen the final guard to reject `@import`, `url(http…)` and absolute paths; assert the vendor script is at index 0 instead of assuming it (`check-model.cjs:131`).
6. Add `LICENSE` (MIT — the same licence three.js itself ships) and `.gitignore` for build output. Note this working copy has **no `.git`** because it was pulled as a snapshot; re-clone with git once it is installed so history and future pulls work.
7. Tidy the tree: `work/bedrooms-detail.png`, `su1-detail.png`, `su2-detail.png` (~4 MB) are scratch assets referenced by no script or page.

---

## P1 — Renderer cost and lighting quality
**Effort: M**

Default scene ≈ **270 draw calls** (35 items × ~6 primitives ≈ 210, 35 wall groups ≈ 40, 11 floors + slab, 8 label sprites, outline); ~500-600 after opening the editor, and the validator allows up to 500 furniture items (`model-state.js:79`) → several thousand.

1. **No sharing at all.** `geometry.box/cylinder/sphere` allocate a fresh `BoxGeometry`/`CylinderGeometry`/`SphereGeometry` **and** a fresh `MeshStandardMaterial` per primitive (`geometry.js:39-70`, `mat()` at `geometry.js:4-6`); `cylinder` hardcodes 24 radial segments, `sphere` a unit sphere scaled per mesh.
   → Cache unit geometry (`BoxGeometry(1,1,1)` + per-mesh scale; a small cache keyed by dimensions) and materials keyed by `color + roughness + extras`.
2. **Merge each item's boxes into one geometry.** `BufferGeometryUtils` is ESM-only and not in this UMD build, but you already use the exact technique in `closeWallJoints()` — boxes are axis-aligned in local space, so a ~30-line `mergeBoxes()` in `geometry.js` gives roughly one mesh per furniture item. Target: draw calls ≈ item count.
3. **Repeat items are rebuilt from scratch.** Five `side` tables with an identical `[type,w,d,h,color,basinShape]` tuple produce five independent mesh sets (`apartment-scene.js:204-215`). Share geometry/materials per `shapeKey` and dispose once.
4. **Shadow pass.** Every primitive sets `castShadow`/`receiveShadow` (`geometry.js:45-46,55-56,62-63`) and `shadowMap.autoUpdate` is left at its default `true` (`renderer.js:10-11`), so the 2048² map over a ±15 m ortho frustum is re-rendered every frame for a static scene. → `sun.shadow.autoUpdate = false` and bump `sun.shadow.needsUpdate` only on furniture/mode/`low` changes; drop `castShadow` for sub-15 cm primitives (legs, trims) and rugs.
5. **Glazing casts opaque shadows.** `addWall` sets `castShadow` on the glass box too (`apartment-scene.js:72-87`), so a 6 m window throws a hard shadow across the room's only daylight path — confirmed by `geometry.box` (`geometry.js:45-46`). → `gl.castShadow = false` for window/sliding/rail glass and furniture glass.
6. **No environment map.** Only hemi + key + fill (`renderer.js:23-43`); `metalness: 0.55` sinks (`kitchen-mesh.js:50-53`), appliances and glass have nothing to reflect. → build a tiny equirect gradient texture once and set `scene.environment` with modest `envMapIntensity`.
7. **Catalog previews block the UI.** `furnish.js:281-318` builds all 81 items, renders each, then `toDataURL()` per preview at 156×117 px for ~40 px tiles, into a second WebGL context created per open (`app.js:372-390`, `previews.js:7-17`). → render at ~2× display size, lazy per category, or one shared off-screen canvas reused across opens.
8. **Small correctness item:** label canvas textures never set `colorSpace`, so the `#3d4a55` labels and `#fdfbf6` plate render lighter than specified and are washed out against the pale floor (`apartment-scene.js:172-183`). → `map.colorSpace = THREE.SRGBColorSpace`.
9. **Throttle `furnish.refresh()`.** Every `pointermove` rebuilds the outline geometry, runs `new THREE.Box3().setFromObject()` over the whole item, and recomputes `warning()` across all walls + all furniture with fresh SAT polygons (`furnish.js:96-126`, `furnish.js:46-82`). → coalesce into one rAF tick; cache collider polygons for untouched items.

---

## P2 — Do not lose the user's work
**Effort: S–M. Highest user-facing value.**

There is **no persistence of any kind** — no `localStorage`, no autosave, no restore anywhere in the codebase (verified by grep). Saving is a manual JSON download (`app.js:350-359`), and `index.html:138-139` already warns: «Перед закрытием сохраните JSON. Изменения не сохраняются автоматически.» A refresh, a closed tab or a browser crash destroys a hand-made layout — the single worst failure mode of this editor.

1. Autosave `data` to `localStorage` (debounced, keyed by a schema version), restore on load with a visible notice, plus an explicit "reset to original layout".
2. Keep undo history through model-level edits: `app.js:338` calls `furnisher.reset()`, which wipes both stacks (`furnish.js:502-508`), so a ceiling or eye-height change silently discards the user's Undo.
3. Redo stack is uncapped while undo is capped at 60 (`furnish.js:41-44` vs `furnish.js:313`) → cap both, and store deltas instead of whole-array snapshots.
4. Timestamped export filenames; show last-saved time in the status bar.

---

## P3 — The two feature gaps
**Effort: L**

1. **Walls and openings are not editable.** The only geometry control scales everything proportionally — `applyDimensions` multiplies every wall, floor, label and spawn by `sx/sz` (`app.js:306-342`). The data model already supports per-wall `kind` and `thickness` (`model-state.js:90-94`); what's missing is a plan-view editor for segments: select, drag endpoints, set kind/thickness, validated, with undo. Add a `door` kind (today the README states doors are open with no leaves, `README.md:25`).
2. **JSON version 2 is a hard gate.** `model-state.js:69` rejects anything else with «нужен JSON модели версии 2», and only `model.js:27` emits version 2. Anyone holding an older export is blocked with no migration path. → a version registry with a `v1 → v2` migrator, plus a round-trip test (export → import → export identical).
3. **Rounding drift.** Drag snaps to 0.05 m (`furnish.js:299-301`) while the size/height inputs round to 3 decimals (`furnish.js:136`, `furnish.js:186-189`); alternating those paths accumulates drift. Store canonical rounded values and declare the precision.
4. **Snapping correctness (medium):** `Eco.snapFurniture` never considers walls or room bounds for its *candidate* target — it only backtracks to the original position when the candidate is blocked (`furniture-snap.js:36-44,73-84`), so against a wall 5 cm away you get nothing. The axis-parallel test `< 0.99` (`furniture-snap.js:54`) is ±8°, so the editor's 15° angle step (`index.html:106`) never snaps except at 90° multiples. Also two different default heights disagree: snap uses `h || 1` (`furniture-snap.js:29-30`), the placement warning uses `h || 5` (`furnish.js:74`). → export `penetration(a,b)` from `collisions.js`, relax the parallel test to `< 0.9`, align rotation to the target on snap, and share one `Eco.collisions.heightOf = (f) => f.h ?? 1`.
5. **Touch/mobile editing is close to unusable (high).** In the ≤800 px query `#furnishPanel` takes 245 px and `#viewport` is inset by 255 px (`furnish.css:104-115`): on a 390 px phone the 3D canvas is ~135 px wide, and the two-column catalog grid (`furnish.css:126-130`) sits in those same 245 px. `aside` is hidden (`furnish.css:116-118`) and the d-pad is walk-only (`style.css:264`) while furnishing forces orbit mode (`furnish.js:257`). Zoom exists only via wheel (`navigation.js:115-117`, called only from `app.js:207-214`) with `touch-action: none` (`style.css:22`) and no two-pointer handling; in plan mode `zoom()` is inert (`navigation.js:156-160`). Second-finger interference is real: `furnish.down()` guards `e.button !== 0` but touch reports button 0 (`furnish.js:303`), so another finger reassigns `selected`/`drag` mid-gesture, and `furnisher.up()` fires for any `pointerup` (`app.js:176-177`). → bottom-sheet panel (`height:42vh`, single-column catalog), store `pointerId` in `drag` and ignore non-matching events, add a two-pointer pinch feeding `navigation.zoom`, add a `lostpointercapture` fallback, and make plan mode zoomable.

---

## P4 — Tests and CI (builds on P0)
**Effort: M**

The five scripts in `work/` are real checks, and `ARCHITECTURE.md:48` honestly states `WebGLRenderer` and the DOM are replaced and this is not a pixel/GPU test. `check-model.cjs:2,8-38` builds a Proxy-based fake element and reassigns `THREE.WebGLRenderer` (`check-model.cjs:39-48`), `PathTraversingControls` (`:118-125`) and `SVGLoader` (`:126-133`).

Add cases for the seams that are currently uncovered:

- export → import → export round trip (the documented manual acceptance step 1 in `ARCHITECTURE.md:52` has no automated equivalent);
- snapping at 15°/45° and against a wall;
- undo/redo across add + delete + duplicate, and undo surviving `apply()`;
- `blocked()` past a rotated corner (`app.js:111-129`);
- the 500-item cap and `reference.png` inlining in the bundle;
- `applyDimensions` preserving clearances (`app.js:306-342`).

Then a GitHub Actions job on Ubuntu running `node work/run-all.cjs` — headless, no GPU needed. An optional real-browser smoke test must not break the double-click-`file://` promise.

---

## P5 — Docs, language, packaging
**Effort: M**

- All five docs and all UI strings are Russian, and the strings are literals scattered through the JS (`app.js:100-109`, `furnish.js:225,336-338`, `measure.js`, `model-state.js:62-148` error messages). Extract strings into one small `strings.js` so the interface can be switched; add an English README and keep `README.ru.md`.
- **The docs are stale on a count:** README.md:13 and ARCHITECTURE.md:14 say 79 catalog variants; `furnitureCatalog.length` is actually **81** — 83 entries exist, two (`sinkCornerBase`, `sinkStraightBase`) are consumed internally by `sinkCornerBase` and are unplaceable. Count in the docs, or hide the internal entries.
- `reference.png` is 2284 × 1162 px (~1.5 MP, 2.36 MB); README/ARCHITECTURE never mention its size or how the calibration was done. Document it.
- Add `CONTRIBUTING.md` with Linux commands (today's block is PowerShell), `CHANGELOG.md` + a tagged release containing the standalone HTML, and a **screenshot or GIF in the repo** — the project is visual, so a demo image is the highest-leverage addition for adoption.
- `README.md:21` and `ARCHITECTURE.md:59` already carry the accuracy caveats in fine print; surface them once at the top and in the app's status line.

---

## P6 — The vendored engine is a pinned dead end (decide, don't rush)
**Effort: S**

`vendor/three.min.js` is **r160 (December 2023)** — `REVISION="160"` — the UMD build three itself stopped shipping (its first line warns these builds are "removed with r160", and r161 onward ship ESM only). Current upstream is 0.187.0 (October 2026), ~27 releases ahead. The vendored copy has **no license file, no sha256, no provenance note** anywhere in the repo.

Options, with the tradeoff stated honestly:

| Option | Consequence |
| --- | --- |
| **Stay on r160 (recommended)** | Keeps the double-click `file://` promise. Requires recording exact version + checksum + MIT attribution in `ARCHITECTURE.md`. Everything needed in P1 (InstancedMesh, batching, shadow autoUpdate control) already exists in r160. |
| Switch to a modern ESM build | `<script type="module">` is blocked over `file://` by Chrome's CORS rules, so the standalone no longer opens by double-click — the project's main selling point dies unless a local server becomes mandatory. |
| Bundle a modern build into the standalone HTML | Works, but adds a real bundler step and a build dependency. |

Revisit only if a feature genuinely needs a newer release.

---

## Small PRs worth folding in

- Replace the hand-rolled wall polygon in `furnish.js:52-66` with `Eco.collisions.wall()` — done correctly in `furniture-snap.js:39` already.
- Accept `-0` in JSON: `validate()` rejects it at `model-state.js:120` (`!number(-0, -100000, 100000)` is false) even though the editor writes `-0` via `parseFloat((-540).toFixed(3))` (`furnish.js:142`) — a real round-trip failure after rotating a table by 90°.
- `Cmd+Z` / `Ctrl+Shift+Z` on macOS: `furnish.js:484-485` only tests `ctrlKey` + `KeyZ`/`KeyY`.
- Guard `selected` against a data index that no longer exists — `furnish.js:39` indexes `getData().furniture[selected]` with no length check, and `refresh()` reads `children[selected]` (`furnish.js:91`); if the two ever diverge the panel throws.
- Avoid assigning three's internals: `apartment-scene.js:232` writes `furniture.children = ordered` directly.
- Add `aria-live` to the status bar (changes are currently announced visually only).
- Escape key closes the furniture editor but is never listed in the editor hint (`index.html:73`, `furnish.js:466-471`).
- `app.js:391` grabs `const tapeToggle = $("tape").onclick` before wrapping it — fragile coupling to the order of assignments in `measure.js`.
- Dead code: `wallColliders` is built and exported (`apartment-scene.js:11,22-24,117-118,281`) but never read — `blocked()` recomputes fresh polygons per call (`app.js:111-129`). Delete it or use it.
- Unused parameter in `snapFurniture`'s signature and its single call site (`furniture-snap.js:5`, `furnish.js:299`).

---

## Sequence

| Order | Workstream | Effort | Payoff |
| --- | --- | --- | --- |
| 1 | **P0** retarget scripts, `package.json`, `.gitignore`, LICENSE, bundle drift guard | S–M | Every later change becomes verifiable |
| 2 | **P1** geometry/material sharing, merged item meshes, shadow control, glazing shadows | M | Frame rate; big layouts usable; better light |
| 3 | **P2** autosave/restore, undo survives model edits | S–M | Removes the main way users lose work |
| 4 | **P4** extra checks + CI on Linux | M | Regressions caught automatically |
| 5 | **P3** wall/opening editor, JSON migration, touch layout, snap fixes | L | Turns a reconstruction into an adjustable model |
| 6 | **P5** i18n, English README, CONTRIBUTING, release + demo GIF | M | Outside contributors and users |
| 7 | **P6** pin documented with checksum and licence | S | No surprise engine dead end |

**Environment note:** `git` 2.53.0 is installed, and Node v22.14.0 was installed user-local at `~/.local/node` (no administrator password needed; run `export PATH=~/.local/node/bin:$PATH` before `npm`). P0–P2 have been built and tested here (P2 adds `autosave.js`, delta-based undo and a `localStorage` stub in the headless sandbox); `npm run build` must be rerun after any source edit so `npm run check:bundle` stays green.
