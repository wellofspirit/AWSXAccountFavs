import { expect, test, describe } from "bun:test";
import { shorten } from "../src/lib/shorthand";

describe("shorten", () => {
  test("maps known long names", () => {
    expect(shorten("Elastic Container Service")).toBe("ECS");
    expect(shorten("Amazon OpenSearch Service")).toBe("OpenSearch");
    expect(shorten("Billing and Cost Management")).toBe("Billing");
    expect(shorten("Systems Manager")).toBe("SSM");
  });

  test("passes through unknown names unchanged", () => {
    expect(shorten("CloudWatch")).toBe("CloudWatch");
    expect(shorten("Lambda")).toBe("Lambda");
  });
});
