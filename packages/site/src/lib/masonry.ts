/**
 * Layout facts of the home masonry (`src/pages/index.astro`) that image code needs.
 *
 * Why: cards keep their natural aspect, so the only thing a poster's `srcset` needs is the column
 * width, which follows the page tokens; one string keeps `LoopMedia` and the still covers on `/` in step.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */

/**
 * `sizes` for an image that fills one masonry column.
 *
 * Why: the masonry has 2 columns from 560 px and 1 below, so a column is at most `50vw` / `100vw`.
 * It over-states the real width on wide screens (the page caps at 1340 px, so a column is 664 px from
 * 1635 px viewports, where `50vw` says 800 px+), which only picks a slightly larger candidate; it is never
 * below the real column, which `tests/unit/masonry-sizes.test.ts` checks against the page tokens.
 *
 * @see packages/site/src/styles/tokens.css
 * @see packages/site/src/pages/index.astro
 */
export const MASONRY_COLUMN_SIZES = "(min-width: 560px) 50vw, 100vw";
