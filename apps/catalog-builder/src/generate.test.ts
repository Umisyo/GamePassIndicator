import { describe, expect, it } from "vitest";
import { generateCatalog } from "./generate";
import type { MatchedEntry, RawGamePassEntry } from "./types";

function matched(overrides: Partial<MatchedEntry> = {}): MatchedEntry {
  const xbox: RawGamePassEntry = {
    xboxProductId: "PROD1",
    title: "ELDEN RING",
    xboxUrl: "https://www.xbox.com/ja-JP/games/store/-/PROD1",
    platforms: ["pc"],
    plans: ["pc-game-pass", "ultimate"],
    regions: ["JP"],
    status: "available",
  };
  return {
    xbox,
    steamAppIds: [1245620],
    method: "exact-title",
    confidence: 0.99,
    ...overrides,
  };
}

const opts = {
  region: "ja-JP",
  generatedAt: "2026-08-03T03:00:00.000Z",
  threshold: 0.98,
};

describe("generateCatalog", () => {
  it("Steam App IDをキーにエントリを生成する", () => {
    const { catalog } = generateCatalog([matched()], opts);
    expect(catalog.region).toBe("ja-JP");
    const entry = catalog.entriesBySteamAppId["1245620"];
    expect(entry?.canonicalTitle).toBe("ELDEN RING");
    expect(entry?.normalizedTitle).toBe("elden ring");
    expect(entry?.updatedAt).toBe(opts.generatedAt);
    expect(entry?.match).toEqual({ method: "exact-title", confidence: 0.99 });
  });

  it("複数App IDは同一内容のエントリを指す", () => {
    const { catalog } = generateCatalog([matched({ steamAppIds: [1, 2] })], opts);
    expect(catalog.entriesBySteamAppId["1"]).toEqual(
      catalog.entriesBySteamAppId["2"]
    );
  });

  it("閾値未満は出力しない", () => {
    const { catalog } = generateCatalog(
      [matched({ method: "fuzzy", confidence: 0.9 })],
      opts
    );
    expect(Object.keys(catalog.entriesBySteamAppId)).toHaveLength(0);
  });

  it("同一ゲームの別SKUは重複排除して最良を採用（競合ではない）", () => {
    const a = matched({ method: "alias", confidence: 0.98 });
    const b = matched({
      xbox: { ...matched().xbox, xboxProductId: "PROD2" },
      method: "exact-title",
      confidence: 0.99,
    });
    const { catalog, conflicts } = generateCatalog([a, b], opts);
    expect(conflicts).toHaveLength(0);
    // confidenceが高い exact-title(PROD2) を採用
    expect(catalog.entriesBySteamAppId["1245620"]?.id).toBe("PROD2");
  });

  it("別ゲームが同一App IDに衝突したら conflicts に記録し最良を採用", () => {
    const a = matched({ confidence: 0.99 });
    const b = matched({
      xbox: { ...matched().xbox, xboxProductId: "PROD2", title: "Another Game" },
      confidence: 0.985,
    });
    const { catalog, conflicts } = generateCatalog([a, b], opts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.steamAppId).toBe(1245620);
    expect(catalog.entriesBySteamAppId["1245620"]?.id).toBe("PROD1");
  });
});
