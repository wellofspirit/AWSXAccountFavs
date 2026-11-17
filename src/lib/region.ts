// Matches standard, GovCloud and ISO partition region codes, e.g.
// us-east-1, ap-southeast-2, us-gov-west-1, us-iso-east-1.
export const REGION_RE = /^[a-z]{2}(-gov|-iso[a-z]?)?-[a-z]+-\d$/;

/**
 * Determine the active region for a console URL. Checks, in order:
 * the `region` query param, a `region` param embedded in the hash,
 * and a region-shaped hostname label (regional / multi-session domains
 * like `us-east-1.console.aws.amazon.com` or
 * `<session>.us-east-1.console.aws.amazon.com`).
 */
export function regionFromUrl(url: URL): string | null {
  const q = url.searchParams.get("region");
  if (q && REGION_RE.test(q)) return q;

  const hashMatch = /[?&#]region=([a-z0-9-]+)/.exec(url.hash);
  if (hashMatch && REGION_RE.test(hashMatch[1])) return hashMatch[1];

  for (const label of url.hostname.split(".")) {
    if (REGION_RE.test(label)) return label;
  }
  return null;
}

/**
 * Rewrite every `region=` occurrence (query string or hash) in an
 * origin-relative console URL to the given region. URLs without a
 * region param are returned untouched — global services (IAM, Route 53)
 * must not gain one.
 */
export function rewriteRegion(pathQueryHash: string, region: string | null): string {
  if (!region) return pathQueryHash;
  return pathQueryHash.replace(/([?&#]region=)[a-z0-9-]+/g, `$1${region}`);
}

/** Canonical form used to compare favorites regardless of region. */
export function canonicalUrl(pathQueryHash: string): string {
  return pathQueryHash.replace(/([?&#]region=)[a-z0-9-]+/g, "$1_");
}

/**
 * Build the full href to navigate to for a stored (origin-relative)
 * favorite. Keeps the current session's origin — including its
 * multi-session subdomain — and rewrites the region to the one the user
 * is currently viewing, mirroring native favorite behavior (favorites
 * open in the current region, not a pinned one).
 */
export function buildHref(
  relativeUrl: string,
  origin: string,
  currentRegion: string | null,
): string {
  return origin + rewriteRegion(relativeUrl, currentRegion);
}

/**
 * Resolve a catalog path (which carries no region) into an origin-relative
 * URL for the current region. Regional services get a `region=` query param;
 * global services are left bare. If the path already has a region param it is
 * rewritten instead of duplicated.
 */
export function withRegion(
  path: string,
  region: string | null,
  isGlobal: boolean,
): string {
  if (/[?&#]region=/.test(path)) return rewriteRegion(path, region);
  if (isGlobal || !region) return path;
  const sep = path.includes("?") ? "&" : "?";
  // Insert before any hash so the param stays in the query string.
  const hashIdx = path.indexOf("#");
  if (hashIdx === -1) return `${path}${sep}region=${region}`;
  return `${path.slice(0, hashIdx)}${sep}region=${region}${path.slice(hashIdx)}`;
}
