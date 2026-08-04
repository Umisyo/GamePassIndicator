import { describe, expect, it } from "vitest";
import { buildRenderModel, DEFAULT_SETTINGS } from "./render-model";
import type { GamePassCatalogEntry } from "./types";

function makeEntry(
  overrides: Partial<GamePassCatalogEntry> = {}
): GamePassCatalogEntry {
  return {
    id: "test",
    canonicalTitle: "Test Game",
    normalizedTitle: "test game",
    aliases: [],
    xboxUrl: "https://www.xbox.com/ja-JP/games/store/test/TEST",
    platforms: ["pc"],
    plans: ["pc-game-pass"],
    regions: ["JP"],
    status: "available",
    steamAppIds: [123456],
    match: { method: "manual", confidence: 1 },
    updatedAt: "2026-08-03T03:00:00.000Z",
    ...overrides,
  };
}

describe("buildRenderModel", () => {
  it("対象作品では表示モデルを生成する", () => {
    const model = buildRenderModel(makeEntry());
    expect(model).not.toBeNull();
    expect(model?.heading).toBe("Xbox Game Pass");
    expect(model?.linkUrl).toBe(makeEntry().xboxUrl);
  });

  it("confidenceが低い場合は null", () => {
    const model = buildRenderModel(
      makeEntry({ match: { method: "fuzzy", confidence: 0.8 } })
    );
    expect(model).toBeNull();
  });

  it("PC非対象は null", () => {
    const model = buildRenderModel(
      makeEntry({ platforms: ["console"], plans: ["ultimate"] })
    );
    expect(model).toBeNull();
  });

  it("showLeavingDate が true かつ leavingAt があれば含める", () => {
    const model = buildRenderModel(
      makeEntry({ status: "available", leavingAt: "2026-09-01T00:00:00.000Z" }),
      { ...DEFAULT_SETTINGS, showLeavingDate: true }
    );
    expect(model?.leavingAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("showLeavingDate が false なら leavingAt を含めない", () => {
    const model = buildRenderModel(
      makeEntry({ leavingAt: "2026-09-01T00:00:00.000Z" }),
      { ...DEFAULT_SETTINGS, showLeavingDate: false }
    );
    expect(model?.leavingAt).toBeUndefined();
  });
});
