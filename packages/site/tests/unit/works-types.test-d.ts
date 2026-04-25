import { expectTypeOf } from "vitest";
import type { WorkEntry } from "../../src/content.config";

declare const e: WorkEntry;
if (e.type === "code") {
	expectTypeOf(e.repo).toEqualTypeOf<string | undefined>();
	expectTypeOf(e.stack).toEqualTypeOf<string[]>();
}
if (e.type === "video") {
	expectTypeOf(e.duration).toEqualTypeOf<number>();
}
// @ts-expect-error — duration not on the union without narrowing
e.duration;
