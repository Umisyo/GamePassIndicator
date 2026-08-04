import type { RawGamePassEntry, SteamCandidate } from "../types";

/**
 * Xbox Game Pass一覧の取得元。取得手段（内部API/HTMLスクレイピング）をこの層に隔離する。
 * 非公開APIへ直接強く依存させない。
 */
export interface CatalogProvider {
  fetchCatalog(input: { locale: string; region: string }): Promise<RawGamePassEntry[]>;
}

/**
 * Xboxエントリ1件に対するSteam照合候補を返す。
 * live実装は膨大なSteam全アプリから候補を絞り込み、fixture実装は固定候補を返す。
 */
export interface SteamCandidateResolver {
  resolveCandidates(xbox: RawGamePassEntry): Promise<SteamCandidate[]>;
}
