// @vitest-environment node
/**
 * ProjectMeta renders private links as a label, public links as anchors.
 *
 * @see packages/specs/specs/09-project-view.md § P9-8 (D12)
 */
import { loadRenderers } from "astro:container";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ProjectMeta from "../../src/components/ProjectMeta.astro";
import { prevNext } from "../../src/lib/prev-next.ts";

async function render(props: Record<string, unknown>): Promise<string> {
	const c = await AstroContainer.create({ renderers: await loadRenderers([]) });
	return c.renderToString(ProjectMeta, { props });
}

describe("ProjectMeta", () => {
	it("renders 'private for now' next to a private link and no anchor for it", async () => {
		const html = await render({
			date: new Date("2026-10-30"),
			started: new Date("2025-10-11"),
			status: "prototype",
			stack: ["python", "ts"],
			links: [
				{ label: "Code", href: "https://example.com/a", private: true },
				{ label: "Demo", href: "https://example.com/b", private: false },
			],
		});
		expect(html).toContain("private for now");
		expect(html).not.toContain('href="https://example.com/a"');
		expect(html).toContain('href="https://example.com/b"');
		expect(html).toContain("2025–");
		expect(html).toContain("prototype");
	});
	it("falls back to the legacy external link when links is empty", async () => {
		const html = await render({ date: new Date("2026-01-01"), externalUrl: "https://e.test/x" });
		expect(html).toContain('data-test="detail-external"');
	});
});

describe("prevNext", () => {
	const e = (id: string, d: string) => ({ id, title: id, date: new Date(d) });
	const list = [e("old", "2024-01-01"), e("new", "2026-01-01"), e("mid", "2025-01-01")];
	it("orders newest-first: prev is newer, next is older", () => {
		expect(prevNext(list, "mid")).toMatchObject({ prev: { id: "new" }, next: { id: "old" } });
		expect(prevNext(list, "new").prev).toBeNull();
		expect(prevNext(list, "old").next).toBeNull();
		expect(prevNext(list, "zzz")).toEqual({ prev: null, next: null });
	});
});
