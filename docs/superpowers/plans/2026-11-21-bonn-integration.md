# Bonn integration implementation plan

> **For agentic workers:** Use the executing-plans workflow with independently
> scoped workers and an independent whole-branch review. Track completion here.

**Goal:** Replace the divergent Hannover UI with the useful Bonn application
components in the existing fork, preserving the verified Hannover dataset.

**Architecture:** Reuse Bonn's CSS, panel structure/behavior and Timeline module.
Keep AtlasData and its verified store, add a histogram/date adapter, and connect
the Bonn components through Hannover application glue. Remove the old app CSS.

**Tech Stack:** Static HTML/CSS/JavaScript modules, local Leaflet, Python import,
Node tests, Playwright browser verification, existing GitHub Pages workflow.

**Spec:** `docs/superpowers/specs/2026-11-21-bonn-integration.md`

## Global Constraints

- Existing repository; no replacement fork or destructive history rewrite.
- Preserve all 109605 records, 101601 unlocated records and 3395 geometries.
- Preserve source-qualified IDs, original evidence and source dates.
- Use actual Bonn UI code, not a newly styled version of the old card layout.
- No Bonn-only rules/data/links presented as Hannover facts.
- One visible content sheet on mobile, real-data browser and visual QA.
- Preserve legacy share links and complete the new URL state.

## Review Focus

- Same document number across different sources must stay distinct.
- Undated and post-source-check-date records must not vanish on timeline reset.
- Rapid search/filter changes and related-record requests must remain ordered.
- Mobile dialogs, timeline and resizers must not trap focus or cover controls.
- Original non-point geometries, evidence and hyperlinks must survive selection.

## Task 1: Bonn timeline and search/state adapter

Owner: data worker. Files: `site/timeline.js`, `site/timeline-adapter.js`,
`site/search.js`, `site/view-state.js`, related unit tests only.

Interface:

- `SearchIndex.search` adds ISO `dateFrom/dateTo`, retaining year filters, and
  returns `timeline` counts before date filtering (months, daily, source
  categories, undatedCount, dataStart, dataEnd).
- `createHannoverTimeline(element,{onRange,onReset})` exposes
  `update(result,{state,manifest})`, `select(detail|null)`, `setState(state)`,
  `center(date)`, `reset()`, `getState()`. `update/setState` are silent;
  user changes invoke callbacks. `onRange(a,b)` carries ISO calendar days;
  `onReset()` removes date/year filters and includes undated records.
- View state adds `dateFrom/dateTo`, `timelineZoom` and `panels` (keys
  `list/detail/timeline`). `von/bis` accept old years or ISO days, output
  prefers explicit ISO dates. `fenster` serializes the panel list, including
  the empty list. Default panels are `['detail']`; legacy fields remain.
  `timelineZoom` uses `zeitzoom`; default `Jahr`.

- [ ] Write failing tests for aggregate/date/undated/source and URL behavior.
- [ ] Copy and narrowly adapt the real Bonn Timeline module, with provenance.
- [ ] Implement adapter and search/state additions; run full JS tests.
- [ ] Record tests and source changes in `.superpowers/bonn-integration/task1.md`.

## Task 2: Replace the UI with Bonn components

Owner: UI worker. Files: `site/index.html`, `site/style.css`,
`site/hannover.css`, `site/bonn-panels.js`, `site/app.js`; delete `site/app.css`.
Do not modify data/search/state/timeline files owned by Task 1.

Interfaces: existing `AtlasData` plus Task 1 interface above. Source files:
`/workspace/scratch/97bbb28d4a6a/bonn-upstream-f8850008/site/`.

- [ ] Preserve actual Bonn nav/map/panel/list/detail structure, CSS, focus,
  resize and one-sheet mobile behavior; document extraction boundaries.
- [ ] Connect full Hannover search, original GeoJSON, detail evidence/events,
  related records, source status, share dialog and navigation history.
- [ ] Integrate actual Timeline adapter; no nonfunctional Bonn menus.
- [ ] Remove old card-layout app CSS and runtime references.
- [ ] Verify JavaScript syntax and start the browser smoke flow as available.
- [ ] Record source extraction and any constraints in
  `.superpowers/bonn-integration/task2.md`.

## Task 3: Integration verification, attribution and publication

Owner: root. Files: `scripts/browser_smoke.mjs`, workflow/package where needed,
`README.md`, `TECHNIK.md`, `NOTICE.md`, `docs/UPSTREAM.md`, `docs/QA.md`, QA images.

- [x] Isolated branch and clean baseline: 18 JS / 19 Python tests pass.
- [ ] Update real-data browser smoke before UI verification. Exercise map,
  timeline filtering/reset, all source counts, source ID collision, linked
  request/answer, street evidence, old/new URLs and mobile single-sheet state.
- [ ] Verify current source/UI code and snapshot unchanged; visually inspect
  desktop, tablet, phone and available WebKit screenshots.
- [ ] Record upstream commit, copied/derived files, licences and refresh steps.
- [ ] Obtain independent whole-branch code and screenshot review; fix findings.
- [ ] Commit/publish PR, verify exact-head CI, integrate and verify live site.
