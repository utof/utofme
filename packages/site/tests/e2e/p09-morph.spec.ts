/**
 * Card → banner morph (spec P9-9), e2e.
 *
 * Why: the home cards carry their own `data-work-slug` / `data-vt-frame` / `data-cap`
 * hooks (Card.astro), so the router → hero-morph wiring is exercised end to end
 * against the real markup. `ready` is captured from
 * `astro:before-swap`'s `viewTransition` (review finding 10):
 * `document.activeViewTransition` is still null at `astro:after-preparation`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
import { expect, type Page, test } from "@playwright/test";

const SLUG = "cover-fixture";

interface SnapProbe {
	oldClip: string;
	newClip: string;
	pos: string;
	focus: string;
}
interface VtProbe {
	/** Per navigation: for each element named `hero`, whether it is a `[data-vt-frame]`. */
	marks: boolean[][];
	ready: string;
	anims: number;
}
declare global {
	interface Window {
		__vt?: VtProbe;
		__names?: string[];
		__snap?: SnapProbe[];
		__rev?: number[];
	}
}
async function armCard(page: Page) {
	await page.evaluate(() => {
		// Why inline: everything inside evaluate() is serialised into the page, so helpers
		// declared outside this callback are not in scope there.
		interface SwapLike extends Event {
			newDocument: Document;
			viewTransition: { ready: Promise<unknown> };
		}
		const isSwap = (e: Event): e is SwapLike => "newDocument" in e && "viewTransition" in e;
		const probe: VtProbe = { marks: [], ready: "unset", anims: 0 };
		window.__vt = probe;
		document.addEventListener("astro:after-preparation", () => {
			const named = Array.from(document.querySelectorAll("*")).filter(
				(e) => getComputedStyle(e).viewTransitionName === "hero",
			);
			probe.marks.push(named.map((e) => e.hasAttribute("data-vt-frame")));
		});
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
	});
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

// ── Motion polish (ui3 morph) ─────────────────────────────────────────────

const LOOP_SLUG = "enth";
const loopCard = (page: Page) => page.locator(`a.card[href="/works/${LOOP_SLUG}/"]`);
// Why: a card with its own framing (enth is 3:2) does not persist its video into the banner; the
// persisted-node hand-off is only exercised by a loop whose card is framed like the banner.
const PERSIST_SLUG = "eeg-ads1299-lab";

/** Records, once per `astro:before-swap` after the view transition is ready, either the running pseudo animations or the hero snapshot style. */
async function onReady(page: Page, kind: "names" | "snap") {
	await page.evaluate((k) => {
		document.addEventListener("astro:before-swap", (e) => {
			if (!("viewTransition" in e) || !(e.viewTransition instanceof ViewTransition)) return;
			e.viewTransition.ready.then(
				() => {
					if (k === "names") {
						window.__names = document
							.getAnimations()
							.map((a) =>
								a.effect instanceof KeyframeEffect ? (a.effect.pseudoElement ?? "") : "",
							);
						return;
					}
					const cs = (pe: string) => getComputedStyle(document.documentElement, pe);
					window.__snap = [
						...(window.__snap ?? []),
						{
							oldClip: cs("::view-transition-old(hero)").overflow,
							newClip: cs("::view-transition-new(hero)").overflow,
							pos: cs("::view-transition-new(hero)").objectPosition,
							focus: document.documentElement.style.getPropertyValue("--vt-focus"),
						},
					];
				},
				() => {},
			);
		});
	}, kind);
}

test("M3-04: the site header has its own transition name and no animation", async ({ page }) => {
	await page.goto("/");
	const name = await page.evaluate(() => {
		const h = document.querySelector(".site-header");
		return h ? getComputedStyle(h).viewTransitionName : null;
	});
	expect(name).toBe("site-header");
	await onReady(page, "names");
	await loopCard(page).click();
	await page.waitForURL(`**/works/${LOOP_SLUG}/`);
	const readNames = () => page.evaluate(() => window.__names ?? []);
	await expect.poll(async () => (await readNames()).length).toBeGreaterThan(0);
	const names = await readNames();
	expect(names).not.toContain("::view-transition-group(site-header)");
	expect(names).toContain("::view-transition-group(hero)");
});

test("M3-01/M3-03: hero snapshots clip and crop at the banner focus, both directions", async ({
	page,
}) => {
	await page.goto("/");
	await onReady(page, "snap");
	await loopCard(page).click();
	await page.waitForURL(`**/works/${LOOP_SLUG}/`);
	await page.goBack();
	await page.waitForURL("**/");
	const read = () => page.evaluate(() => window.__snap ?? []);
	await expect.poll(async () => (await read()).length).toBe(2);
	for (const s of await read()) {
		expect(s).toMatchObject({ oldClip: "clip", newClip: "clip" });
		expect(s.pos).not.toBe("50% 50%");
		expect(s.focus).not.toBe("");
	}
	await expect(page.locator("html")).not.toHaveAttribute("style", /--vt-focus/);
});

test("a card framed differently from the banner mounts its own banner video (no persisted node)", async ({
	page,
}) => {
	await page.goto("/");
	await loopCard(page).click();
	await page.waitForURL(`**/works/${LOOP_SLUG}/`);
	const banner = page.locator(".banner [data-loop-frame]");
	await expect(banner.locator("video[data-loop]")).toHaveCount(1);
	await expect(banner.locator("video[data-loop]")).toHaveAttribute("data-loop-size", "banner");
	await expect(banner).not.toHaveAttribute("data-banner-sources", /.*/);
	await expect(banner.locator("[data-astro-transition-persist]")).toHaveCount(0);
});

test("M3-02: the banner video is revealed only once it is on the card loop's frame", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForTimeout(1000);
	await page.evaluate(() => {
		const w = window;
		w.__rev = [];
		const card = document.querySelector(
			`[data-work-slug="eeg-ads1299-lab"] [data-loop-frame] video`,
		);
		new MutationObserver((muts) => {
			for (const m of muts) {
				const t = m.target;
				if (
					t instanceof HTMLVideoElement &&
					card instanceof HTMLVideoElement &&
					t.hasAttribute("data-upgrade") &&
					t.hasAttribute("data-ready")
				)
					w.__rev?.push(Math.abs(t.currentTime - card.currentTime) + (t.seeking ? 100 : 0));
			}
		}).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-ready"] });
	});
	await page.locator(`a.card[href="/works/${PERSIST_SLUG}/"]`).click();
	await page.waitForURL(`**/works/${PERSIST_SLUG}/`);
	await expect.poll(() => page.evaluate(() => window.__rev?.length ?? 0)).toBe(1);
	// Why: `card` is the persisted node (same element across the swap) and keeps playing until
	// the banner has faded in; +100 marks a reveal while the banner was still seeking.
	const [drift] = await page.evaluate(() => window.__rev ?? []);
	expect(drift).toBeLessThan(0.2);
});
