/**
 * Setup file of the Stryker test run (`vitest.mutation.config.ts`): pins fast-check's seed.
 *
 * Why: `@fast-check/vitest` names each property test "<label> (with seed=N)" with a fresh seed on
 * every run, so Stryker's per-test coverage could not find the dry run's property tests again and
 * every mutant that only they cover "survived" (`src/lib/sight.ts` scored 75.6). A fixed seed
 * keeps the names identical between the dry run and the mutant runs.
 *
 * @see packages/specs/adrs/0008-stryker-and-fast-check-targets.md
 */
import { configureGlobal } from "fast-check";

configureGlobal({ seed: 20261104 });
