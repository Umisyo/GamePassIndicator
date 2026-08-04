import type { GamePassCatalog } from "@gamepass-indicator/core";
import { generateCatalog, type SteamAppIdConflict } from "./generate";
import { matchCatalog } from "./matcher";
import type { CatalogProvider, SteamCandidateResolver } from "./providers/types";
import type { ManualContext, MatchReport } from "./types";
import { validateCatalog } from "./validate";

export interface BuildInput {
  xboxProvider: CatalogProvider;
  steamResolver: SteamCandidateResolver;
  ctx: ManualContext;
  /** Xbox APIに渡す言語。例 "ja-jp" */
  locale: string;
  /** Xbox APIに渡す市場・エントリのregions。例 "JP" */
  market: string;
  /** カタログの region フィールド。例 "ja-JP" */
  catalogRegion: string;
  /** ISO文字列。 */
  generatedAt: string;
  previousEntryCount: number;
  threshold?: number;
  /** 処理するXboxエントリ数の上限（live取得の検証・部分実行用）。 */
  limit?: number;
  /** 候補取得の並列度。 */
  concurrency?: number;
}

export interface BuildResult {
  catalog: GamePassCatalog;
  report: MatchReport;
  conflicts: SteamAppIdConflict[];
}

/**
 * 取得 → 照合 → 生成 → バリデーション を一気通貫で実行する。
 * IO（ファイル読み書き・ネットワーク）はプロバイダとcli側に隔離してある。
 */
export async function runBuild(input: BuildInput): Promise<BuildResult> {
  const fetched = await input.xboxProvider.fetchCatalog({
    locale: input.locale,
    region: input.market,
  });
  const xboxEntries =
    input.limit !== undefined ? fetched.slice(0, input.limit) : fetched;

  const report = await matchCatalog({
    xboxEntries,
    resolveCandidates: (xbox) => input.steamResolver.resolveCandidates(xbox),
    ctx: input.ctx,
    ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
    ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
  });

  const { catalog, conflicts } = generateCatalog(report.matched, {
    region: input.catalogRegion,
    generatedAt: input.generatedAt,
    threshold: input.threshold ?? 0.98,
  });

  validateCatalog(catalog, { previousEntryCount: input.previousEntryCount });

  return { catalog, report, conflicts };
}
