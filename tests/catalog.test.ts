import { expect, test, describe } from "bun:test";
import { deriveChildren } from "../src/lib/catalog";

describe("deriveChildren", () => {
  test("keeps one-level sub-routes and prettifies labels", () => {
    const children = deriveChildren("/systems-manager/home", [
      { path: "/systems-manager/parameters" },
      { path: "/systems-manager/session-manager" },
      { path: "/systems-manager/patch-manager" },
      { path: "/systems-manager" }, // base, dropped
    ]);
    const labels = children.map((c) => c.label);
    expect(labels).toEqual(["Parameters", "Patch Manager", "Session Manager"]); // sorted
    expect(children.find((c) => c.label === "Session Manager")?.path).toBe(
      "/systems-manager/session-manager",
    );
  });

  test("drops internal/noise routes", () => {
    const children = deriveChildren("/ec2/home", [
      { path: "/ec2consoleapis" },
      { path: "/ec2/pricing" },
      { path: "/ec2nav" },
      { path: "/ec2/nav" },
      { path: "/ec2/autoscaling" },
    ]);
    expect(children.map((c) => c.label)).toEqual(["Autoscaling"]);
  });

  test("drops deeper-than-one-level routes", () => {
    const children = deriveChildren("/svc/home", [
      { path: "/svc/a" },
      { path: "/svc/a/b" }, // two levels deep, dropped
    ]);
    expect(children.map((c) => c.path)).toEqual(["/svc/a"]);
  });

  test("drops params, wildcards, version prefixes and home", () => {
    const children = deriveChildren("/ecs/home", [
      { path: "/ecs/v2" },
      { path: "/ecs/:clusterName" },
      { path: "/ecs/*" },
      { path: "/ecs/{id}" },
      { path: "/ecs/home" },
      { path: "/ecs/task-definitions" },
    ]);
    expect(children.map((c) => c.path)).toEqual(["/ecs/task-definitions"]);
  });

  test("empty routes yields no children", () => {
    expect(deriveChildren("/s3/home", [])).toEqual([]);
  });
});

describe("baked subpages.json", () => {
  test("paths are origin-relative, region-free and unique per service", async () => {
    const data: Record<string, Array<{ label: string; path: string }>> = (
      await import("../src/data/subpages.json")
    ).default;
    for (const [sid, items] of Object.entries(data)) {
      expect(items.length).toBeGreaterThan(0);
      const paths = new Set<string>();
      for (const { label, path } of items) {
        const where = `${sid}: ${label} -> ${path}`;
        expect(label.trim().length > 1 ? "" : where).toBe("");
        expect(/^\/[^/]/.test(path) && !/\s|region=|\.html\b/.test(path) ? "" : where).toBe("");
        expect(paths.has(path) ? where : "").toBe("");
        paths.add(path);
      }
    }
  });
});
