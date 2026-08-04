import { normalizeGameTitle } from "@gamepass-indicator/core";
import type {
  GamePassCatalog,
  GamePassCatalogEntry,
  MatchMethod,
} from "@gamepass-indicator/core";
import type { MatchedEntry } from "./types";

export interface GenerateOptions {
  region: string;
  /** ISO文字列。Date.now() を純粋関数に持ち込まないため外から渡す。 */
  generatedAt: string;
  /** これ未満のconfidenceは出力しない（防御的二重チェック）。 */
  threshold: number;
}

/** 別ゲームが同一Steam App IDに衝突したケース（要手動exclusion）。 */
export interface SteamAppIdConflict {
  steamAppId: number;
  titles: string[];
}

export interface GenerateResult {
  catalog: GamePassCatalog;
  conflicts: SteamAppIdConflict[];
}

const METHOD_RANK: Record<MatchMethod, number> = {
  manual: 5,
  "product-id": 4,
  "exact-title": 3,
  alias: 2,
  fuzzy: 1,
};

/** 同じApp IDを複数エントリが主張したときの採用優先度（confidence→方式→ID安定順）。 */
function isBetter(a: MatchedEntry, b: MatchedEntry): boolean {
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  const ra = METHOD_RANK[a.method];
  const rb = METHOD_RANK[b.method];
  if (ra !== rb) return ra > rb;
  return a.xbox.xboxProductId < b.xbox.xboxProductId;
}

function toEntry(m: MatchedEntry, generatedAt: string): GamePassCatalogEntry {
  const { xbox } = m;
  return {
    id: xbox.xboxProductId,
    canonicalTitle: xbox.title,
    normalizedTitle: normalizeGameTitle(xbox.title),
    aliases: [],
    xboxUrl: xbox.xboxUrl,
    platforms: xbox.platforms,
    plans: xbox.plans,
    regions: xbox.regions,
    status: xbox.status,
    steamAppIds: [...m.steamAppIds],
    match: { method: m.method, confidence: m.confidence },
    updatedAt: generatedAt,
    ...(xbox.xboxProductId ? { xboxProductId: xbox.xboxProductId } : {}),
    ...(xbox.availableFrom ? { availableFrom: xbox.availableFrom } : {}),
    ...(xbox.leavingAt ? { leavingAt: xbox.leavingAt } : {}),
  };
}

/**
 * 照合結果から配信用カタログを組み立てる（純粋関数）。Steam App IDをキーにする。
 *
 * 同一Steam App IDを複数のXboxエントリが主張した場合:
 * - 正規化タイトルが同じ（＝同一ゲームの別SKU/地域版）なら重複排除して最良を採用（正常）
 * - 正規化タイトルが異なる（＝別ゲームの衝突）なら最良を採用しつつ conflicts に記録（要手動対応）
 */
export function generateCatalog(
  matched: MatchedEntry[],
  options: GenerateOptions
): GenerateResult {
  // App ID ごとに主張エントリを集約する。
  const claimsByAppId = new Map<number, MatchedEntry[]>();
  for (const m of matched) {
    if (m.confidence < options.threshold) continue;
    for (const appId of m.steamAppIds) {
      const list = claimsByAppId.get(appId) ?? [];
      list.push(m);
      claimsByAppId.set(appId, list);
    }
  }

  const entriesBySteamAppId: Record<string, GamePassCatalogEntry> = {};
  const conflicts: SteamAppIdConflict[] = [];

  for (const [appId, claims] of claimsByAppId) {
    const winner = claims.reduce((best, c) => (isBetter(c, best) ? c : best));
    entriesBySteamAppId[String(appId)] = toEntry(winner, options.generatedAt);

    const distinctTitles = [
      ...new Set(claims.map((c) => normalizeGameTitle(c.xbox.title))),
    ];
    if (distinctTitles.length > 1) {
      conflicts.push({
        steamAppId: appId,
        titles: [...new Set(claims.map((c) => c.xbox.title))],
      });
    }
  }

  return {
    catalog: {
      schemaVersion: 1,
      generatedAt: options.generatedAt,
      region: options.region,
      entriesBySteamAppId,
    },
    conflicts,
  };
}
