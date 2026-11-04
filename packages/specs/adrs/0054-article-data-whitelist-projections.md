# 0054 — Article data as whitelist projections fetched on visible

Status: accepted (phase 10, spec P10-3, P10-17)

## Context
The research article's figures need real data that lives in a private notes repo next to private paths, run names and prose. The site is static-first and its first-view JS budget must not move, so the data cannot ride in the HTML or in a bundle. CI and the deploy must never read the notes repo, and a missing dataset must be a build error: there are no placeholder fixtures to fall back to.

## Decision
- **One module per output** in `src/lib/article-data/<name>.ts` exports `dataset = defineDataset({ name, schemaId, sources, projected, project, maxGzip })` and `type <Name>Data`. A module is owned by the figure lane that uses it. The sync discovers modules by listing the folder, so no registry file is shared. Zod stays in these modules, the sync script and tests; Blocks pass `shapeOf(dataset)` (`{ schema, keys }`) to islands.
- **Projections are whitelists.** `project` builds the output from named fields; `projected` is a strict schema (`z.strictObject`) with `schema: z.literal("<name>/1")`, so an extra field is a sync error. Only the notes file names appear in sidecars; no path, host, commit or branch is written anywhere.
- **Sync** (`bun run sync:article-data [--from <dir>] [--only <name>…] [--check]`, core in `scripts/lib/article-data-core.ts`): source parse → project → projected parse → canonical serialise (keys sorted at every depth, compact, one trailing newline) → gzip-9 cap → privacy scan (`shipped` set, ADR 0055) → write `src/data/article/<name>.json` and the sidecar `src/data/article-meta/sources/<name>.json` (`schema, sources, bytes, gzipBytes, sha256, syncedAt`). Files are written only when their bytes change and `syncedAt` (a UTC date) is kept while the output's sha256 is unchanged, so a second run leaves `git diff` empty (AC3.7). A cap overrun is an error; a cap is never raised silently.
- **`--check`** (CI, no notes repo): every committed output parses with `projected`, carries its schema id, is in canonical form, matches its sidecar (sha256, sizes), is within its cap and scans clean; outputs and sidecars without a module are mismatches; `facts.json` parses as `facts/1` without `src`. Exit codes: 0 ok, 1 schema error (file + JSON path), 2 privacy hit (file + rule id, never the matched text; a denylisted JSON key is redacted from the path), 3 `--check` mismatch (also a cap overrun found by `--check`), 4 source missing. Test seams: `--site-root`, `--modules`.
- **Facts.** `<from>/facts.json` → `src/data/article-meta/facts.json`: strict whitelist `v, digits, unit?, sign?, alt?, lo?, hi?, measuredOn?`; `src` is dropped; the file is scanned with the shipped rule set because its text is printed on the page. `src/lib/facts.ts` reads it on the server only; an unknown key throws, so the build fails.
- **Loading in the browser.** Blocks import the data twice statically: the JSON module (server only, for the SSR keyframe) and `…json?url&no-inline` (emits `dist/_astro/<name>.<hash>.json`; plain `?url` would inline a `data:` URI). The island gets `url` and `shape`. `loadFigureData<T>(url, shape, { signal })` does `fetch` → `res.ok` → `json()` → shape check (schema id and every top-level key) → `T`, with typed `FigureDataError` kinds `http | network | shape | abort`. One request per URL per page: callers share it, only the last abort cancels it, failures are not cached (Retry), and the cache is cleared on `astro:before-swap`. No Zod on the client: the file was validated at sync and in CI and cannot change after the build.
- **Formatting.** `src/lib/figure-scale.ts` rounds once (half away from zero on the binary value), groups with commas, prints U+2212 and joins units with U+00A0. Facts store values as printed in their unit, so `<N>` never rounds a stored value again.
- **Biome ignores `src/data/article/**` and `src/data/article-meta/**`** (`biome.json`): the canonical compact form cannot be both Biome-formatted and byte-stable for the sidecar hash. The lefthook `biome-format` job runs with `--no-errors-on-unmatched`, so a commit that stages only those JSON files passes it (before integration it failed with "No files were processed").
- **Declared surface** (CLAUDE.md hard gate): the local env var `UTOFME_ARTICLE_DATA` (notes folder; never set in CI, never written to a committed file) and the fixture-build-only routes `/lab/figures/[id]` and `/lab/article-layout` (never deployed; ADR 0055's `check:no-fixtures` guards the deploy build).

## Alternatives
- **Inline the data** (`<script type="application/json">` or island props): breaks the HTML and island-prop budgets and puts every figure's data on first view.
- **Import the JSON into each island bundle:** moves the data into lazy JS and its size counts against the island limits; hashed static files are cached independently.
- **Client-side Zod:** tens of KB per island for a check the sync and CI already did.
- **One shared registry/manifest for datasets:** every figure lane would edit the same file.
- **Blacklist projections** (copy then delete private fields): a new private field would ship by default.
- **Fixture or placeholder data** for unfinished figures: could reach a deploy; a missing dataset is a build error instead.

## Consequences
- Adding a figure's data is one module, one fixture folder and one `sync:article-data --only <name>`; CI re-verifies the committed files without the notes repo.
- The committed JSON is canonical, so reviews see data changes as one-line diffs per file and the sidecar hash proves nobody hand-edited it.
- A data re-export that adds or moves a field fails the sync at the field's JSON path instead of shipping.
- The Biome exclusion is the price of byte-stable files.

## Sources
- https://vite.dev/guide/assets (`?url`, `?no-inline`)
- https://docs.astro.build/en/guides/view-transitions/#astrobefore-swap (`astro:before-swap`)
- https://nodejs.org/api/zlib.html
- https://zod.dev/api (`strictObject`)
- packages/specs/specs/10-tactical-arena-article.md § P10-3, P10-17
