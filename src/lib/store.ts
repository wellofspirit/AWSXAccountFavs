/**
 * Storage model v2 (chrome.storage.sync).
 *
 * Favorites are now catalog-driven: a bar item references a service by its
 * catalog id, with optional title override and a user-selected set of hover
 * children. Each item is a separate sync key so we stay well under the 8 KB
 * per-item quota even with many children, and the whole thing still syncs
 * across devices.
 *
 *   settings:v1            -> Settings
 *   bar:order             -> string[] of service ids, in display order
 *   bar:item:<serviceId>  -> BarItem
 */

const SETTINGS_KEY = "settings:v1";
const ORDER_KEY = "bar:order";
const ITEM_PREFIX = "bar:item:";

export interface BarChild {
  label: string;
  /** Origin-relative path; may or may not carry a region param. */
  path: string;
}

export interface BarItem {
  /** Catalog service id. */
  id: string;
  /** Optional display override; falls back to shorthand/label. */
  title?: string;
  /** Optional URL override; falls back to the catalog canonical url. */
  url?: string;
  children: BarChild[];
}

export interface Settings {
  hideNativeBar: boolean;
  showIcons: boolean;
  useShorthand: boolean;
  /**
   * Opt-in: when visiting a service, scrape its left nav and cache any new
   * sub-pages so they show up in the submenu picker. Off by default — the
   * baked-in dataset covers the common services without a runtime dependency
   * on the console's SPA markup.
   */
  autoLearnSubpages: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hideNativeBar: true,
  showIcons: true,
  useShorthand: true,
  autoLearnSubpages: false,
};

export async function loadSettings(): Promise<Settings> {
  const d = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(d[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export async function loadOrder(): Promise<string[]> {
  const d = await chrome.storage.sync.get(ORDER_KEY);
  return (d[ORDER_KEY] as string[] | undefined) ?? [];
}

export async function saveOrder(order: string[]): Promise<void> {
  await chrome.storage.sync.set({ [ORDER_KEY]: order });
}

function itemKey(id: string): string {
  return ITEM_PREFIX + id;
}

/** Load the ordered list of bar items (skips ids missing an item record). */
export async function loadBar(): Promise<BarItem[]> {
  const order = await loadOrder();
  if (order.length === 0) return [];
  const keys = order.map(itemKey);
  const d = await chrome.storage.sync.get(keys);
  const items: BarItem[] = [];
  for (const id of order) {
    const item = d[itemKey(id)] as BarItem | undefined;
    if (item) items.push(item);
  }
  return items;
}

export async function saveItem(item: BarItem): Promise<void> {
  await chrome.storage.sync.set({ [itemKey(item.id)]: item });
  const order = await loadOrder();
  if (!order.includes(item.id)) await saveOrder([...order, item.id]);
}

export async function removeItem(id: string): Promise<void> {
  await chrome.storage.sync.remove(itemKey(id));
  const order = await loadOrder();
  await saveOrder(order.filter((x) => x !== id));
}

/** Replace the entire bar (used by reorder and bulk import). */
export async function replaceBar(items: BarItem[]): Promise<void> {
  const existing = await loadOrder();
  const nextIds = new Set(items.map((i) => i.id));
  const toRemove = existing.filter((id) => !nextIds.has(id)).map(itemKey);
  const writes: Record<string, unknown> = { [ORDER_KEY]: items.map((i) => i.id) };
  for (const item of items) writes[itemKey(item.id)] = item;
  if (toRemove.length) await chrome.storage.sync.remove(toRemove);
  await chrome.storage.sync.set(writes);
}

/** Fire cb whenever any settings/order/item key changes in sync storage. */
export function onStoreChanged(cb: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const relevant = Object.keys(changes).some(
      (k) => k === SETTINGS_KEY || k === ORDER_KEY || k.startsWith(ITEM_PREFIX),
    );
    if (relevant) cb();
  });
}

export const SEED_FLAG = "seeded:v2";
