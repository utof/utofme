/**
 * rel="me" identity registry. Augments the footer h-card with cross-site links.
 * Why: webmention.io / IndieAuth use rel=me to verify site ownership against
 * external profiles. Adding profiles is a one-line append.
 * @see packages/specs/specs/06-indieweb.md § Architecture (rel="me" profile registry)
 */
export type RelMeProfile = {
	url: string;
	label: string;
	network: "github" | "mastodon" | "bluesky" | "linkedin" | "twitter" | "email" | "other";
};

/**
 * Site owner's cross-network identity entries, each verified via rel=me.
 * Why: IndieAuth and webmention.io crawl these links to confirm site ownership.
 * Append a new entry here to register additional external profiles.
 * @see packages/specs/specs/06-indieweb.md § Architecture (rel="me" profile registry)
 */
export const profiles: readonly RelMeProfile[] = [
	{ url: "https://github.com/utof", label: "GitHub @utof", network: "github" },
] as const;
