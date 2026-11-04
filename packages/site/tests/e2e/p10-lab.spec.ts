/**
 * Figure lab pages: each Block renders one figure (or the inline stub) and is Axe-clean.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Figures: common contract (Lab pages)
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const FIGURES = [
	"replay",
	"smoke-sight",
	"map-stages",
	"machine",
	"roll-map",
	"elo",
	"noise",
	"tempo",
	"agents-vs-pros",
	"free-peek",
	"notebook",
] as const;

for (const id of FIGURES) {
	test(`lab/${id}: one figure with caption and Try line, Axe-clean`, async ({ page }) => {
		await page.goto(`/lab/figures/${id}/`);
		await expect(page.locator("figure[data-figure]")).toHaveCount(1);
		await expect(page.locator("figure figcaption")).toContainText("Placeholder caption");
		await expect(page.locator("figure figcaption em")).toContainText("Try:");
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	});
}

// Why: F13 is an inline, unnumbered sentence, so it is a span island, not a figure (the stub is
// replaced by the real sentence in lane FC).
test("lab/elo-sentence: renders the inline sentence, Axe-clean", async ({ page }) => {
	await page.goto("/lab/figures/elo-sentence/");
	await expect(page.locator("figure[data-figure]")).toHaveCount(0);
	await expect(page.locator("astro-island span.es")).toHaveCount(1);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
