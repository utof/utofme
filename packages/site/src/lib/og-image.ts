import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import loopsJson from "../data/loops.json";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "./seo";

const posters = import.meta.glob<{ default: ImageMetadata }>("../assets/loops/*/poster.png", {
	eager: true,
});
const manifest: Record<string, { posterPath: string }> = loopsJson;

/**
 * Minimal cover shape the share image needs.
 *
 * Why: a structural subset of the works `cover` field keeps the helper free of the content layer.
 *
 * @see UI polish review, branch review/ui2-polish (P-11)
 */
export interface OgCover {
	src: ImageMetadata;
	loop?: string | undefined;
	focus?: number | undefined;
}

/**
 * Map the banner's vertical focus (0-100) to a sharp crop gravity.
 *
 * Why: sharp only takes keyword gravities, not percentages; thirds keep the crop on the
 * same part of the poster the banner shows.
 *
 * @see https://sharp.pixelplumbing.com/api-resize#resize
 */
export function focusPosition(focus: number): "top" | "center" | "bottom" {
	return focus < 34 ? "top" : focus > 66 ? "bottom" : "center";
}

/**
 * Build a project's 1200x630 `og:image` from its banner poster at build time.
 *
 * Why: shared project links showed a bare URL (P-11). The banner loop's poster is what the
 * page opens with, so it is the share image; without a loop the cover still is used.
 * `getImage` crops (`fit: cover`) and re-encodes to JPEG, so the file stays small.
 *
 * @see UI polish review, branch review/ui2-polish (P-11)
 * @see https://docs.astro.build/en/reference/modules/astro-assets/#getimage
 */
export async function projectOgImage(cover: OgCover | undefined): Promise<string | undefined> {
	if (!cover) return undefined;
	const posterPath = cover.loop ? manifest[cover.loop]?.posterPath : undefined;
	const poster = posterPath
		? posters[`../${posterPath.replace(/^src\//, "")}`]?.default
		: undefined;
	const img = await getImage({
		src: poster ?? cover.src,
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
		fit: "cover",
		position: focusPosition(cover.focus ?? 50),
		format: "jpeg",
	});
	return img.src;
}
