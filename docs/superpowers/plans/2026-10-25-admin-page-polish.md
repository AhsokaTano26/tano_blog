# Admin Page Polish Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to execute inline; one fresh review at the end.

**Goal:** Make every admin route coherent, readable in both themes, accessible and usable on small screens.

**Architecture:** Extend existing semantic admin CSS and controls. Share a small presentational page header, keep page state and mutation handlers in place, use explicit table/tab wrappers, and unify authentication surfaces.

**Tech Stack:** Existing Next.js 16, React 19, TypeScript, Tailwind 4, Radix controls, JSDOM and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-admin-page-polish-design.md`

## Constraints and review focus

- No frontend redesign outside `/admin`, dependencies, production data, commit, push or visible browser interaction.
- Preserve privacy/read-only gates, draft protection, custom controls and entry animation.
- Long titles/actions must wrap at 320px; real tables may scroll inside named containers.
- Dark and light states must use semantic colors, including selected, hover and disabled controls.
- Settings, media and editor interaction state must survive shell rerenders.
- Every authentication input needs a persistent accessible name; icon actions need labels.

## Tasks

### 1. Shared structure and navigation

- [x] Create `frontend/src/components/AdminPageHeader.tsx`; migrate all 20 authenticated pages without changing their actions.
- [x] Update `frontend/src/app/admin/layout.tsx` with skip link, content target and route context; retain DOM identity in existing motion tests.
- [x] Validate navigation and header behavior through `npm test` watchdog.

### 2. Page details and theme-aware responsive surfaces

- [x] Extend `frontend/src/app/admin/admin.css` with scoped tokens, table wrappers, tabs, action rows, focus/touch states and responsive spacing.
- [x] Add explicit table/tab classes across admin pages; repair calendar, notifications, inline forms, settings actions and help navigation.
- [x] Unify login/forgot/reset surfaces and field labels; verify submission behavior still works.

### 3. Verification and revision

- [x] Inspect all routes in an isolated headless browser using deterministic synthetic API fixtures; stop verification services afterward.
- [x] Patch the weakest three layout/UX issues found and recheck.
- [x] Run complete frontend tests, lint, production build and final diff review.
- [x] Record route coverage, results and limits in a validation document; leave changes uncommitted.

## Ledger

- Baseline `0857df4`, clean workspace. Previous demos were explicitly stopped; do not reuse or leave those running.
- Existing Next CSS and layout documentation read before code. Default to preserving the current visual direction while the optional preference question is pending.
- Ruling: proceed autonomously on reversible refinements inside the requested scope; do not add design approval or commit gates beyond the user's existing authorization.
- Validation: `docs/superpowers/validation/2026-10-25-admin-page-polish.md`.
