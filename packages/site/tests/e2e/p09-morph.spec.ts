/**
 * Card → banner morph (spec P9-9), e2e.
 *
 * Why: the home cards get their `data-work-slug` / `data-vt-frame` / `data-cap`
 * hooks from worker W4's Card.astro, which is not on this branch; the test adds
 * the same hooks to the live DOM (and to the incoming document on Back) so the
 * router → hero-morph wiring is exercised end to end. `ready` is captured from
 * `astro:before-swap`'s `viewTransition` (review finding 10):
 * `document.activeViewTransition` is still null at `astro:after-preparation`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
import { expect, type Page, test } from "@playwright/test";

const SLUG = "cover-fixture";

interface VtProbe {
	/** Per navigation: for each element named `hero`, whether it is a `[data-vt-frame]`. */
	marks: boolean[][];
	ready: string;
	anims: number;
}
declare global {
	interface Window {
		__vt?: VtProbe;
	}
}
async function armCard(page: Page) {
	await page.evaluate((slug) => {
		// Why inline: everything inside evaluate() is serialised into the page, so helpers
		// declared outside this callback are not in scope there.
		interface SwapLike extends Event {
			newDocument: Document;
			viewTransition: { ready: Promise<unknown> };
		}
		const isSwap = (e: Event): e is SwapLike => "newDocument" in e && "viewTransition" in e;
		const decorate = (root: ParentNode) => {
			const a = root.querySelector<HTMLElement>(`a.card[href="/works/${slug}/"]`);
			if (!a) return;
			a.dataset.workSlug = slug;
			a.querySelector("picture, img")?.setAttribute("data-vt-frame", "");
			a.querySelector("header")?.setAttribute("data-cap", "");
		};
		decorate(document);
		const probe: VtProbe = { marks: [], ready: "unset", anims: 0 };
		window.__vt = probe;
		document.addEventListener("astro:after-preparation", () => {
			const named = Array.from(document.querySelectorAll("*")).filter(
				(e) => getComputedStyle(e).viewTransitionName === "hero",
			);
			probe.marks.push(named.map((e) => e.hasAttribute("data-vt-frame")));
		});
		// Why capture: the Back navigation swaps in a fresh home document without
		// W4's hooks; decorate it before hero-morph's own before-swap listener runs.
		document.addEventListener(
			"astro:before-swap",
			(e) => {
				if (isSwap(e)) decorate(e.newDocument);
			},
			{ capture: true },
		);
		document.addEventListener("astro:before-swap", (e) => {
			if (!isSwap(e)) return;
			e.viewTransition.ready.then(
				() => {
					probe.ready = "resolved";
				},
				(err: unknown) => {
					probe.ready = `rejected:${String(err)}`;
				},
			);
		});
		document.addEventListener("astro:after-swap", () => {
			setTimeout(() => {
				probe.anims += document
					.getAnimations()
					.filter(
						(a) =>
							a.effect instanceof KeyframeEffect &&
							a.effect.pseudoElement?.startsWith("::view-transition"),
					).length;
			}, 50);
		});
	}, SLUG);
}

const card = (page: Page) => page.locator(`a.card[href="/works/${SLUG}/"]`);

test("forward: exactly one hero on the frame, ready resolves, h1 focused", async ({ page }) => {
	await page.goto("/");
	await armCard(page);
	await card(page).click();
	await page.waitForURL(`**/works/${SLUG}/`);
	await expect(page.locator("h1")).toBeFocused();
	const marks = await page.evaluate(() => window.__vt?.marks[0]);
	expect(marks).toEqual([true]);
	await expect.poll(() => page.evaluate(() => window.__vt?.ready)).toBe("resolved");
	// Names are cleared after the transition finishes.
	await expect(page.locator("[data-vt-hero]")).toHaveCount(0);
	await expect(page.locator("html")).not.toHaveAttribute("data-vt-morph", "");
});

test("back: focus returns to the originating card", async ({ page }) => {
	await page.goto("/");
	await armCard(page);
	await card(page).click();
	await page.waitForURL(`**/works/${SLUG}/`);
	await page.goBack();
	await page.waitForURL("**/");
	await expect(card(page)).toBeFocused();
});

test("no view transitions: plain navigation still works", async ({ page }) => {
	await page.addInitScript(() => {
		Reflect.deleteProperty(Document.prototype, "startViewTransition");
	});
	await page.goto("/");
	await card(page).click();
	await page.waitForURL(`**/works/${SLUG}/`);
	await expect(page.locator("h1")).toBeVisible();
	await page.goBack();
	await page.waitForURL("**/");
	await expect(card(page)).toBeVisible();
});

test("reduced motion: no view-transition animations run", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	await armCard(page);
	await card(page).click();
	await page.waitForURL(`**/works/${SLUG}/`);
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => window.__vt?.anims)).toBe(0);
});
