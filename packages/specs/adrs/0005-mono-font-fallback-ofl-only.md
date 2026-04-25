# ADR 0005 — Monospace Font Fallback: OFL Only for Phase 0

## Status
Accepted — Phase 0

## Context

The site design calls for three typefaces:
- Serif: Fraunces (variable, OFL 1.1) — served via Fontsource provider.
- Sans-serif: Geist (variable, OFL 1.1) — served via Fontsource provider.
- Monospace: **Berkeley Mono** (commercial) — the target face for code blocks.

Berkeley Mono v2 is a premium typeface available under a commercial web licence. Committing
its `.woff2` file to a **public** repository would violate its licence and expose the repo
to a DMCA takedown. The Berkeley Mono v2 web licence is an individual purchase; it is
**not** included in the repo and is treated as a deferred Phase 0+ decision.

For Phase 0, an OFL (SIL Open Font Licence 1.1) monospace fallback is required that:
1. Visually resembles Berkeley Mono as closely as possible.
2. Can be committed to the public repo without licence risk.
3. Weighs ≤ 70 KB as a single `.woff2` file.

Commit Mono v1 (© 2023 Eigil Nikolajsen, SIL OFL 1.1) was chosen:
- Proportions close to Berkeley Mono (narrow horizontal rhythm, high x-height).
- Available from commitmono.com and mirrored on Fontsource (fontsource.org/fonts/commit-mono).
- Single `.woff2` file at 400 weight, ≤ 50 KB.
- Served as a local-provider font in the Astro Fonts API to ensure Cache-Control immutable headers.

## Decision

Ship **Commit Mono v1 OFL** (CommitMono-400.woff2, SIL OFL 1.1 © 2023 Eigil Nikolajsen)
as the monospace fallback for Phase 0. Berkeley Mono is explicitly out of scope until a
commercial web licence purchase decision is made.

**Foot-gun invariant: NEVER commit any Berkeley Mono `.woff2` (or any other format) to
this repository in any branch or commit.** It is a paid, non-redistributable asset.
The `.gitignore` rule `BerkeleyMono*` enforces this at the repo boundary.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Berkeley Mono v2 (commercial) | Deferred | Licence prohibits public-repo distribution; deferred decision |
| Iosevka | Rejected | Visually too wide/condensed; does not resemble Berkeley Mono's rhythm |
| JetBrains Mono | Rejected | Visually distinct (larger apertures, different letterform style) |
| Cascadia Code | Rejected | Ligatures and style differ significantly from Berkeley Mono |
| Commit Mono v1 OFL | **Selected** | Closest available OFL match; ≤ 50 KB; SIL OFL 1.1 |

## Consequences

- `public/fonts/CommitMono-400.woff2` is committed to the repo (OFL allows redistribution).
- `public/fonts/OFL.txt` is committed alongside the font.
- Astro Fonts API local provider entry serves the font with `Cache-Control: public, max-age=31536000, immutable`
  via Workers Assets (verified in `tests/e2e/typography.spec.ts` cache-header assertion).
- A future phase (likely Phase 3 or Phase 4) revisits Berkeley Mono when a web licence is
  purchased and the font file is served from a private Cloudflare R2 bucket or equivalent,
  never from the public repo.
- `knip` and `depcruise` see no new deps beyond those already installed.

## Sources

- commitmono.com (Commit Mono v1, SIL OFL 1.1 licence)
- fontsource.org/fonts/commit-mono (Fontsource mirror, OFL confirmed)
- developers.cloudflare.com/workers/static-assets/ (Cache-Control immutable headers)
- packages/specs/specs/00-foundations.md § "Context / invariants" (Foot-gun invariant line)
- packages/specs/specs/00-foundations.md § "Pinned dev deps" (Commit Mono reference)
