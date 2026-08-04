import { describe, expect, it } from "vitest";
import {
  isAvailableOnPcGamePass,
  isConfidentEnough,
  lookupBySteamAppId,
  lookupManyBySteamAppId,
} from "./lookup";
import type { GamePassCatalog, GamePassCatalogEntry } from "./types";

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

const catalog: GamePassCatalog = {
  schemaVersion: 1,
  generatedAt: "2026-08-03T03:00:00.000Z",
  region: "ja-JP",
  entriesBySteamAppId: {
    "123456": makeEntry(),
  },
};

describe("lookupBySteamAppId", () => {
  it("App IDで一致するエントリを返す", () => {
    expect(lookupBySteamAppId(catalog, 123456)?.id).toBe("test");
  });

  it("存在しないApp IDはnull", () => {
    expect(lookupBySteamAppId(catalog, 999999)).toBeNull();
  });
});

describe("lookupManyBySteamAppId", () => {
  it("見つかったApp IDのみ返す", () => {
    const result = lookupManyBySteamAppId(catalog, [123456, 999999]);
    expect(Object.keys(result)).toEqual(["123456"]);
    expect(result["123456"]?.id).toBe("test");
  });

  it("空配列なら空オブジェクト", () => {
    expect(lookupManyBySteamAppId(catalog, [])).toEqual({});
  });
});

describe("isAvailableOnPcGamePass", () => {
  it("available + pc + pc-game-pass なら true", () => {
    expect(isAvailableOnPcGamePass(makeEntry())).toBe(true);
  });

  it("ultimate プランでも true", () => {
    expect(
      isAvailableOnPcGamePass(makeEntry({ plans: ["ultimate"] }))
    ).toBe(true);
  });

  it("consoleのみは false", () => {
    expect(
      isAvailableOnPcGamePass(
        makeEntry({ platforms: ["console"], plans: ["ultimate"] })
      )
    ).toBe(false);
  });

  it("coming-soon は false", () => {
    expect(
      isAvailableOnPcGamePass(makeEntry({ status: "coming-soon" }))
    ).toBe(false);
  });

  it("ea-play のみは false", () => {
    expect(
      isAvailableOnPcGamePass(makeEntry({ plans: ["ea-play"] }))
    ).toBe(false);
  });
});

describe("isConfidentEnough", () => {
  it("しきい値以上は true", () => {
    expect(isConfidentEnough(makeEntry({ match: { method: "exact-title", confidence: 0.99 } }))).toBe(true);
  });

  it("しきい値未満は false", () => {
    expect(isConfidentEnough(makeEntry({ match: { method: "fuzzy", confidence: 0.9 } }))).toBe(false);
  });
});
