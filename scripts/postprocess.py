#!/usr/bin/env python3
"""Clean the crawled sub-pages into the baked dataset shipped with the
extension: { serviceId: [{label, path}, ...] }."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = f"{HERE}/.crawl/subpages_raw.json"
OUT = os.path.normpath(f"{HERE}/../src/data/subpages.json")

def clean_label(l):
    l = re.sub(r"\s+", " ", l or "").strip()
    return re.sub(r"^Go to (\w)", lambda m: m.group(1).upper(), l)  # "Go to workflows" -> "Workflows"

def clean_path(p):
    # Baked paths must be region-free; the bar re-adds the current region.
    return re.sub(r"\?region=[a-z0-9-]+$", "", p)

def norm_dest(p):
    # "#/x", "#x", "#/x/" and "#/x?" all land on the same page.
    return re.sub(r"[/?:]+$", "", p.replace("#/", "#")).lower()

def norm_name(l):
    return re.sub(r"^(amazon|aws) |\s*\(.*\)$", "", l.lower()).strip()

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
# Service landing pages, linked from the nav header (same place the bar item goes).
LANDING = r"(#!?/?|#/?(home|homepage|homePage|landing|landing-page|welcome|firstRun))$|/(welcome|landing|homepage)$"
NON_NAV = r"^(what'?s new\b|tutorials?$|feedback$|share feedback$|customer survey$|contact sales$|here$|all$)"

def keep(child, service_label):
    label = clean_label(child["label"])
    path = child["path"]
    if not label or len(label) < 2:
        return False
    if re.match(r"^skip to", label, re.I):
        return False
    if re.match(r"^\d+\+?(\s|$)", label):  # count badges: "49", "50+", "1 active budget(s)"
        return False
    if re.match(NON_NAV, label, re.I):
        return False
    if label.lower() == (service_label or "").lower():
        return False  # redundant self-link
    if re.search(LANDING, path, re.I) and (
        re.match(r"(amazon|aws) ", label, re.I) or norm_name(label) == norm_name(service_label or "")
    ):
        return False  # nav-header link back to the service's own landing page
    if re.search(UUID, path, re.I) or re.search(r"[/#](?=[A-Za-z0-9]*\d[A-Za-z0-9]*\d[A-Za-z0-9]*\d)[A-Za-z0-9]{12,}(/|$)", path):
        return False  # a specific resource in the crawl account (event, distribution, ...)
    if "%20" in path or re.search(r"#dashboards/.+/", path):
        return False  # a user-named resource, e.g. a named CloudWatch dashboard
    if re.match(r"^[\w.-]+(/[\w.-]+)+$", label):
        return False  # resource name as label, e.g. a secret "app/team/key"
    if re.search(r"\s|\.html\b|null-link|#!$|#/(useCase|service)-[A-Z]", path):
        return False  # docs pages, placeholder anchors, OpenSearch blueprint filter facets
    if re.search(r"/create\b|create[A-Z]|-create\b|/add$|/add-widgets$|[?&]trigger", path):
        return False  # actions (create/add/trigger), not pages
    if re.match(r"^(create|getting started|get started)\b", label, re.I):
        return False
    if path.endswith("#c") or path.endswith("#"):
        return False
    if re.search(r"/(get-?started|getStarted|create-)", path):
        return False
    return True

def main():
    raw = json.load(open(RAW))
    out = {}
    total_children = 0
    for sid, info in raw.items():
        label = info.get("label", "")
        seen = set()
        kept = []
        for c in info.get("children", []):
            if not keep(c, label):
                continue
            p = clean_path(c["path"])
            if norm_dest(p) in seen:
                continue
            seen.add(norm_dest(p))
            kept.append({"label": clean_label(c["label"]), "path": p})
        if kept:
            out[sid] = kept[:40]  # bound per-service size
            total_children += len(out[sid])
    # Stable ordering for a clean diff.
    out = {k: out[k] for k in sorted(out)}
    json.dump(out, open(OUT, "w"), indent=1, sort_keys=False)
    print(f"services with sub-pages: {len(out)}")
    print(f"total sub-pages: {total_children}")
    # spot check key services
    for k in ["ec2", "ecs", "s3", "vpc", "dynamodbv2", "systems-manager", "rds", "cw", "iam-console", "lam"]:
        if k in out:
            print(f"  {k}: {len(out[k])} -> {', '.join(c['label'] for c in out[k][:8])}")
        else:
            print(f"  {k}: (none)")

if __name__ == "__main__":
    main()
