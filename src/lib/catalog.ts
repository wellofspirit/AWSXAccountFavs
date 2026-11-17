/**
 * The AWS console ships its full service catalog in the page's localStorage
 * under `cctConfigDataCache` (~300 services with canonical URLs, CDN icon
 * URLs, per-region availability, search keywords, sub-routes and category
 * grouping). We read it from the content script (same origin => shared
 * localStorage), slim it, and cache it to `chrome.storage.local` so the
 * settings UI has a catalog even before the raw cache is present.
 */

import BAKED_SUBPAGES from "../data/subpages.json";

const RAW_KEY = "cctConfigDataCache";
const CACHE_KEY = "catalog:v1";

// Baked-in sub-page dataset discovered by crawling service left-navs. Keyed by
// service id. Merged with routes-derived children so common services have a
// useful submenu out of the box, with no runtime dependency on SPA markup.
const BAKED: Record<string, ChildSuggestion[]> = BAKED_SUBPAGES as Record<
  string,
  ChildSuggestion[]
>;

function dedupeByPath(lists: ChildSuggestion[][]): ChildSuggestion[] {
  const byPath = new Map<string, ChildSuggestion>();
  for (const list of lists) {
    for (const c of list) {
      if (!byPath.has(c.path)) byPath.set(c.path, c);
    }
  }
  return [...byPath.values()];
}

export interface ChildSuggestion {
  label: string;
  /** Origin-relative path (no region param). */
  path: string;
}

export interface CatalogService {
  id: string;
  label: string;
  /** Origin-relative canonical path, e.g. "/ec2/home". */
  url: string;
  /** Full CDN icon URL, or null. */
  icon: string | null;
  categoryId: string | null;
  keywords: string;
  /** Regions the service is available in ("*" style not used; empty = global/all). */
  regions: string[];
  children: ChildSuggestion[];
}

export interface CatalogCategory {
  id: string;
  label: string;
  serviceIds: string[];
}

export interface Catalog {
  services: CatalogService[];
  categories: CatalogCategory[];
}

/**
 * Services that are global (no regional endpoint). We must not append a
 * `region=` param to their links. Not exhaustive — errs toward correctness
 * for the common globals; regional services simply get the current region.
 */
export const GLOBAL_SERVICE_IDS = new Set([
  "iam",
  "organizations",
  "route53",
  "route53domains",
  "cloudfront",
  "cost-management",
  "b",
  "billing",
  "billingconductor",
  "sso",
  "health",
  "trustedadvisor",
  "account",
  "support",
  "artifact",
  "waf",
  "chatbot",
]);

// Route path fragments that are internal / non-navigational and should not
// be offered as hover children.
const ROUTE_NOISE = /(consoleapis|\/api$|\/nav$|nav$|\/pricing$|quickstart|\/acb$|globalaccelerator)/i;

function prettifySegment(seg: string): string {
  return seg
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function deriveChildren(url: string, routes: Array<{ path: string }>): ChildSuggestion[] {
  const base = url.replace(/\/home.*$/, "").replace(/\/$/, ""); // e.g. /systems-manager
  const seen = new Set<string>();
  const out: ChildSuggestion[] = [];
  for (const r of routes ?? []) {
    const path = r?.path;
    if (!path || ROUTE_NOISE.test(path)) continue;
    // Only keep sub-paths of this service's base that go one level deeper.
    if (!path.startsWith(base + "/")) continue;
    const rest = path.slice(base.length + 1);
    if (!rest || rest.includes("/")) continue; // one level only
    // Not a page: route params/wildcards (":id", "*"), console version
    // prefixes ("/ecs/v2" -> "V2"), or the service's own home.
    if (!/^[A-Za-z0-9][\w.-]*$/.test(rest) || /^v\d+$/i.test(rest) || rest === "home") continue;
    if (seen.has(rest)) continue;
    seen.add(rest);
    out.push({ label: prettifySegment(rest), path });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function slim(data: any): Catalog {
  const services: CatalogService[] = (data.services ?? [])
    .filter((s: any) => s && s.id && s.url && s.label && !s.unlisted && s.external_link !== true)
    .map((s: any) => ({
      id: s.id,
      label: s.label,
      url: s.url,
      icon: s.iconTbUrl ?? null,
      categoryId: null,
      keywords: (s.search?.keywords ?? "").toString(),
      regions: Array.isArray(s.regions) ? s.regions : [],
      // Baked (crawled) sub-pages first — better labels — unioned with the
      // catalog's own routes-derived sub-paths.
      children: dedupeByPath([BAKED[s.id] ?? [], deriveChildren(s.url, s.routes ?? [])]),
    }));

  const categories: CatalogCategory[] = (data.serviceCategories ?? []).map((c: any) => ({
    id: c.id,
    label: c.label,
    serviceIds: c.serviceIds ?? [],
  }));

  const catOf = new Map<string, string>();
  for (const c of categories) for (const sid of c.serviceIds) catOf.set(sid, c.id);
  for (const s of services) s.categoryId = catOf.get(s.id) ?? null;

  // Stable, useful ordering for the picker: alphabetical by label.
  services.sort((a, b) => a.label.localeCompare(b.label));
  return { services, categories };
}

/** Read + slim the catalog from page localStorage, if present. */
export function readRawCatalog(): Catalog | null {
  try {
    const raw = localStorage.getItem(RAW_KEY);
    if (!raw) return null;
    return slim(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Get the catalog: prefer the fresh page copy (and refresh the cache when
 * found), else fall back to the cached copy in extension storage.
 */
export async function getCatalog(): Promise<Catalog | null> {
  const fresh = readRawCatalog();
  if (fresh && fresh.services.length) {
    await chrome.storage.local.set({ [CACHE_KEY]: fresh });
    return fresh;
  }
  const cached = await chrome.storage.local.get(CACHE_KEY);
  return (cached[CACHE_KEY] as Catalog | undefined) ?? null;
}

export function serviceById(catalog: Catalog | null, id: string): CatalogService | undefined {
  return catalog?.services.find((s) => s.id === id);
}
