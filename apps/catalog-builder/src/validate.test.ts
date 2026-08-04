import { describe, expect, it } from "vitest";
import type { GamePassCatalog, GamePassCatalogEntry } from "@gamepass-indicator/core";
import { CatalogValidationError, validateCatalog } from "./validate";

function entry(overrides: Partial<GamePassCatalogEntry> = {}): GamePassCatalogEntry {
  return {
    id: "PROD1",
    canonicalTitle: "Example Game",
    normalizedTitle: "example game",
    aliases: [],
    xboxUrl: "https://www.xbox.com/ja-JP/games/store/-/PROD1",
    platforms: ["pc"],
    plans: ["pc-game-pass"],
    regions: ["JP"],
    status: "available",
    steamAppIds: [123],
    match: { method: "manual", confidence: 1 },
    updatedAt: "2026-08-03T03:00:00.000Z",
    ...overrides,
  };
}

function catalog(entries: Record<string, GamePassCatalogEntry>): GamePassCatalog {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-03T03:00:00.000Z",
    region: "ja-JP",
    entriesBySteamAppId: entries,
  };
}

describe("validateCatalog", () => {
  it("正常なカタログは通る", () => {
    expect(() =>
      validateCatalog(catalog({ "123": entry() }), { previousEntryCount: 1 })
    ).not.toThrow();
  });

  it("0件はエラー", () => {
    expect(() => validateCatalog(catalog({}), { previousEntryCount: 0 })).toThrow(
      CatalogValidationError
    );
  });

  it("PC非対応なのにPCプランはエラー", () => {
    const bad = entry({ platforms: ["console"], plans: ["pc-game-pass"] });
    expect(() =>
      validateCatalog(catalog({ "123": bad }), { previousEntryCount: 1 })
    ).toThrow(/PC非対応/);
  });

  it("キーが steamAppIds に含まれないとエラー", () => {
    const bad = entry({ steamAppIds: [999] });
    expect(() =>
      validateCatalog(catalog({ "123": bad }), { previousEntryCount: 1 })
    ).toThrow(/steamAppIds/);
  });

  it("大量削除は公開を止める", () => {
    expect(() =>
      validateCatalog(catalog({ "123": entry() }), { previousEntryCount: 100 })
    ).toThrow(/削除率/);
  });

  it("xboxUrl欠落はエラー", () => {
    const bad = entry({ xboxUrl: "" });
    expect(() =>
      validateCatalog(catalog({ "123": bad }), { previousEntryCount: 1 })
    ).toThrow(CatalogValidationError);
  });
});
