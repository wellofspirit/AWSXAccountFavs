#!/usr/bin/env python3
"""Crawl the left navigation of every AWS Management Console service and bake a
sub-pages dataset. Idempotent: skips services already in the output file.

Prerequisites:
  1. A browser-automation CLI on PATH named `browser`, attached to a browser
     session that is signed in to the AWS Management Console. It must support:
       browser navigate <url>
       browser evaluate <js>   -> prints JSON {"result": <value>}
     Any automation tool can fill this role behind a thin wrapper.
  2. `.crawl/catalog.json` — the console service catalog, copied from the
     console page's localStorage key `cctConfigDataCache`, as an array of
     {id, url, label, regions}.
Then: `python3 crawl.py` -> writes `.crawl/subpages_raw.json`; then
`python3 postprocess.py` -> writes `src/data/subpages.json`.

The raw crawl output can contain resources from the signed-in AWS account
(resource IDs, names). `.crawl/` is git-ignored; only the post-processed,
resource-free dataset is committed."""
import json, subprocess, time, os

SP = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".crawl")
CATALOG = f"{SP}/catalog.json"
OUT = f"{SP}/subpages_raw.json"
PREF_REGIONS = ["us-east-1", "us-west-2", "us-east-2", "eu-west-1", "ap-southeast-2", "eu-central-1"]

def pick_region(regions):
    if not regions:
        return "us-east-1"  # empty list => global service
    if "us-east-1" in regions:
        return "us-east-1"
    for r in PREF_REGIONS:
        if r in regions:
            return r
    return regions[0]

def sh(args, timeout=40):
    try:
        r = subprocess.run(["browser", *args], capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception as e:
        return json.dumps({"error": str(e)})

def evaluate(expr, timeout=40):
    out = sh(["evaluate", expr], timeout=timeout)
    try:
        obj = json.loads(out)
        return obj.get("result")
    except Exception:
        return None

def base_of(url):
    b = url.split("?")[0]
    if b.endswith("/home"):
        b = b[: -len("/home")]
    return b.rstrip("/")

# JS: scrape one-level sub-pages. Captures two nav patterns:
#  - path-based relative links under the service base (S3, ECS, SSM): /base/xxx
#  - bare-hash links resolving against the current page (EC2, VPC): #Instances:
# Bare-hash (href^="#") excludes the region switcher, which uses absolute URLs.
SCRAPE = r"""
(() => {
  const base=%s;
  const home=location.pathname;
  const pretty=s=>s.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim();
  const seen=new Set(); const out=[];
  const push=(label,path)=>{ if(!label||label.length>40)return; if(/^skip to/i.test(label))return; if(path.endsWith('#c')||path.endsWith('#'))return; if(seen.has(path))return; seen.add(path); out.push({label,path}); };
  for(const a of document.querySelectorAll('a[href]')){
    const raw=a.getAttribute('href')||'';
    const label=(a.textContent||'').replace(/\s+/g,' ').trim();
    if(raw.startsWith(base+'/')){
      const path=raw.split(/[?#]/)[0];
      const rest=path.slice(base.length+1);
      if(!rest || rest.includes('/') || rest==='home') continue;
      push(label||pretty(rest), path);
    } else if(raw.startsWith('#') && raw.length>1){
      push(label, home+raw);
    }
  }
  return JSON.stringify(out);
})()
"""

def scrape(base):
    res = evaluate(SCRAPE % json.dumps(base))
    if not res:
        return []
    try:
        return json.loads(res)
    except Exception:
        return []

# Open a collapsed side navigation so its links are in the DOM. Only clicks
# controls that clearly *open* nav (open/expand/show label, or aria-expanded
# =false); never a close/collapse control, so it's safe to re-run each tick.
EXPAND = r"""
(() => {
  const nav=/navigation/i, close=/(close|collapse|hide)/i;
  let n=0;
  // 1) Open the side panel. Gate on aria-expanded!=='true' so we never
  //    re-click (and thereby close) a panel that is already open.
  for(const b of document.querySelectorAll('button,[role=button]')){
    const al=(b.getAttribute('aria-label')||'')+' '+(b.getAttribute('title')||'');
    if(nav.test(al) && !close.test(al) && b.getAttribute('aria-expanded')!=='true'){
      try{ b.click(); n++; }catch(e){}
    }
  }
  // 2) Expand collapsed group nodes inside the left nav strip (below the
  //    header, left column) so their child links mount. Position-scoped to
  //    avoid the header's region/account/settings menus.
  for(const b of document.querySelectorAll('button[aria-expanded="false"]')){
    const r=b.getBoundingClientRect();
    if(r.left<340 && r.top>95 && r.width>0 && r.height>0){ try{ b.click(); n++; }catch(e){} }
  }
  return n;
})()
"""

def expand():
    evaluate(EXPAND, timeout=20)

def load_out():
    if os.path.exists(OUT):
        return json.load(open(OUT))
    return {}

def main():
    services = json.load(open(CATALOG))
    done = load_out()
    total = len(services)
    for i, s in enumerate(services):
        sid = s["id"]
        # Re-crawl entries with no real children (nav didn't render, or was
        # only the skip-link on the prior pass).
        if sid in done and len(done[sid]["children"]) >= 1:
            continue
        base = base_of(s["url"])
        region = pick_region(s.get("regions", []))
        origin = f"https://{region}.console.aws.amazon.com"
        url = f"{origin}{s['url']}"
        url += ("&" if "?" in url else "?") + f"region={region}"
        sh(["navigate", url], timeout=40)
        time.sleep(1.4)  # let the app shell mount before touching the nav
        # Poll up to ~10s; expand a collapsed nav while the count is low, keep
        # the largest result, and stop once it stabilizes (not on first sight).
        best = []
        stable = 0
        for _ in range(16):
            expand()  # progressively opens the panel and nested groups
            time.sleep(0.6)
            cur = scrape(base)
            if len(cur) > len(best):
                best = cur
                stable = 0
            else:
                stable += 1
            # Stop once the count has held steady for two ticks (groups done).
            if len(best) >= 3 and stable >= 2:
                break
        found = best
        done[sid] = {"label": s["label"], "url": s["url"], "region": region,
                     "base": base, "children": found}
        json.dump(done, open(OUT, "w"), indent=0)
        print(f"[{i+1}/{total}] {sid} ({region}): {len(found)} sub-pages", flush=True)
    print("DONE. services with children:", sum(1 for v in done.values() if v['children']))

if __name__ == "__main__":
    main()
