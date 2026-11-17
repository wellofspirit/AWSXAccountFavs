import { type Catalog } from "../lib/catalog";
import type { BarChild } from "../lib/store";

const LEARNED_KEY = "learned-subpages:v1";

export type LearnedMap = Record<string, BarChild[]>;

export async function getLearned(): Promise<LearnedMap> {
  const d = await chrome.storage.local.get(LEARNED_KEY);
  return (d[LEARNED_KEY] as LearnedMap | undefined) ?? {};
}

function baseOf(url: string): string {
  const b = url.split("?")[0].replace(/\/home$/, "");
  return b.replace(/\/$/, "");
}

/** Match the current pathname to the catalog service with the longest base prefix. */
function currentService(catalog: Catalog): { id: string; base: string } | null {
  const path = location.pathname;
  let best: { id: string; base: string } | null = null;
  for (const s of catalog.services) {
    const base = baseOf(s.url);
    if (!base || base === "/") continue;
    if (path === base || path.startsWith(base + "/")) {
      if (!best || base.length > best.base.length) best = { id: s.id, base };
    }
  }
  return best;
}

/**
 * Scrape one-level sub-pages from the current service's left nav, capturing
 * two nav patterns:
 *  - path-based relative links under the service base (S3, ECS, SSM)
 *  - bare-hash links resolving against the current page (EC2, VPC)
 * Bare-hash (`href^="#"`) excludes the region switcher (absolute URLs).
 */
function scrapeSubpages(base: string): BarChild[] {
  const home = location.pathname;
  const seen = new Set<string>();
  const out: BarChild[] = [];
  const push = (label: string, path: string) => {
    if (!label || label.length > 40 || seen.has(path)) return;
    seen.add(path);
    out.push({ label, path });
  };
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const raw = a.getAttribute("href") ?? "";
    const label = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    if (raw.startsWith(base + "/")) {
      const path = raw.split(/[?#]/)[0];
      const rest = path.slice(base.length + 1);
      if (!rest || rest.includes("/") || rest === "home") continue;
      push(label || prettify(rest), path);
    } else if (raw.startsWith("#") && raw.length > 1) {
      push(label, home + raw);
    }
  }
  return out;
}

function prettify(seg: string): string {
  return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/**
 * If any new sub-pages are visible for the current service, merge them into
 * the learned cache (union by path). Returns true if the cache changed.
 */
export async function learnCurrentService(catalog: Catalog): Promise<boolean> {
  const svc = currentService(catalog);
  if (!svc) return false;
  const found = scrapeSubpages(svc.base);
  if (found.length === 0) return false;

  const map = await getLearned();
  const existing = map[svc.id] ?? [];
  const byPath = new Map(existing.map((c) => [c.path, c]));
  let changed = false;
  for (const c of found) {
    if (!byPath.has(c.path)) {
      byPath.set(c.path, c);
      changed = true;
    }
  }
  if (!changed) return false;
  map[svc.id] = [...byPath.values()];
  await chrome.storage.local.set({ [LEARNED_KEY]: map });
  return true;
}
