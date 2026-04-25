// Why: Phase 0 ships static-only output (no SSR routes); keeps the build free-tier-cheap on Cloudflare Workers Assets and avoids miniflare runtime quirks.
// See: packages/specs/specs/00-foundations.md § "Context / invariants" + § "Non-goals" — ADR 0004 will land in Task 10a and supersede this pointer.
//
// Why: Svelte integration is registered in Phase 2, not Phase 0. Phase 0 ships zero hydrated islands; registering svelte() here would emit a Svelte client runtime chunk and violate the 0-KB-JS first-load invariant.
// See: packages/specs/specs/00-foundations.md § "Non-goals" + § "Success criteria".
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
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
	output: "static",
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
