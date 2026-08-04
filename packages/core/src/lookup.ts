import type { GamePassCatalog, GamePassCatalogEntry } from "./types";

/**
 * カタログをSteam App IDで検索する。
 * 見つからなければ null。タイトル比較は一切行わない。
 */
export function lookupBySteamAppId(
  catalog: GamePassCatalog,
  appId: number
): GamePassCatalogEntry | null {
  return catalog.entriesBySteamAppId[String(appId)] ?? null;
}

/**
 * 複数のSteam App IDをまとめて検索する。見つかったものだけ返す。
 */
export function lookupManyBySteamAppId(
  catalog: GamePassCatalog,
  appIds: number[]
): Record<string, GamePassCatalogEntry> {
  const result: Record<string, GamePassCatalogEntry> = {};
  for (const appId of appIds) {
    const entry = catalog.entriesBySteamAppId[String(appId)];
    if (entry) {
      result[String(appId)] = entry;
    }
  }
  return result;
}

/**
 * このエントリがPC Game Passで「今プレイできる」対象かどうか。
 *
 * 偽陽性（対象外を対象と誤表示）を最優先で防ぐため、
 * status / platform / plan のすべてを満たす場合のみ true を返す。
 */
export function isAvailableOnPcGamePass(entry: GamePassCatalogEntry): boolean {
  return (
    entry.status === "available" &&
    entry.platforms.includes("pc") &&
    (entry.plans.includes("pc-game-pass") || entry.plans.includes("ultimate"))
  );
}

/**
 * confidenceがしきい値を満たすか。低信頼のエントリは表示しない。
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.98;

export function isConfidentEnough(
  entry: GamePassCatalogEntry,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): boolean {
  return entry.match.confidence >= threshold;
}
