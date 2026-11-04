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
 * Why: derived from `--page-margin` = clamp(16px, 10vw - 16px, 192px), `--page-width` =
 * min(100% - 2 margins, 1340px) and `--masonry-gap` = 12 px, with 3 / 2 / 1 columns from 1100 / 560 px:
 * 3 columns = (0.8vw + 32px - 24px) / 3 = 26.7vw + 3px up to a 1340 px page (from 1635 px viewports),
 * where a column is a constant 439 px. The 2- and 1-column steps stay loose upper bounds (50vw, 100vw).
 * `tests/unit/masonry-sizes.test.ts` checks it against that model.
 *
 * @see packages/site/src/styles/tokens.css
 * @see packages/site/src/pages/index.astro
 */
export const MASONRY_COLUMN_SIZES =
	"(min-width: 1635px) 439px, (min-width: 1100px) calc(26.7vw + 3px), (min-width: 560px) 50vw, 100vw";
