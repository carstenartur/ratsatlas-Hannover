# Ratsatlas Hannover Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Independent file ownership enables parallel data and interface work.

**Goal:** Transfer the complete Hannover RIS snapshot and make it usable in a dedicated Ratsatlas.

**Architecture:** Static application, verified immutable source partitions, generated search/map projections, browser worker search and on-demand detail loading.

**Tech Stack:** Python standard library, vanilla JavaScript modules, Leaflet, existing Ratsatlas CSS tokens and local Inter font.

**Spec:** `docs/superpowers/specs/2026-11-21-hannover-import-design.md`

## Global Constraints

- All source-qualified IDs, source dates and evidence remain intact.
- No invented geometries; unlocated records remain searchable.
- Browser works under a repository subpath and on 390px/820px screens.
- No API keys, no tracking, no automatic third-party messages.
- Keep source licenses and credit Damian Paderta/Ratsatlas and Unfallwerkbank.

## Review Focus

- Corrupt/missing assets must not replace a previously valid snapshot.
- Same document number from different source levels must remain separate.
- An old source snapshot must remain usable with honest date/coverage labels.
- Search and selection must remain correct after rapid changes and history navigation.
- Layer selection, filtering and record links must round-trip in shared URLs.

### Task 1: Complete and reproducible import

**Files:** `scripts/import_unfallwerkbank.py`, `tests/test_import_unfallwerkbank.py`, `site/data/ris/**`.

**Interfaces:** Preserve schema-v2 source trees; generate projections defined in spec and migration metadata with hashes and counts.

- [x] Write/run failing tests for corruption, missing child, path escape, duplicate IDs and unlocated preservation.
- [x] Implement source URL/local directory import, bounded verified traversal, staged publication and offline check.
- [x] Import actual published snapshot and verify counts, source levels and hashes offline.

### Task 2: Responsive city application

**Files:** `site/index.html`, `site/app.css`, `site/app.js`, `site/view-state.js`, `tests/view-state.test.mjs`.

**Interfaces:** Consume `AtlasData` from `site/data.js` per spec. Leaflet locally in `site/vendor/leaflet/`.

- [x] Pin URL-state behavior with tests (source filters, search, years, map, record, back navigation).
- [x] Build search/list/map/detail interface, factual source state and mobile layout.
- [x] Show original links, location evidence and chronology without inferring decisions.

### Task 3: Verified browser data access

**Files:** `site/data.js`, `site/search-worker.js`, `site/search.js`, `tests/data.test.mjs`, `tests/search.test.mjs`, vendor assets/licenses.

**Interfaces:** Public API fixed in spec; worker returns paginated results and year counts over complete search projection.

- [x] Test search normalization, combined filters, source-separated IDs and damaged partition rejection.
- [x] Implement verified gzip loader, limited cache, tree lookup, complete detail pages and worker search.
- [x] Run actual-source integration tests on records from all three levels and mapped/unmapped cases.

### Task 4: Delivery and verification

**Files:** workflows, README, TECHNIK, privacy/404/manifest, QA evidence.

- [x] Replace upstream-specific deployment/metadata with repository-local checks and Pages deployment.
- [x] Document actual data status, repeatable import, use cases, credits and limitations.
- [x] Run complete offline tests and desktop/mobile browser checks with screenshots.
- [x] Review the complete diff, address material findings, commit and open a focused PR.
- [x] Verify remote CI and report the precise delivered state and any deployment limitation.

## Verification recorded before remote CI

- All 17 JavaScript tests passed, including integration against the actual full dataset.
- All 19 Python tests passed, including split-archive integrity and atomic publication.
- Reconstructing from four parts restored all 6,909 browser files byte-for-byte.
- Independent review findings on rapid filters, stale popups, map clicks and original IDs are fixed.
- Browser execution is delegated to GitHub Actions because this workspace cannot launch Chromium.

## Browser verification

- CI run 44876266802 passed on fcb9446fb251a9826dc769f4a087f2eaf6ec7a12.
- The Chromium-only native-fetch receiver issue was reproduced, fixed and protected by the 18th JavaScript test.
- All browser scenarios passed without page errors, console errors or failed requests; all seven screenshots were visually reviewed.
- GitHub Pages is configured to use GitHub Actions; live deployment follows merge.
- See `docs/QA.md` for preserved evidence.
