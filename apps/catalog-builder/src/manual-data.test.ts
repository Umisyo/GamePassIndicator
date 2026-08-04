import { describe, expect, it } from "vitest";
import { normalizeGameTitle } from "@gamepass-indicator/core";
import { buildManualContext } from "./manual-data";

describe("buildManualContext", () => {
  it("overrides を productId 逆引きにする", () => {
    const ctx = buildManualContext({
      overrides: {
        "111": { xboxProductId: "PROD1" },
        "222": { xboxProductId: "PROD1" },
        "333": { xboxProductId: "PROD2" },
      },
      exclusions: {},
      aliases: {},
    });
    expect(ctx.overrideByProductId.get("PROD1")).toEqual([111, 222]);
    expect(ctx.overrideByProductId.get("PROD2")).toEqual([333]);
  });

  it("exclusions は exclude=true のみ集める", () => {
    const ctx = buildManualContext({
      overrides: {},
      exclusions: {
        "111": { exclude: true },
        "222": { exclude: false },
      },
      aliases: {},
    });
    expect(ctx.exclusions.has(111)).toBe(true);
    expect(ctx.exclusions.has(222)).toBe(false);
  });

  it("aliases は正規化して同一グループにまとめる", () => {
    const ctx = buildManualContext({
      overrides: {},
      exclusions: {},
      aliases: { "Game A": ["Game A: Complete Edition", "Game A Deluxe"] },
    });
    const g1 = ctx.aliasGroupOf.get(normalizeGameTitle("Game A"));
    const g2 = ctx.aliasGroupOf.get(normalizeGameTitle("Game A: Complete Edition"));
    expect(g1).toBeDefined();
    expect(g1).toBe(g2);
  });

  it("不正なApp IDキーは例外", () => {
    expect(() =>
      buildManualContext({
        overrides: { abc: { xboxProductId: "PROD1" } },
        exclusions: {},
        aliases: {},
      })
    ).toThrow();
  });
});
