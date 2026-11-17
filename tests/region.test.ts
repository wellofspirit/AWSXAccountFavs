import { expect, test, describe } from "bun:test";
import {
  regionFromUrl,
  rewriteRegion,
  canonicalUrl,
  buildHref,
  withRegion,
  REGION_RE,
} from "../src/lib/region";

describe("regionFromUrl", () => {
  test("reads region from query param", () => {
    expect(regionFromUrl(new URL("https://us-east-1.console.aws.amazon.com/ec2/home?region=ap-southeast-2")))
      .toBe("ap-southeast-2");
  });

  test("falls back to region-shaped hostname label", () => {
    expect(regionFromUrl(new URL("https://eu-west-1.console.aws.amazon.com/console/home#")))
      .toBe("eu-west-1");
  });

  test("handles multi-session subdomain host", () => {
    expect(regionFromUrl(new URL("https://acct-abc123.us-east-1.console.aws.amazon.com/vpc/home")))
      .toBe("us-east-1");
  });

  test("reads region from hash when not in query", () => {
    expect(regionFromUrl(new URL("https://console.aws.amazon.com/cloudwatch/home#dashboards?region=us-gov-west-1")))
      .toBe("us-gov-west-1");
  });

  test("returns null when no region present", () => {
    expect(regionFromUrl(new URL("https://console.aws.amazon.com/iam/home"))).toBeNull();
  });

  test("REGION_RE rejects non-region hostname labels", () => {
    expect(REGION_RE.test("console")).toBe(false);
    expect(REGION_RE.test("us-east-1")).toBe(true);
    expect(REGION_RE.test("us-gov-west-1")).toBe(true);
    expect(REGION_RE.test("us-iso-east-1")).toBe(true);
  });
});

describe("rewriteRegion", () => {
  test("rewrites query param region", () => {
    expect(rewriteRegion("/ec2/home?region=us-east-1", "ap-southeast-2"))
      .toBe("/ec2/home?region=ap-southeast-2");
  });

  test("rewrites region in both query and hash", () => {
    expect(rewriteRegion("/cw/home?region=us-east-1#d?region=us-east-1", "eu-west-1"))
      .toBe("/cw/home?region=eu-west-1#d?region=eu-west-1");
  });

  test("leaves global-service URLs (no region) untouched", () => {
    expect(rewriteRegion("/iam/home#/users", "ap-southeast-2")).toBe("/iam/home#/users");
  });

  test("null target region is a no-op", () => {
    expect(rewriteRegion("/ec2/home?region=us-east-1", null)).toBe("/ec2/home?region=us-east-1");
  });
});

describe("canonicalUrl", () => {
  test("same service+region-agnostic path collapses to one key", () => {
    const a = canonicalUrl("/ec2/home?region=us-east-1");
    const b = canonicalUrl("/ec2/home?region=ap-southeast-2");
    expect(a).toBe(b);
  });

  test("different paths stay distinct", () => {
    expect(canonicalUrl("/ec2/home?region=us-east-1"))
      .not.toBe(canonicalUrl("/s3/home?region=us-east-1"));
  });
});

describe("buildHref", () => {
  test("keeps current session origin and rewrites region to current", () => {
    const href = buildHref(
      "/ec2/home?region=us-east-1",
      "https://acct-x.ap-southeast-2.console.aws.amazon.com",
      "ap-southeast-2",
    );
    expect(href).toBe("https://acct-x.ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2");
  });

  test("global service href gets no region injected", () => {
    const href = buildHref(
      "/iam/home#/users",
      "https://us-east-1.console.aws.amazon.com",
      "ap-southeast-2",
    );
    expect(href).toBe("https://us-east-1.console.aws.amazon.com/iam/home#/users");
  });
});

describe("withRegion", () => {
  test("appends region param to a regional catalog path", () => {
    expect(withRegion("/ec2/home", "ap-southeast-2", false)).toBe(
      "/ec2/home?region=ap-southeast-2",
    );
  });

  test("uses & when a query string already exists", () => {
    expect(withRegion("/ec2/home?foo=1", "us-east-1", false)).toBe(
      "/ec2/home?foo=1&region=us-east-1",
    );
  });

  test("inserts region before an existing hash", () => {
    expect(withRegion("/cw/home#dashboards", "eu-west-1", false)).toBe(
      "/cw/home?region=eu-west-1#dashboards",
    );
  });

  test("rewrites an existing region param instead of duplicating", () => {
    expect(withRegion("/ec2/home?region=us-east-1", "ap-southeast-2", false)).toBe(
      "/ec2/home?region=ap-southeast-2",
    );
  });

  test("leaves global services bare", () => {
    expect(withRegion("/iam/home", "ap-southeast-2", true)).toBe("/iam/home");
  });

  test("no-op when region is null", () => {
    expect(withRegion("/ec2/home", null, false)).toBe("/ec2/home");
  });
});
