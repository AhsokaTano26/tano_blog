# Admin component wrapping implementation plan

**Goal:** Give every admin control and popup the site's shared, theme-aware UI instead of browser-default controls.

**Architecture:** Reuse the current palette and motion tokens. Wrap Radix Select, Dialog and Popover for keyboard navigation, focus management and portal positioning. Keep semantic input elements behind custom checkbox, slider, file and text field wrappers. Date/time fields use a custom calendar and time controls, preserving local string values.

**Scope:** All admin route pages, editor dialogs, media picker and series/draft selectors. Preserve API requests, draft recovery, pending/disabled behavior, and destructive-action confirmation.

## Tasks

- [x] Shared controls: Select, Checkbox, Input, Textarea, Slider, Progress and Dialog; custom confirm/alert/prompt provider; common tokens and interaction states.
- [x] Date/time and file controls: custom calendar, local date/time serialization, bounds, clear, accessible upload trigger.
- [x] Migrate all admin pages and shared editor/media components, including every remaining browser alert/confirm/prompt.
- [x] Audit for remaining unwrapped special controls; test keyboard selection, safe cancellation, nested overlays, disabled/mixed checks, dates and file selection; update existing tests for custom control semantics.
- [x] Run full frontend tests, lint and production build; update the populated local Demo for review.

## Review focus

- Empty selector values must remain selectable and serializable.
- Nested selectors must close before their parent dialog on Escape.
- Closing any dialog must restore focus; modal forms must retain their business behavior.
- Date/time fields must retain local values and enforce bounds without UTC shifts.
- Bulk-select checkboxes must expose mixed and disabled states; file inputs must remain accessible behind custom triggers.

## Verification

- Full frontend suite: 288 passed.
- Final dialog scrolling adjustment: 64 relevant regressions passed.
- ESLint and production build passed.
- Read-only Edge/Chromium and WebKit checks passed for custom select, mixed checkbox, nested dialogs, safe confirmation cancellation, calendars, time/file pickers, light/dark themes and mobile bounds.
- Per user preference, browser automation stopped; the final scrolling-container adjustment was validated through code, tests and build without reopening or activating any browser window.
