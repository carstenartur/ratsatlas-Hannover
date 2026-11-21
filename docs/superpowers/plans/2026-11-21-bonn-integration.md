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
- `createHannoverTimeline(element,{onRange,onReset,onStateChange})` exposes
  `update(result,{state,manifest})`, `select(detail|null)`, `setState(state)`,
  `center(date)`, `reset()`, `getState()`, `setStatus(message,busy)`. `update/setState` are silent;
  user changes invoke callbacks. `onRange(a,b)` carries ISO calendar days;
  `onReset()` removes date/year filters and includes undated records.
- View state adds `dateFrom/dateTo`, `timelineZoom`, `timelineCenter` and `panels` (keys
  `list/detail/timeline`). `von/bis` accept old years or ISO days, output
  prefers explicit ISO dates. `fenster` serializes the panel list, including
  the empty list. Default panels are `['detail']`; legacy fields remain.
  `timelineZoom` uses `zeitzoom`; default `Jahr`. `timelineCenter` uses `zeitmitte`.

- [x] Write failing tests for aggregate/date/undated/source and URL behavior.
- [x] Copy and narrowly adapt the real Bonn Timeline module, with provenance.
- [x] Implement adapter and search/state additions; run full JS tests.
- [x] Record tests and source changes in `.superpowers/bonn-integration/task1.md`.

## Task 2: Replace the UI with Bonn components

Owner: UI worker. Files: `site/index.html`, `site/style.css`,
`site/hannover.css`, `site/bonn-panels.js`, `site/app.js`; delete `site/app.css`.
Do not modify data/search/state/timeline files owned by Task 1.

Interfaces: existing `AtlasData` plus Task 1 interface above. Source files:
[`site/` at the pinned Bonn commit](https://github.com/daimpad/ratsatlas-bonn/tree/f8850008e81825ae79be49ca7f3441b928a1858b/site).

- [x] Preserve actual Bonn nav/map/panel/list/detail structure, CSS, focus,
  resize and one-sheet mobile behavior; document extraction boundaries.
- [x] Connect full Hannover search, original GeoJSON, detail evidence/events,
  related records, source status, share dialog and navigation history.
- [x] Integrate actual Timeline adapter; no nonfunctional Bonn menus.
- [x] Remove old card-layout app CSS and runtime references.
- [x] Verify JavaScript syntax and start the browser smoke flow as available.
- [x] Record source extraction and any constraints in
  `.superpowers/bonn-integration/task2.md`.

## Task 3: Integration verification, attribution and publication

Owner: root. Files: `scripts/browser_smoke.mjs`, workflow/package where needed,
`README.md`, `TECHNIK.md`, `NOTICE.md`, `docs/UPSTREAM.md`, `docs/QA.md`, QA images.

- [x] Isolated branch and clean baseline: 18 JS / 19 Python tests pass.
- [x] Update real-data browser smoke before UI verification. Exercise map,
  timeline filtering/reset, all source counts, source ID collision, linked
  request/answer, street evidence, old/new URLs and mobile single-sheet state.
- [x] Verify source package and derived data unchanged from the imported baseline.
- [x] Visually inspect the new UI on desktop, tablet, phone and WebKit screenshots.
- [x] Record upstream commit, copied/derived files, licences and refresh steps.
- [x] Obtain independent whole-branch code review and fix its six important findings.
- [x] Obtain independent screenshot review and fix material visual findings.
- [x] Publish [PR #2](https://github.com/carstenartur/ratsatlas-Hannover/pull/2).
- [x] Verify code-head CI: [run 44885374971](https://github.com/carstenartur/ratsatlas-Hannover/actions/runs/44885374971).

This checklist records the implementation and QA snapshot before merge.
Final documentation-head CI, merge, deployment and live verification are
recorded in [PR #2](https://github.com/carstenartur/ratsatlas-Hannover/pull/2).

## Verification record — 21 November 2026

The baseline had 18 JavaScript tests. The completed adapters and review fixes
have 34 JavaScript tests; all 19 Python import tests and the complete data
integrity check passed. The independent review found six interaction defects.
Two date-bound tests failed before the logical-range fix. The first browser
run reproduced the remaining five defects in Chromium and WebKit; the next
run confirmed all five fixes. The geometry acceptance test was corrected to
open the collapsed provenance disclosure before reading its visible text.
Final Chromium and WebKit runs pass 13 acceptance points and five regression
cases each, with zero runtime/network errors. All 22 stable screenshots were
visually reviewed; ten mobile/tablet/source views received an independent
visual review. Final evidence is recorded in [QA.md](../../QA.md).
