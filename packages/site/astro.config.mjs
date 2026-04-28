// Why: Phase 0 ships static-only output (no SSR routes); keeps the build free-tier-cheap on Cloudflare Workers Assets and avoids miniflare runtime quirks.
// See: packages/specs/specs/00-foundations.md § "Context / invariants" + § "Non-goals" — ADR 0004 will land in Task 10a and supersede this pointer.
//
// Why: Phase 2 activates @astrojs/svelte and astro-pagefind (registered below in `integrations`).
//   The Svelte runtime chunk is only emitted into HTML when at least one `client:*` directive is used; current pages have none in Task 1, so the per-route 30 KB JS budget (ADR 0016) holds.
//   astro-pagefind is order-sensitive: its build hook runs after Astro emits HTML, so it must remain LAST in `integrations` (before any future post-build emitter). Docs verified at https://github.com/shishkin/astro-pagefind#readme (fetched 2026-04-26).
// See: packages/specs/plans/02-interactivity.md Task 1.
//
// Why: Phase 3 activates astro-expressive-code (EC) and @astrojs/react.
//   EC must precede @astrojs/mdx in `integrations` so its remark/rehype plugins are
//   registered before MDX processes code fences — empirically verified with ordering (a)
//   [expressiveCode(), mdx(), svelte(), pagefind(), react()] on 2026-04-26: build succeeded
//   and dist/works/ec-probe/index.html contained EC class names (expressive-code, ec-line).
//   react() is placed last since it only provides the React renderer for client:only="react"
//   islands (Task 10) and has no interaction with MDX rendering.
//   trailingSlash: "always" locks detail-page URL canonical form.
// See: packages/specs/plans/03-content-pipeline.md § Task 1.
//
// Fonts API shapes verified via context7 /withastro/docs 2026-04-25:
//   https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/font-provider-reference.mdx
//   - fontProviders imported from "astro/config" (same import as defineConfig)
//   - weights: ["100 900"] string-range for variable fonts (confirmed for both google + fontsource providers)
//   - local provider: options.variants[].weight is numeric (400) for static, string "100 900" for variable
//   - local provider: src paths in src/ dir per Astro recommendation (avoids public/ duplication)
//
// Why: fontProviders.google() used instead of fontProviders.fontsource() for Fraunces and Geist:
//   Both fonts are on Google Fonts (confirmed: api.fontsource.org/v1/fonts/fraunces → "type":"google";
//   api.fontsource.org/v1/fonts/geist → "type":"google"). The fontsource provider calls
//   https://api.fontsource.org/v1/fonts (the full font listing, ~several MB) which proved unreliable
//   in build environments with constrained egress. The google provider calls
//   https://fonts.google.com/metadata/fonts (~2.6 MB, confirmed reachable, completes in < 5s).
//   The end result is identical — woff2 files served from the Google Fonts CDN at build time.
//   The plan's "fontsource" language was a soft preference, not a hard requirement; the spec only
//   requires Fraunces + Geist to be wired as variable fonts. ADR 0005 (font choices) governs.
//
//   Sources:
//   - https://fonts.google.com/specimen/Fraunces (Google Fonts catalogue)
//   - https://fonts.google.com/specimen/Geist (Google Fonts catalogue)
//   - https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/font-provider-reference.mdx
// Phase 5 Task 6: wikilinks/embed/math/callout pipeline + manualChunks for graph-vendor.
// Why plugin order is fixed (embed BEFORE wikilinks BEFORE math BEFORE callout):
//   - embedRemark consumes `![[image.png]]` first; wikiLinks would otherwise emit a
//     broken-link wrapper around the inner `[[image]]` and bypass astro:assets.
//   - remarkMath after wikilinks so `$\sum [[link]]^2$` (math containing `[[`) is
//     escaped before wikilinks would parse it.
//   - remarkCallout last so callout bodies can hold math.
//   - rehypeKatex first in rehype (renders math nodes); brokenLinkRehype rewrites
//     <a class="wikilink-broken"> to <span> (drops href) + stamps data-target-slug.
// See: packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline).
//
// Why `@r4ai/remark-callout@0.6.2` over `remark-callout@1.1.1`:
//   ADR 0030 (spec § ADRs to write) lists both as alternatives. The pinned 1.1.1
//   throws "chunks[startIndex].slice is not a function" inside its micromark
//   tokenizer (insideTitle handler) on the canonical `> [!note]\n> body` input
//   under micromark@4.0.2. The @r4ai/0.6.2 alternative parses cleanly and emits
//   `containerDirective`-shaped mdast that mdast-util-to-hast handles directly.
//   Verified locally 2026-04-28 with the math-demo + callout-demo fixtures.
//
// Why manualChunks isolates force-graph + d3-force-3d into "graph-vendor":
//   The /garden/graph/ route has its own 180 KB JS budget (ADR 0026 + size-limit
//   in spec § Per-route size budgets summary). Without a manualChunks split the
//   force-graph bundle would land in the global site-js cap (420 KB) and bust it.
// See: packages/specs/specs/05-garden.md § Per-route size budgets summary.

import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import svelte from "@astrojs/svelte";
import remarkCallout from "@r4ai/remark-callout";
import { defineConfig, fontProviders } from "astro/config";
import expressiveCode from "astro-expressive-code";
import pagefind from "astro-pagefind";
import fastGlob from "fast-glob";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { embedRemark } from "./src/lib/embed-remark.ts";
import { brokenLinkRehype, wikiLinks } from "./src/lib/wikilinks-remark.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Compute permalinks synchronously at config load.
 * Why: the wikilink plugin needs the full known-targets array up front to
 * discriminate resolved-vs-broken at parse time. We derive it from the
 * filesystem on every config load (no committed `known-slugs.json` artefact);
 * see spec § Architecture (Wikilink + embed pipeline).
 * @see packages/specs/specs/05-garden.md
 */
export function computePermalinks() {
	const files = fastGlob.sync("**/*.{md,mdx}", {
		cwd: path.join(__dirname, "src", "content", "notes"),
	});
	return files.map((f) => `/garden/${path.basename(f, path.extname(f))}/`).sort();
}

export default defineConfig({
	output: "static",
	trailingSlash: "always",
	integrations: [expressiveCode(), mdx(), svelte(), pagefind(), react()],
	markdown: {
		remarkPlugins: [
			embedRemark,
			[wikiLinks, { permalinks: computePermalinks() }],
			remarkMath,
			remarkCallout,
		],
		rehypePlugins: [rehypeKatex, brokenLinkRehype],
	},
	vite: {
		build: {
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						if (id.includes("force-graph") || id.includes("d3-force-3d")) return "graph-vendor";
						return undefined;
					},
				},
			},
		},
	},
	fonts: [
		// Fraunces — variable serif (wght 100–900 + opsz + SOFT + WONK axes).
		// Why: `weights: ["100 900"]` string-range is the correct form for variable
		// fonts per the Astro Fonts API docs. opsz / SOFT / WONK axes are not
		// config-level options; they are exposed via CSS font-variation-settings.
		// See: packages/specs/specs/00-foundations.md § "Open questions" #1
		{
			provider: fontProviders.google(),
			name: "Fraunces",
			cssVariable: "--font-serif",
			weights: ["100 900"],
			styles: ["normal"],
			subsets: ["latin"],
			// Why: `display: "optional"` tells the browser to use the metric-optimized
			// fallback if the web font isn't ready within ~100ms, and to never swap.
			// This eliminates the late-stage repaint that drags Lighthouse Speed Index
			// (visual-progress metric) below the 0.95 mobile threshold while still
			// giving most visitors the real face on warm-cache reloads.
			// See: https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display
			// See: packages/specs/specs/00-foundations.md § "Success criteria" (Lighthouse mobile ≥ 95)
			display: "optional",
			fallbacks: ["serif"],
		},
		// Geist — variable sans-serif (wght 100–900).
		// Why: string-range weight matches the variable-font pattern above.
		{
			provider: fontProviders.google(),
			name: "Geist",
			cssVariable: "--font-sans",
			weights: ["100 900"],
			styles: ["normal"],
			subsets: ["latin"],
			// Why: same Speed-Index reasoning as Fraunces — optional + serif/sans/mono
			// fallback keeps the metric-adjusted fallback rendering until the variable
			// woff2 lands, with no swap-induced repaint counted against Speed Index.
			display: "optional",
			fallbacks: ["sans-serif"],
		},
		// Commit Mono — static monospace weight 400, OFL-1.1.
		// Why: local provider used instead of a remote provider because the woff2
		// is committed to the repo (src/assets/fonts/) per ADR 0005; this guarantees
		// offline builds and zero CDN dependency for the mono face at runtime.
		// Font file: src/assets/fonts/CommitMono-400.woff2 (47 KB, extracted from
		// @fontsource/commit-mono@5.2.5 package which redistributes it under OFL-1.1,
		// by Eigil Nikolajsen — https://commitmono.com/).
		// License: src/assets/fonts/OFL.txt
		// weight: 400 (numeric) = static weight per Astro local-provider docs.
		// Stored in src/assets/fonts/ (not public/) per Astro recommendation:
		// "it is recommended to store font files in the src/ directory rather than
		// the public/ directory to avoid file duplication during the build process"
		// Source: https://github.com/withastro/docs → font-provider-reference.mdx
		{
			provider: fontProviders.local(),
			name: "Commit Mono",
			cssVariable: "--font-mono",
			// Why: mono is used in pills + inline `<code>`. `display: "optional"` keeps
			// the metric-optimized monospace fallback rendering if the woff2 isn't
			// ready in ~100ms, which avoids the swap-repaint that hurts Speed Index.
			// `fallbacks: ["monospace"]` overrides the default `["sans-serif"]`,
			// so the fallback chain in --font-mono ends with `monospace` (correct
			// generic family for code blocks).
			display: "optional",
			fallbacks: ["monospace"],
			options: {
				variants: [
					{
						weight: 400,
						style: "normal",
						src: ["./src/assets/fonts/CommitMono-400.woff2"],
					},
				],
			},
		},
	],
});
