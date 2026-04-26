/**
 * Why: Sandpack React component as an Astro client:only="react" island.
 *      theme="auto" follows prefers-color-scheme — verified valid in Sandpack v2
 *      via context7 /codesandbox/sandpack (fetched 2026-04-26):
 *      `<Sandpack theme="auto" />` is the preferred-colour-scheme-sensitive keyword.
 *      dependencies are passed via customSetup.dependencies (verified v2 API:
 *      direct `dependencies` prop does not exist — customSetup is the correct key).
 *      options.readOnly maps directly to the Sandpack options prop (verified v2).
 * @see packages/specs/plans/03-content-pipeline.md § Task 10
 */
import { Sandpack } from "@codesandbox/sandpack-react";

interface SandboxProps {
	template?: "react" | "react-ts" | "vanilla" | "vanilla-ts";
	files?: Record<string, string>;
	dependencies?: Record<string, string>;
	readOnly?: boolean;
}

/**
 * SandboxIsland — React island wrapping Sandpack for live code playgrounds.
 *
 * Why: Isolated as client:only="react" so the React runtime (~100 KB gzipped)
 *      is only emitted to pages that explicitly include <Sandbox>. Pages without
 *      <Sandbox> ship zero React bytes (verified in sandbox.spec.ts Case 3).
 *
 * @see packages/specs/plans/03-content-pipeline.md § Task 10
 * @see packages/specs/adrs/0019-sandpack-react-island-budget.md (pending Task 12)
 */
export default function SandboxIsland({
	template = "react",
	files,
	dependencies,
	readOnly = false,
}: SandboxProps) {
	return (
		<Sandpack
			template={template}
			// Why: exactOptionalPropertyTypes=true (astro/tsconfigs/strictest) means
			// passing `files={undefined}` is a type error on Sandpack's props. Spreading
			// an optional object only when defined satisfies the strict check.
			{...(files !== undefined ? { files } : {})}
			{...(dependencies !== undefined ? { customSetup: { dependencies } } : {})}
			options={{ readOnly }}
			theme="auto"
		/>
	);
}
