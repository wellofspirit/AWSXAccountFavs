import { getCatalog, type Catalog } from "../lib/catalog";
import { replaceBar, loadOrder, SEED_FLAG, type BarItem } from "../lib/store";

let seedDone = false;
let seedInFlight = false;

function firstSegment(pathname: string): string | null {
  const m = /^\/([^/?#]+)/.exec(pathname);
  return m ? m[1] : null;
}

interface CatalogIndex {
  /** Exact canonical pathname -> service id (e.g. "/systems-manager/home"). */
  byPath: Map<string, string>;
  /** First path segment -> service id, fallback only. */
  bySegment: Map<string, string>;
}

function buildIndex(catalog: Catalog): CatalogIndex {
  const byPath = new Map<string, string>();
  const bySegment = new Map<string, string>();
  for (const s of catalog.services) {
    if (!byPath.has(s.url)) byPath.set(s.url, s.id);
    const seg = firstSegment(s.url);
    // Prefer the "canonical" service for a segment: the one whose url is
    // exactly "/<seg>/home". Otherwise keep the first seen.
    if (seg && (!bySegment.has(seg) || s.url === `/${seg}/home`)) {
      bySegment.set(seg, s.id);
    }
  }
  return { byPath, bySegment };
}

/** Read native favorite anchors and map each to a catalog service id, in order. */
function nativeServiceIds(catalog: Catalog): string[] {
  const header = document.getElementById("awsc-nav-header");
  if (!header) return [];
  const idx = buildIndex(catalog);
  const anchors = header.querySelectorAll<HTMLAnchorElement>("nav ol a[href]");
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;
    let pathname: string;
    try {
      pathname = new URL(href, location.origin).pathname;
    } catch {
      continue;
    }
    const seg = firstSegment(pathname);
    // Exact canonical path wins; fall back to segment match.
    const id = idx.byPath.get(pathname) ?? (seg ? idx.bySegment.get(seg) : null);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * One-time migration: seed the bar from the current account's native
 * favorites. Guarded by a sync flag so we never clobber later edits, and
 * retried across mutations because the native bar populates asynchronously.
 */
export async function seedFromNativeOnce(): Promise<void> {
  if (seedDone || seedInFlight) return;
  seedInFlight = true;
  try {
    const flag = await chrome.storage.sync.get(SEED_FLAG);
    if (flag[SEED_FLAG]) {
      seedDone = true;
      return;
    }
    // If the user already has a bar (e.g. synced from another device), respect it.
    const order = await loadOrder();
    if (order.length > 0) {
      await chrome.storage.sync.set({ [SEED_FLAG]: true });
      seedDone = true;
      return;
    }
    const catalog = await getCatalog();
    if (!catalog) return; // catalog not ready yet; retry next mutation
    const ids = nativeServiceIds(catalog);
    if (ids.length === 0) return; // native bar not ready yet; retry next mutation

    const items: BarItem[] = ids.map((id) => ({ id, children: [] }));
    await replaceBar(items);
    await chrome.storage.sync.set({ [SEED_FLAG]: true });
    seedDone = true;
  } finally {
    seedInFlight = false;
  }
}
