import {
  loadSettings,
  loadBar,
  onStoreChanged,
  type BarItem,
  type Settings,
} from "../lib/store";
import {
  getCatalog,
  serviceById,
  GLOBAL_SERVICE_IDS,
  type CatalogService,
} from "../lib/catalog";
import { shorten } from "../lib/shorthand";
import { regionFromUrl, REGION_RE, withRegion } from "../lib/region";
import { openSettings } from "./modal";
import { seedFromNativeOnce } from "./seed";
import { learnCurrentService } from "./learn";

const BAR_ID = "xafav-bar";
const STYLE_ID = "xafav-style";
const DROPDOWN_ID = "xafav-dropdown";
const HEADER_ID = "awsc-nav-header";

let currentSettings: Settings | null = null;

function currentRegion(): string | null {
  const meta = document
    .querySelector('meta[name="awsc-mezz-region"]')
    ?.getAttribute("content");
  if (meta && REGION_RE.test(meta)) return meta;
  return regionFromUrl(new URL(location.href));
}

interface ResolvedItem {
  id: string;
  title: string;
  iconUrl: string | null;
  href: string;
  children: Array<{ label: string; href: string }>;
}

function resolve(
  item: BarItem,
  svc: CatalogService | undefined,
  settings: Settings,
  region: string | null,
): ResolvedItem {
  const label = svc?.label ?? item.id;
  const title = item.title ?? (settings.useShorthand ? shorten(label) : label);
  const isGlobal = GLOBAL_SERVICE_IDS.has(item.id);
  const basePath = item.url ?? svc?.url ?? "/console/home";
  const href = location.origin + withRegion(basePath, region, isGlobal);
  const children = (item.children ?? []).map((c) => ({
    label: c.label,
    href: location.origin + withRegion(c.path, region, isGlobal),
  }));
  return {
    id: item.id,
    title,
    iconUrl: settings.showIcons ? svc?.icon ?? null : null,
    href,
    children,
  };
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BAR_ID}{display:flex;align-items:center;gap:1px;padding:2px 6px;
      background:#232f3e;border-top:1px solid #3a4553;overflow-x:auto;overflow-y:hidden;
      font:12px/1.4 "Amazon Ember",Arial,sans-serif;white-space:nowrap;scrollbar-width:thin;position:relative;z-index:1000}
    #${BAR_ID} .xafav-item{display:inline-flex;align-items:center;gap:6px;
      color:#d5dbdb;text-decoration:none;padding:4px 9px;border-radius:4px;cursor:pointer}
    #${BAR_ID} .xafav-item:hover{background:#3a4553;color:#fff}
    #${BAR_ID} .xafav-item img{width:16px;height:16px;flex:0 0 16px;display:block}
    #${BAR_ID} .xafav-item .xafav-caret{opacity:.5;font-size:9px;margin-left:-2px}
    #${BAR_ID} .xafav-gear{margin-left:auto;color:#d5dbdb;font-size:15px;background:none;border:none;cursor:pointer;padding:4px 8px;flex:0 0 auto}
    #${BAR_ID} .xafav-gear:hover{color:#ff9900}
    #${BAR_ID} .xafav-empty{color:#7d8998;font-style:italic;padding:4px 8px}
    #${DROPDOWN_ID}{position:fixed;background:#232f3e;border:1px solid #3a4553;border-radius:6px;
      padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.4);z-index:100000;min-width:180px;
      font:12px/1.4 "Amazon Ember",Arial,sans-serif;display:none}
    #${DROPDOWN_ID} a{display:block;color:#d5dbdb;text-decoration:none;padding:5px 10px;border-radius:4px;white-space:nowrap}
    #${DROPDOWN_ID} a:hover{background:#3a4553;color:#fff}`;
  document.documentElement.appendChild(style);
}

// ---- Shared hover dropdown (single reused element, avoids overflow clipping) ----

let dropdown: HTMLElement | null = null;
let hideTimer: number | null = null;

function getDropdown(): HTMLElement {
  if (dropdown && dropdown.isConnected) return dropdown;
  dropdown = document.createElement("div");
  dropdown.id = DROPDOWN_ID;
  dropdown.addEventListener("mouseenter", cancelHide);
  dropdown.addEventListener("mouseleave", scheduleHide);
  document.documentElement.appendChild(dropdown);
  return dropdown;
}

function cancelHide(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide(): void {
  cancelHide();
  hideTimer = window.setTimeout(() => {
    const d = getDropdown();
    d.style.display = "none";
  }, 180);
}

function showDropdown(anchor: HTMLElement, children: Array<{ label: string; href: string }>): void {
  cancelHide();
  const d = getDropdown();
  d.replaceChildren();
  for (const c of children) {
    const a = document.createElement("a");
    a.textContent = c.label;
    a.href = c.href;
    d.appendChild(a);
  }
  const r = anchor.getBoundingClientRect();
  d.style.display = "block";
  d.style.left = `${Math.round(r.left)}px`;
  d.style.top = `${Math.round(r.bottom + 2)}px`;
}

// ---- Rendering ----

function makeItem(item: ResolvedItem): HTMLElement {
  const a = document.createElement("a");
  a.className = "xafav-item";
  a.href = item.href;
  a.dataset.serviceId = item.id;

  if (item.iconUrl) {
    const img = document.createElement("img");
    img.src = item.iconUrl;
    img.alt = "";
    img.loading = "lazy";
    a.appendChild(img);
  }
  const span = document.createElement("span");
  span.textContent = item.title;
  a.appendChild(span);

  if (item.children.length) {
    const caret = document.createElement("span");
    caret.className = "xafav-caret";
    caret.textContent = "▾";
    a.appendChild(caret);
    a.addEventListener("mouseenter", () => showDropdown(a, item.children));
    a.addEventListener("mouseleave", scheduleHide);
  }
  return a;
}

async function render(bar: HTMLElement): Promise<void> {
  const [settings, items, catalog] = await Promise.all([
    loadSettings(),
    loadBar(),
    getCatalog(),
  ]);
  currentSettings = settings;
  applyNativeBarVisibility(settings);

  const region = currentRegion();
  bar.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("span");
    empty.className = "xafav-empty";
    empty.textContent = "No services on the bar yet — open settings (⚙) to add some.";
    bar.appendChild(empty);
  } else {
    for (const item of items) {
      const svc = serviceById(catalog, item.id);
      bar.appendChild(makeItem(resolve(item, svc, settings, region)));
    }
  }

  const gear = document.createElement("button");
  gear.className = "xafav-gear";
  gear.type = "button";
  gear.textContent = "⚙";
  gear.title = "Cross-account favorites settings";
  gear.addEventListener("click", () => void openSettings());
  bar.appendChild(gear);
}

// ---- Native favorites bar hiding ----

/**
 * The favorites strip is the direct child of the header `<nav>` that
 * contains the favorites `<ol>`. Its sibling holds the primary bar (logo,
 * search, account, region) — which we must NOT hide. We locate the strip by
 * climbing from a favorite anchor to the child just under the nav, and guard
 * against hiding anything containing the search box.
 */
function nativeFavStrip(): HTMLElement | null {
  const ol = document
    .querySelector('[data-testid^="awsc-nav-favorites-bar"]')
    ?.closest("ol");
  const nav = ol?.closest("nav");
  if (!ol || !nav) return null;
  let strip: HTMLElement = ol as HTMLElement;
  while (strip.parentElement && strip.parentElement !== nav) {
    strip = strip.parentElement;
  }
  if (strip.parentElement !== nav) return null;
  // Never hide a container that also holds the primary bar's search input.
  if (strip.querySelector("input")) return null;
  return strip;
}

function applyNativeBarVisibility(settings: Settings): void {
  const strip = nativeFavStrip();
  if (!strip) return;
  strip.style.display = settings.hideNativeBar ? "none" : "";
}

// ---- Mounting ----

function mountBar(): void {
  const header = document.getElementById(HEADER_ID);
  if (!header || document.getElementById(BAR_ID)) return;
  ensureStyle();
  const bar = document.createElement("div");
  bar.id = BAR_ID;
  header.insertAdjacentElement("afterend", bar);
  void render(bar);
}

function rerender(): void {
  const bar = document.getElementById(BAR_ID);
  if (bar) void render(bar);
}

let learnTimer: number | null = null;

function maybeLearn(): void {
  if (!currentSettings?.autoLearnSubpages) return;
  if (learnTimer !== null) return;
  learnTimer = window.setTimeout(async () => {
    learnTimer = null;
    const catalog = await getCatalog();
    if (catalog) await learnCurrentService(catalog);
  }, 1500);
}

export function start(): void {
  void seedFromNativeOnce();
  mountBar();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(BAR_ID)) mountBar();
    // Re-apply native-bar hiding: the console re-renders the header on SPA nav.
    if (currentSettings) applyNativeBarVisibility(currentSettings);
    void seedFromNativeOnce();
    maybeLearn();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  onStoreChanged(rerender);
}
