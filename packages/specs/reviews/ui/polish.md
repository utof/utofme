# UI review — polish lens

## Method
- Production build, `UTOFME_FIXTURES=false bun run build`, served with `astro preview` on :4321 (live site unreachable from the review VM).
- Fallback fonts render (Google Fonts blocked): no typeface judgements, only scale, hierarchy and spacing.
- Playwright Chromium, 1440x900 @2x, 390x844 @2x, 1920x1080.
- `impeccable@4.8.0 install` failed: the skill bundle is downloaded from impeccable.style, which the proxy blocks. Critique/typeset/layout methodology was applied by hand. The `detect` CLI was run via a `--no-sandbox` Chromium wrapper.
- `astro preview` ignores `_redirects`, so `/works/` 404s locally (expected).

## Findings
_in progress_
