/**
 * Lookup of a project's 3D object: a named one by key, else the seeded generic one.
 *
 * Why: the single place that turns a work's `icon` (or its absence) into a mesh,
 * shared by the works schema (key validation) and the canvas renderer.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import { genericObject } from "./generic";
import { createMesh, type Mesh, type ObjectDef } from "./mesh";
import { NAMED_OBJECTS } from "./named";

const named: ReadonlyMap<string, ObjectDef> = new Map(Object.entries(NAMED_OBJECTS));

/**
 * Keys a work's `icon` frontmatter field may use.
 *
 * Why: read from the registry so the schema's error message lists what exists.
 *
 * @see packages/site/src/content.config.ts
 */
export const OBJECT_KEYS: readonly string[] = [...named.keys()];

/**
 * Whether `key` names an object in the registry.
 *
 * Why: the works schema refines `icon` with it, so a typo fails the build.
 *
 * @see packages/site/src/content.config.ts
 */
export function isObjectKey(key: string): boolean {
	return named.has(key);
}

/**
 * The mesh of an object at time `t` (seconds): the named object for `key`, or
 * the generic one for `seed` when `key` is missing or unknown.
 *
 * Why: never throws, so a stale `data-obj` in cached HTML still draws something.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function buildObject(key: string | undefined, seed: number, t: number): Mesh {
	const mesh = createMesh();
	const def = (key === undefined ? undefined : named.get(key)) ?? genericObject(seed);
	def(mesh, t);
	return mesh;
}
