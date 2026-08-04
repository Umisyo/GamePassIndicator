import type {
  GamePassPlan,
  GamePassPlatform,
  GamePassStatus,
  MatchMethod,
} from "@gamepass-indicator/core";

/**
 * Xboxプロバイダが返す生データ。取得元（API/HTML）に依存しない形へ正規化済み。
 */
export interface RawGamePassEntry {
  xboxProductId: string;
  /** 表示・主照合に使う地域言語タイトル（日本語）。 */
  title: string;
  /** 別言語（英語等）タイトル。JP↔EN表記差の検索・照合フォールバックに使う。 */
  titleAlternates?: string[];
  xboxUrl: string;
  platforms: GamePassPlatform[];
  plans: GamePassPlan[];
  regions: string[];
  status: GamePassStatus;
  availableFrom?: string;
  leavingAt?: string;
  publisherName?: string;
  developerName?: string;
  releaseYear?: number;
}

/**
 * Steam側の照合候補。Steamプロバイダが返す。
 */
export interface SteamCandidate {
  appId: number;
  name: string;
  releaseYear?: number;
  publisher?: string;
  developer?: string;
  /** ごく稀にSteam側が持つ共通ID。あれば product-id 照合に使う。 */
  xboxProductId?: string;
}

/** data/overrides.json */
export type OverridesFile = Record<
  string,
  { xboxProductId: string; reason?: string }
>;

/** data/exclusions.json */
export type ExclusionsFile = Record<
  string,
  { exclude: boolean; reason?: string }
>;

/** data/aliases.json （キー・値は任意表記でよい。読込時に正規化する） */
export type AliasesFile = Record<string, string[]>;

/**
 * 手動補正を照合しやすい形へ展開したコンテキスト。
 */
export interface ManualContext {
  /** xboxProductId -> 強制的に対応させる Steam App ID群（overrides由来） */
  overrideByProductId: Map<string, number[]>;
  /** 表示から除外する Steam App ID */
  exclusions: Set<number>;
  /** 正規化タイトル -> 別名グループID（同一グループ同士は alias 一致とみなす） */
  aliasGroupOf: Map<string, number>;
}

export interface MatchedEntry {
  xbox: RawGamePassEntry;
  steamAppIds: number[];
  method: MatchMethod;
  confidence: number;
}

export interface UnresolvedEntry {
  xbox: RawGamePassEntry;
  reason: string;
  bestCandidate?: { appId: number; name: string; confidence: number };
}

export interface MatchReport {
  matched: MatchedEntry[];
  unresolved: UnresolvedEntry[];
  excludedAppIds: number[];
}
