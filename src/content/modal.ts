import {
  loadSettings,
  saveSettings,
  loadBar,
  replaceBar,
  type BarItem,
  type Settings,
} from "../lib/store";
import { getCatalog, serviceById, type Catalog, type CatalogService, type ChildSuggestion } from "../lib/catalog";
import { shorten } from "../lib/shorthand";
import { getLearned, type LearnedMap } from "./learn";

const HOST_ID = "xafav-settings-host";

interface State {
  settings: Settings;
  items: BarItem[];
  catalog: Catalog | null;
  learned: LearnedMap;
  search: string;
  expandedId: string | null;
  dragIndex: number | null;
}

let state: State | null = null;
let root: ShadowRoot | null = null;

const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:"Amazon Ember",-apple-system,system-ui,Arial,sans-serif}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483000;display:flex;align-items:center;justify-content:center}
  .modal{background:#fff;color:#16191f;width:min(920px,94vw);height:min(680px,92vh);border-radius:10px;
    display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  header{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #e9ebed}
  header h2{font-size:16px;margin:0;flex:1}
  header .close{border:none;background:none;font-size:20px;cursor:pointer;color:#687078}
  .toggles{display:flex;gap:18px;padding:10px 18px;border-bottom:1px solid #e9ebed;flex-wrap:wrap;font-size:13px}
  .toggles label{display:flex;align-items:center;gap:6px;cursor:pointer}
  .cols{flex:1;display:flex;min-height:0}
  .col{flex:1;display:flex;flex-direction:column;min-height:0}
  .col.left{border-right:1px solid #e9ebed}
  .col h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#687078;margin:0;padding:12px 16px 6px}
  .scroll{overflow-y:auto;flex:1;padding:0 10px 10px}
  .search{margin:6px 16px 8px;padding:7px 10px;border:1px solid #aab7c4;border-radius:6px;font-size:13px;width:calc(100% - 32px)}
  .row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px}
  .row:hover{background:#f4f6f8}
  .row img{width:18px;height:18px;flex:0 0 18px}
  .row .name{flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .row .sub{color:#687078;font-size:11px}
  .row button{border:none;background:none;cursor:pointer;font-size:14px;color:#0972d3}
  .row.item{border:1px solid #e9ebed;margin-bottom:5px}
  .row.item[draggable=true]{cursor:grab}
  .row.item.dragging{opacity:.4}
  .handle{color:#aab;cursor:grab}
  .add-btn{color:#0972d3;font-weight:600}
  .rm-btn{color:#d13212}
  .editor{border:1px solid #e9ebed;border-top:none;margin:-5px 0 8px;padding:10px 12px;border-radius:0 0 6px 6px;background:#fbfcfd}
  .editor .titlerow{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .editor input[type=text]{border:1px solid #aab7c4;border-radius:5px;padding:5px 8px;font-size:12px}
  .editor .child{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:12px}
  .editor .child input[type=text]{flex:1}
  .editor h4{margin:8px 0 4px;font-size:11px;text-transform:uppercase;color:#687078}
  .custom-add{display:flex;gap:6px;margin-top:6px}
  .custom-add input{flex:1}
  .cat{font-size:11px;text-transform:uppercase;color:#889;padding:10px 8px 2px;letter-spacing:.04em}
  footer{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #e9ebed}
  footer .spacer{flex:1}
  footer button{padding:7px 14px;border:1px solid #545b64;border-radius:6px;background:#fff;cursor:pointer;font-size:13px}
  footer button.primary{background:#ff9900;border-color:#ff9900;color:#fff;font-weight:600}
  .muted{color:#687078;font-size:12px;padding:6px 16px}
`;

async function ensureLoaded(): Promise<void> {
  const [settings, items, catalog, learned] = await Promise.all([
    loadSettings(),
    loadBar(),
    getCatalog(),
    getLearned(),
  ]);
  state = { settings, items, catalog, learned, search: "", expandedId: null, dragIndex: null };
}

export async function openSettings(): Promise<void> {
  if (document.getElementById(HOST_ID)) return;
  await ensureLoaded();
  const host = document.createElement("div");
  host.id = HOST_ID;
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  const mount = document.createElement("div");
  mount.className = "mount";
  root.appendChild(mount);
  document.documentElement.appendChild(host);
  renderModal();
}

function closeSettings(): void {
  document.getElementById(HOST_ID)?.remove();
  root = null;
  state = null;
}

async function persistBar(): Promise<void> {
  if (!state) return;
  await replaceBar(state.items);
}

async function persistSettings(): Promise<void> {
  if (!state) return;
  await saveSettings(state.settings);
}

function displayTitle(item: BarItem, svc: CatalogService | undefined): string {
  if (item.title) return item.title;
  const label = svc?.label ?? item.id;
  return state!.settings.useShorthand ? shorten(label) : label;
}

function renderModal(): void {
  if (!root || !state) return;
  const mount = root.querySelector(".mount")!;
  mount.replaceChildren();

  const overlay = el("div", "overlay");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSettings();
  });
  const modal = el("div", "modal");
  overlay.appendChild(modal);

  // Header
  const header = document.createElement("header");
  const h2 = document.createElement("h2");
  h2.textContent = "Cross-Account Favorites";
  const close = el("button", "close");
  close.textContent = "✕";
  close.addEventListener("click", closeSettings);
  header.append(h2, close);
  modal.appendChild(header);

  // Toggles
  const toggles = el("div", "toggles");
  toggles.append(
    toggle("Hide native AWS bar", state.settings.hideNativeBar, (v) => {
      state!.settings.hideNativeBar = v;
      void persistSettings();
    }),
    toggle("Show icons", state.settings.showIcons, (v) => {
      state!.settings.showIcons = v;
      void persistSettings();
    }),
    toggle("Use shorthand names", state.settings.useShorthand, (v) => {
      state!.settings.useShorthand = v;
      void persistSettings();
      renderModal();
    }),
    toggle("Auto-learn sub-pages on visit", state.settings.autoLearnSubpages, (v) => {
      state!.settings.autoLearnSubpages = v;
      void persistSettings();
    }),
  );
  modal.appendChild(toggles);

  // Columns
  const cols = el("div", "cols");
  cols.append(renderBarColumn(), renderCatalogColumn());
  modal.appendChild(cols);

  // Footer
  const footer = document.createElement("footer");
  const exportBtn = el("button");
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", exportJson);
  const importBtn = el("button");
  importBtn.textContent = "Import";
  importBtn.addEventListener("click", importJson);
  const spacer = el("div", "spacer");
  const done = el("button", "primary");
  done.textContent = "Done";
  done.addEventListener("click", closeSettings);
  footer.append(exportBtn, importBtn, spacer, done);
  modal.appendChild(footer);

  mount.appendChild(overlay);
}

function renderBarColumn(): HTMLElement {
  const col = el("div", "col left");
  const h3 = document.createElement("h3");
  h3.textContent = `On the bar (${state!.items.length})`;
  col.appendChild(h3);
  const scroll = el("div", "scroll");

  if (state!.items.length === 0) {
    const m = el("div", "muted");
    m.textContent = "Nothing yet. Add services from the right.";
    scroll.appendChild(m);
  }

  state!.items.forEach((item, index) => {
    const svc = serviceById(state!.catalog, item.id);
    const row = el("div", "row item");
    row.draggable = true;

    const handle = el("span", "handle");
    handle.textContent = "⠿";
    row.appendChild(handle);

    if (svc?.icon) {
      const img = document.createElement("img");
      img.src = svc.icon;
      img.alt = "";
      row.appendChild(img);
    }
    const name = el("span", "name");
    name.textContent = displayTitle(item, svc);
    name.title = svc?.url ?? item.id;
    row.appendChild(name);

    const editBtn = el("button");
    editBtn.textContent = state!.expandedId === item.id ? "▾" : "⚙";
    editBtn.title = "Edit title & submenu";
    editBtn.addEventListener("click", () => {
      state!.expandedId = state!.expandedId === item.id ? null : item.id;
      renderModal();
    });
    row.appendChild(editBtn);

    const rm = el("button", "rm-btn");
    rm.textContent = "✕";
    rm.title = "Remove from bar";
    rm.addEventListener("click", () => {
      state!.items = state!.items.filter((i) => i.id !== item.id);
      void persistBar();
      renderModal();
    });
    row.appendChild(rm);

    // Drag reorder
    row.addEventListener("dragstart", () => {
      state!.dragIndex = index;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = state!.dragIndex;
      if (from === null || from === index) return;
      const [moved] = state!.items.splice(from, 1);
      state!.items.splice(index, 0, moved);
      state!.dragIndex = null;
      void persistBar();
      renderModal();
    });

    scroll.appendChild(row);
    if (state!.expandedId === item.id) scroll.appendChild(renderEditor(item, svc));
  });

  col.appendChild(scroll);
  return col;
}

function renderEditor(item: BarItem, svc: CatalogService | undefined): HTMLElement {
  const ed = el("div", "editor");

  // Title override
  const titlerow = el("div", "titlerow");
  const tlabel = document.createElement("span");
  tlabel.textContent = "Label:";
  const tinput = document.createElement("input");
  tinput.type = "text";
  tinput.value = item.title ?? "";
  tinput.placeholder = displayTitle({ ...item, title: undefined }, svc);
  tinput.addEventListener("change", () => {
    item.title = tinput.value.trim() || undefined;
    void persistBar();
    renderModal();
  });
  titlerow.append(tlabel, tinput);
  ed.appendChild(titlerow);

  // Submenu children: vended suggestions as checkboxes
  const h4 = document.createElement("h4");
  h4.textContent = "Submenu items (shown on hover)";
  ed.appendChild(h4);

  // Suggestions = baked/routes catalog children ∪ anything learned at runtime.
  const learned = state!.learned[item.id] ?? [];
  const byPath = new Map<string, ChildSuggestion>();
  for (const c of [...(svc?.children ?? []), ...learned]) {
    if (!byPath.has(c.path)) byPath.set(c.path, c);
  }
  const suggestions = [...byPath.values()];
  const selectedPaths = new Set(item.children.map((c) => c.path));

  if (suggestions.length === 0 && item.children.length === 0) {
    const m = el("div", "muted");
    m.textContent = "No sub-pages known for this service. Add custom ones below.";
    ed.appendChild(m);
  }

  for (const sug of suggestions) {
    const child = el("label", "child");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedPaths.has(sug.path);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        item.children.push({ label: sug.label, path: sug.path });
      } else {
        item.children = item.children.filter((c) => c.path !== sug.path);
      }
      void persistBar();
    });
    const span = document.createElement("span");
    span.textContent = sug.label;
    child.append(cb, span);
    ed.appendChild(child);
  }

  // Custom children already added (not in suggestions)
  const suggestionPaths = new Set(suggestions.map((s) => s.path));
  const customs = item.children.filter((c) => !suggestionPaths.has(c.path));
  for (const c of customs) {
    const child = el("div", "child");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", () => {
      item.children = item.children.filter((x) => x.path !== c.path);
      void persistBar();
      renderModal();
    });
    const span = document.createElement("span");
    span.textContent = `${c.label} — ${c.path}`;
    child.append(cb, span);
    ed.appendChild(child);
  }

  // Add custom child
  const add = el("div", "custom-add");
  const cl = document.createElement("input");
  cl.type = "text";
  cl.placeholder = "Label";
  const cp = document.createElement("input");
  cp.type = "text";
  cp.placeholder = "/service/home#section";
  const cbtn = el("button", "add-btn");
  cbtn.textContent = "Add";
  cbtn.addEventListener("click", () => {
    const label = cl.value.trim();
    const path = cp.value.trim();
    if (!label || !path) return;
    item.children.push({ label, path });
    void persistBar();
    renderModal();
  });
  add.append(cl, cp, cbtn);
  ed.appendChild(add);

  return ed;
}

function renderCatalogColumn(): HTMLElement {
  const col = el("div", "col");
  const h3 = document.createElement("h3");
  h3.textContent = "Add services";
  col.appendChild(h3);

  const search = document.createElement("input");
  search.className = "search";
  search.type = "text";
  search.placeholder = "Search all services…";
  search.value = state!.search;
  search.addEventListener("input", () => {
    state!.search = search.value;
    renderCatalogResults(results);
  });
  col.appendChild(search);

  const results = el("div", "scroll");
  col.appendChild(results);
  renderCatalogResults(results);
  return col;
}

function renderCatalogResults(container: HTMLElement): void {
  container.replaceChildren();
  const cat = state!.catalog;
  if (!cat) {
    const m = el("div", "muted");
    m.textContent = "Service catalog not loaded yet. Open this on a console page.";
    container.appendChild(m);
    return;
  }
  const onBar = new Set(state!.items.map((i) => i.id));
  const q = state!.search.trim().toLowerCase();
  const match = (s: CatalogService) =>
    !q ||
    s.label.toLowerCase().includes(q) ||
    s.id.toLowerCase().includes(q) ||
    s.keywords.toLowerCase().includes(q);

  const catLabel = new Map(cat.categories.map((c) => [c.id, c.label]));
  const groups = new Map<string, CatalogService[]>();
  for (const s of cat.services) {
    if (!match(s)) continue;
    const key = s.categoryId ?? "other";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  let shown = 0;
  for (const [catId, svcs] of groups) {
    const heading = el("div", "cat");
    heading.textContent = catLabel.get(catId) ?? "Other";
    container.appendChild(heading);
    for (const s of svcs) {
      shown++;
      const row = el("div", "row");
      if (s.icon) {
        const img = document.createElement("img");
        img.src = s.icon;
        img.alt = "";
        row.appendChild(img);
      }
      const name = el("span", "name");
      name.textContent = s.label;
      row.appendChild(name);
      const btn = el("button", "add-btn") as HTMLButtonElement;
      const already = onBar.has(s.id);
      btn.textContent = already ? "✓" : "+ Add";
      btn.disabled = already;
      btn.addEventListener("click", () => {
        if (onBar.has(s.id)) return;
        state!.items.push({ id: s.id, children: [] });
        void persistBar();
        renderModal();
      });
      row.appendChild(btn);
      container.appendChild(row);
    }
  }
  if (shown === 0) {
    const m = el("div", "muted");
    m.textContent = "No services match your search.";
    container.appendChild(m);
  }
}

function exportJson(): void {
  const data = {
    settings: state!.settings,
    items: state!.items,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "aws-favorites.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed.items)) {
        state!.items = parsed.items.filter(
          (i: any) => i && typeof i.id === "string" && Array.isArray(i.children),
        );
        await persistBar();
      }
      if (parsed.settings) {
        state!.settings = { ...state!.settings, ...parsed.settings };
        await persistSettings();
      }
      renderModal();
    } catch {
      alert("Invalid favorites JSON.");
    }
  });
  input.click();
}

// ---- tiny DOM helpers ----

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const l = el("label");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  const span = document.createElement("span");
  span.textContent = label;
  l.append(cb, span);
  return l;
}
