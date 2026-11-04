/**
 * Figure F13, the reactive Elo sentence, on `/lab/figures/elo-sentence/` (AC15.5).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/elo-sentence/";
const BASE = "http://127.0.0.1:4321";

/**
 * Axe over the page as served with every `<script>` removed (Axe itself needs scripting).
 *
 * Why: same approach as `p10-layout.spec.ts` (AC1.8) for the "JavaScript disabled" check.
 */
async function axeWithoutScripts(browser: Browser): Promise<unknown[]> {
	const context = await browser.newContext({ baseURL: BASE });
	await context.route("**/*.js", (route) => route.abort());
	await context.route(`**${URL}`, async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script>/g, "");
		await route.fulfill({ response, body });
	});
	const page = await context.newPage();
	await page.goto(URL);
	const scripts = await page.locator("script").count();
	const { violations } = await new AxeBuilder({ page }).analyze();
	await context.close();
	return scripts === 0 ? violations : [{ id: "scripts-still-present" }];
}
const NBSP = " ";

const slider = (page: Page) => page.getByRole("slider", { name: "Elo difference" });
const sentence = (page: Page) => page.locator("astro-island span.es");

async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await sentence(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(slider(page)).toBeVisible();
}

test("SSR already reads '+96 … 63 %'; after hydration the number is a slider", async ({ page }) => {
	await page.goto(URL);
	await expect(sentence(page)).toContainText(`an agent rated +96 higher wins 63${NBSP}% of rounds`);
	await open(page);
	await expect(slider(page)).toHaveText("+96");
	await expect(slider(page)).toHaveAttribute("aria-valuetext", "+96 Elo");
});

test("AC15.5: ArrowRight ×4 reads +100 and 64 %; Shift moves by 10", async ({ page }) => {
	await open(page);
	await slider(page).focus();
	for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
	await expect(slider(page)).toHaveText("+100");
	await expect(sentence(page)).toContainText(`64${NBSP}%`);
	await page.keyboard.press("Shift+ArrowLeft");
	await expect(slider(page)).toHaveText("+90");
});

test("a horizontal pointer drag moves the number", async ({ page }) => {
	await open(page);
	const box = await slider(page).boundingBox();
	if (!box) throw new Error("no box");
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 40, y, { steps: 4 });
	await page.mouse.up();
	await expect(slider(page)).toHaveText("+116");
});

test("AC15.5: with JavaScript off no slider exists and the sentence is plain text", async ({
	browser,
}) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.getByRole("slider")).toHaveCount(0);
	await expect(sentence(page)).toContainText(`an agent rated +96 higher wins 63${NBSP}% of rounds`);
	await context.close();
});
test("Axe is clean with scripts removed", async ({ browser }) => {
	expect(await axeWithoutScripts(browser)).toEqual([]);
});

test("Axe is clean after hydration", async ({ page }) => {
	await open(page);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
