import { describe, expect, it, vi } from "vitest";

vi.mock("astro:assets", () => ({ getImage: vi.fn() }));

import { focusPosition } from "../../src/lib/og-image";

describe("focusPosition", () => {
	it("maps the banner focus to a sharp gravity", () => {
		expect(focusPosition(0)).toBe("top");
		expect(focusPosition(50)).toBe("center");
		expect(focusPosition(100)).toBe("bottom");
	});
});
