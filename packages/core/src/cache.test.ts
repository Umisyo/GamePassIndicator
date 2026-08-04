import { describe, expect, it } from "vitest";
import { applyFetchOutcome, CACHE_TTL, isCacheStale } from "./cache";
import type { CatalogCache } from "./cache";
import type { GamePassCatalog } from "./types";

const catalog: GamePassCatalog = {
  schemaVersion: 1,
  generatedAt: "2026-08-03T03:00:00.000Z",
  region: "ja-JP",
  entriesBySteamAppId: {},
};

describe("isCacheStale", () => {
  const now = 1_000_000_000_000;

  it("TTL未満なら stale ではない", () => {
    expect(isCacheStale({ fetchedAt: now - 1000 }, now)).toBe(false);
  });

  it("TTLちょうどで stale", () => {
    expect(isCacheStale({ fetchedAt: now - CACHE_TTL }, now)).toBe(true);
  });

  it("TTL超過で stale", () => {
    expect(isCacheStale({ fetchedAt: now - CACHE_TTL - 1 }, now)).toBe(true);
  });
});

describe("applyFetchOutcome", () => {
  const now = 2_000;
  const existing: CatalogCache = { etag: "v1", fetchedAt: 1_000, catalog };

  it("updated は新カタログとetagで置き換え、fetchedAtを更新", () => {
    const next = applyFetchOutcome(existing, { kind: "updated", catalog, etag: "v2" }, now);
    expect(next).toEqual({ catalog, fetchedAt: now, etag: "v2" });
  });

  it("not-modified は中身を保ちfetchedAtだけ更新", () => {
    const next = applyFetchOutcome(existing, { kind: "not-modified" }, now);
    expect(next).toEqual({ etag: "v1", fetchedAt: now, catalog });
  });

  it("failed は既存キャッシュを保持する", () => {
    const next = applyFetchOutcome(existing, { kind: "failed" }, now);
    expect(next).toBe(existing);
  });

  it("キャッシュ無しでfailedならnullのまま", () => {
    expect(applyFetchOutcome(null, { kind: "failed" }, now)).toBeNull();
  });
});
