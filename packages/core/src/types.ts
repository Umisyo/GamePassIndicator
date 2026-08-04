/**
 * カタログのデータモデル。
 * Chrome拡張版・Millennium版・Catalog Builderで共有する。
 */

export type GamePassPlatform = "pc" | "console" | "cloud";

export type GamePassPlan = "pc-game-pass" | "ultimate" | "ea-play";

export type GamePassStatus = "available" | "coming-soon" | "leaving-soon";

export type MatchMethod =
  | "manual"
  | "product-id"
  | "exact-title"
  | "alias"
  | "fuzzy";

export interface GamePassMatch {
  method: MatchMethod;
  /** 0〜1。1が手動確定。低いものは拡張側で表示しない。 */
  confidence: number;
}

export interface GamePassCatalogEntry {
  id: string;
  canonicalTitle: string;
  normalizedTitle: string;
  aliases: string[];
  xboxProductId?: string;
  xboxUrl: string;
  platforms: GamePassPlatform[];
  plans: GamePassPlan[];
  regions: string[];
  availableFrom?: string;
  leavingAt?: string;
  status: GamePassStatus;
  steamAppIds: number[];
  match: GamePassMatch;
  updatedAt: string;
}

export interface GamePassCatalog {
  schemaVersion: number;
  generatedAt: string;
  region: string;
  entriesBySteamAppId: Record<string, GamePassCatalogEntry>;
}

/**
 * content script と background service worker の間で交換するメッセージ。
 */
export interface LookupRequest {
  type: "gamepass-lookup";
  appId: number;
}

export interface LookupResponse {
  type: "gamepass-lookup-result";
  /**
   * カタログにApp IDが存在すれば生のエントリ、なければ null。
   * confidence・PC対象・設定を踏まえた最終的な表示判定は content 側で行う。
   */
  entry: GamePassCatalogEntry | null;
}

/** 検索結果・ウィッシュリスト用の一括照会。 */
export interface LookupBatchRequest {
  type: "gamepass-lookup-batch";
  appIds: number[];
}

export interface LookupBatchResponse {
  type: "gamepass-lookup-batch-result";
  /** カタログに存在した App ID のみ（キーは App ID 文字列）。表示判定は content 側。 */
  entries: Record<string, GamePassCatalogEntry>;
}

/** options から強制更新を要求する。 */
export interface RefreshRequest {
  type: "gamepass-refresh";
}

/** options が最終更新日時（catalog.generatedAt）を問い合わせる。 */
export interface MetaRequest {
  type: "gamepass-meta";
}

export interface MetaResponse {
  type: "gamepass-meta";
  generatedAt: string | null;
}

export type ExtensionMessage =
  | LookupRequest
  | LookupBatchRequest
  | RefreshRequest
  | MetaRequest;
export type ExtensionResponse =
  | LookupResponse
  | LookupBatchResponse
  | MetaResponse;
