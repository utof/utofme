# ADR 0014 — Cmd-K palette: rolled in-house

## Date
2026-04-26

## Status
Accepted — Phase 2

## Context

Phase 2 ships a global `⌘K` command palette (`client:idle` Svelte 5 island). Three
off-the-shelf libraries were evaluated at spec-write (2026-04-26):

- **`cmdk-sv`** — a Svelte port of `cmdk`. Maintenance signals were inconsistent at
  spec-write; Svelte 5 runes support was not confirmed.
- **`svelte-command-palette`** — community library; no clear Svelte 5 runes support
  confirmed at spec-write.
- **`@mateothegreat/svelte5-command-palette`** — targets Svelte 5 but is a low-traffic
  package with limited real-world validation.

None of the three options had robust, verified Svelte 5 (runes) support at spec-write.
Phase 2's Svelte 5 runes-only policy (no legacy reactive-let) means any library that is
not fully runes-compatible would require forking or working around deprecated patterns.

The palette is on the general-plan's "cut first" list (general-plan § "What to Cut First",
line ~706): it is a quality-of-life feature, not a core deliverable. Minimising supply-chain
surface is therefore the right-sized decision.

The site already ships `packages/site/src/lib/keymap.ts` (194 lines) for registering
keyboard chords. Folding the palette on top of that existing infrastructure adds zero new
dependencies.

Source: `packages/specs/specs/02-interactivity.md` lines 231–237; `packages/specs/plans/02-interactivity.md` § Task 9.

## Decision

Roll the palette as `packages/site/src/components/CommandPalette.svelte` (~415 lines total,
including TSDoc, CSS, and the focus-trap implementation). Key characteristics:

- Svelte 5 runes (`$state`, `$derived`, `$effect`) throughout; no legacy reactive-let.
- Uses `bindGlobalChord` from `keymap.ts` for the `Mod+K` toggle (fires on `⌘K` on macOS,
  `Ctrl+K` on other platforms).
- Focus trap implemented in-component: computes the next/prev focusable child within the
  `<dialog>` element and calls `.focus()` on Tab / Shift+Tab, without an external library.
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-label`. Verified by Playwright
  e2e (`tests/e2e/palette.spec.ts`) and Axe-core zero-violations gate.
- `transition:persist` in `_BaseLayout.astro` keeps the island alive across
  `<ClientRouter />` route swaps; the `⌘K` listener attaches once at first hydration.
- Readiness flag: `document.documentElement.dataset.paletteReady = "true"` set on mount,
  surviving `<body>` swaps because `<html>` attributes persist across view transitions.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| `cmdk-sv` | Rejected | Svelte 5 runes support unconfirmed at spec-write; inconsistent maintenance signals. |
| `svelte-command-palette` | Rejected | Svelte 5 runes support unconfirmed at spec-write. |
| `@mateothegreat/svelte5-command-palette` | Rejected | Low ecosystem rank; limited real-world validation despite targeting Svelte 5. |

## Consequences

- Zero additional npm dependencies for the palette feature.
- Focus-trap and ARIA plumbing (~100 LOC) lives in `CommandPalette.svelte`; it is not
  reusable across other dialogs without extraction (acceptable for Phase 2 scope).
- Correctness is validated by Playwright e2e assertions for Tab cycling, Escape close,
  and Axe-core zero violations on every route.
- If a future phase adds more dialogs, extract the focus-trap into a shared utility; that
  extraction is out of scope for Phase 2.
- If a battle-tested Svelte 5 `cmdk` port emerges in a later phase, migrating is a
  same-interface swap (the `PaletteEntry` interface is the public surface).

## Sources

- https://github.com/huntabyte/cmdk-sv (cmdk-sv; no verified Svelte 5 runes support at spec-write 2026-04-26)
- `packages/specs/specs/02-interactivity.md` lines 231–237 (cmdk evaluation matrix)
- `packages/specs/plans/02-interactivity.md` § Task 9 (palette implementation)
- `packages/site/src/lib/keymap.ts` (bindGlobalChord; 194 lines)
- `packages/site/src/components/CommandPalette.svelte` (415 lines)
- `packages/site/src/layouts/_BaseLayout.astro` (transition:persist mount site)
