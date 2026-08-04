import type { GamePassCatalog } from "./types";

/**
 * chrome.storage.local に保存するカタログキャッシュの形。
 * Millennium版でも同じ形をそれぞれのストレージに保存する。
 */
export interface CatalogCache {
  etag?: string;
  /** epoch millis */
  fetchedAt: number;
  catalog: GamePassCatalog;
}

export const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * キャッシュが古く、バックグラウンド更新すべきかどうか。
 * キャッシュ自体は取得失敗時も削除しないため、これは「更新を試みるべきか」の判定のみ。
 */
export function isCacheStale(
  cache: Pick<CatalogCache, "fetchedAt">,
  now: number,
  ttl: number = CACHE_TTL
): boolean {
  return now - cache.fetchedAt >= ttl;
}

/**
 * カタログ取得の結果種別。
 * - not-modified: 304。中身は変わらず取得時刻だけ更新。
 * - updated: 200。新しいカタログで置き換え。
 * - failed: 取得失敗。既存キャッシュを保持する。
 */
export type CatalogFetchOutcome =
  | { kind: "not-modified" }
  | { kind: "updated"; catalog: GamePassCatalog; etag?: string }
  | { kind: "failed" };

/**
 * 取得結果を既存キャッシュへ反映した次の状態を返す（純粋関数）。
 * 取得失敗時は既存キャッシュを削除・上書きしない。
 */
export function applyFetchOutcome(
  existing: CatalogCache | null,
  outcome: CatalogFetchOutcome,
  now: number
): CatalogCache | null {
  switch (outcome.kind) {
    case "not-modified":
      return existing ? { ...existing, fetchedAt: now } : null;
    case "updated":
      return {
        catalog: outcome.catalog,
        fetchedAt: now,
        ...(outcome.etag ? { etag: outcome.etag } : {}),
      };
    case "failed":
      return existing;
  }
}
