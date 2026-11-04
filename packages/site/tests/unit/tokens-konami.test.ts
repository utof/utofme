/**
 * Guards the Konami rainbow against running for reduced-motion visitors.
 *
 * Why: the keyframe animation on `:root[data-konami]` is infinite, so WCAG 2.3.3
 * (Animation from Interactions) needs it behind a `prefers-reduced-motion` guard.
 *
 * @see packages/site/src/styles/tokens.css
 * @issue utof/utofme#107
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/tokens.css", "utf8");

describe("konami rainbow", () => {
	it("only animates inside @media (prefers-reduced-motion: no-preference)", () => {
		const guarded =
			/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^{}]*\{[^{}]*animation:\s*konami-rainbow[^{}]*\}[^{}]*\}/;
		expect(css).toMatch(guarded);
		// No unconditional use: exactly one `animation: konami-rainbow`, the guarded one.
		expect(css.match(/animation:\s*konami-rainbow/g)).toHaveLength(1);
	});
});
