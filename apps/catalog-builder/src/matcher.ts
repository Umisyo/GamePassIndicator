import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  normalizeGameTitle,
} from "@gamepass-indicator/core";
import type {
  ManualContext,
  MatchReport,
  MatchedEntry,
  RawGamePassEntry,
  SteamCandidate,
  UnresolvedEntry,
} from "./types";

/** Levenshtein距離。 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/** 0〜1のタイトル類似度。 */
export function titleSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function sameYear(a?: number, b?: number): boolean | undefined {
  if (a === undefined || b === undefined) return undefined;
  return a === b;
}

function samePublisher(a?: string, b?: string): boolean | undefined {
  if (!a || !b) return undefined;
  return normalizeGameTitle(a) === normalizeGameTitle(b);
}

/** エントリの照合対象タイトル（主題名 + 別言語タイトル）。 */
function candidateTitles(xbox: RawGamePassEntry): string[] {
  return [xbox.title, ...(xbox.titleAlternates ?? [])].filter(
    (t) => t.length > 0
  );
}

function fuzzyForTitle(
  title: string,
  xbox: RawGamePassEntry,
  candidate: SteamCandidate
): number {
  let score = titleSimilarity(
    normalizeGameTitle(title),
    normalizeGameTitle(candidate.name)
  );

  const year = sameYear(xbox.releaseYear, candidate.releaseYear);
  if (year === true) score += 0.03;
  else if (year === false) score -= 0.15;

  const publisher = samePublisher(xbox.publisherName, candidate.publisher);
  if (publisher === true) score += 0.02;

  return Math.max(0, Math.min(1, score));
}

/**
 * fuzzy照合のconfidenceを算出する。
 * 主題名・別言語タイトルそれぞれで類似度を測り、最大値を採る。
 * 発売年・パブリッシャーの一致/不一致で微調整し、年が食い違う場合は大きく減点する。
 */
export function fuzzyConfidence(
  xbox: RawGamePassEntry,
  candidate: SteamCandidate
): number {
  let best = 0;
  for (const title of candidateTitles(xbox)) {
    best = Math.max(best, fuzzyForTitle(title, xbox, candidate));
  }
  return best;
}

type MatchStep =
  | { status: "matched"; steamAppIds: number[]; method: MatchedEntry["method"]; confidence: number }
  | { status: "unresolved"; reason: string; best?: UnresolvedEntry["bestCandidate"] };

function isExcluded(ctx: ManualContext, appId: number): boolean {
  return ctx.exclusions.has(appId);
}

/**
 * 発売年で候補を1件に絞り込めるか試みる。
 */
function disambiguateByYear(
  xbox: RawGamePassEntry,
  candidates: SteamCandidate[]
): SteamCandidate | null {
  if (xbox.releaseYear === undefined) return null;
  const narrowed = candidates.filter(
    (c) => c.releaseYear !== undefined && c.releaseYear === xbox.releaseYear
  );
  return narrowed.length === 1 ? (narrowed[0] ?? null) : null;
}

/**
 * 1件のXboxエントリを、与えられたSteam候補群に照合する（純粋関数）。
 *
 * 照合順序:
 *   1. 手動オーバーライド
 *   2. 既知の共通ID (product-id)
 *   3. 正規化タイトルの完全一致
 *   4. aliases による別名一致
 *   5. タイトル・発売年・パブリッシャーによる曖昧一致
 *   6. 未確定
 *
 * 自動照合結果を無条件に採用しない。曖昧な場合は未確定へ送る。
 */
export function matchOne(
  xbox: RawGamePassEntry,
  candidates: SteamCandidate[],
  ctx: ManualContext,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): MatchStep {
  // 1. 手動オーバーライド
  const forced = (ctx.overrideByProductId.get(xbox.xboxProductId) ?? []).filter(
    (id) => !isExcluded(ctx, id)
  );
  if (forced.length > 0) {
    return { status: "matched", steamAppIds: forced, method: "manual", confidence: 1 };
  }

  const usable = candidates.filter((c) => !isExcluded(ctx, c.appId));

  // 2. 既知の共通ID
  const byProductId = usable.filter(
    (c) => c.xboxProductId && c.xboxProductId === xbox.xboxProductId
  );
  if (byProductId.length > 0) {
    return {
      status: "matched",
      steamAppIds: byProductId.map((c) => c.appId),
      method: "product-id",
      confidence: 1,
    };
  }

  // 主題名 + 別言語タイトルの正規化集合（JP↔EN表記差に対応）。
  const normTitles = new Set(candidateTitles(xbox).map(normalizeGameTitle));

  // 3. 正規化タイトルの完全一致
  const exact = usable.filter((c) => normTitles.has(normalizeGameTitle(c.name)));
  if (exact.length === 1) {
    return { status: "matched", steamAppIds: [exact[0]!.appId], method: "exact-title", confidence: 0.99 };
  }
  if (exact.length > 1) {
    const narrowed = disambiguateByYear(xbox, exact);
    if (narrowed) {
      return { status: "matched", steamAppIds: [narrowed.appId], method: "exact-title", confidence: 0.985 };
    }
    return {
      status: "unresolved",
      reason: `同一正規化タイトルの候補が複数あり曖昧 (${exact.length}件)`,
    };
  }

  // 4. aliases による別名一致
  const xGroups = new Set(
    [...normTitles]
      .map((t) => ctx.aliasGroupOf.get(t))
      .filter((g): g is number => g !== undefined)
  );
  if (xGroups.size > 0) {
    const alias = usable.filter((c) => {
      const g = ctx.aliasGroupOf.get(normalizeGameTitle(c.name));
      return g !== undefined && xGroups.has(g);
    });
    if (alias.length === 1) {
      return { status: "matched", steamAppIds: [alias[0]!.appId], method: "alias", confidence: 0.98 };
    }
    if (alias.length > 1) {
      const narrowed = disambiguateByYear(xbox, alias);
      if (narrowed) {
        return { status: "matched", steamAppIds: [narrowed.appId], method: "alias", confidence: 0.98 };
      }
      return { status: "unresolved", reason: `別名グループ内の候補が複数あり曖昧 (${alias.length}件)` };
    }
  }

  // 5. 曖昧一致
  let best: { candidate: SteamCandidate; confidence: number } | null = null;
  for (const c of usable) {
    const confidence = fuzzyConfidence(xbox, c);
    if (!best || confidence > best.confidence) {
      best = { candidate: c, confidence };
    }
  }
  if (best && best.confidence >= threshold) {
    return { status: "matched", steamAppIds: [best.candidate.appId], method: "fuzzy", confidence: best.confidence };
  }

  // 6. 未確定
  return {
    status: "unresolved",
    reason: best
      ? `最良候補でも閾値未満 (confidence ${best.confidence.toFixed(3)} < ${threshold})`
      : "候補なし",
    ...(best
      ? { best: { appId: best.candidate.appId, name: best.candidate.name, confidence: best.confidence } }
      : {}),
  };
}

/**
 * Xbox一覧全体を照合する。候補はエントリごとにリゾルバから取得する。
 * concurrency で候補取得の並列度を指定できる（既定は逐次=1）。
 */
export async function matchCatalog(input: {
  xboxEntries: RawGamePassEntry[];
  resolveCandidates: (xbox: RawGamePassEntry) => Promise<SteamCandidate[]> | SteamCandidate[];
  ctx: ManualContext;
  threshold?: number;
  concurrency?: number;
}): Promise<MatchReport> {
  const threshold = input.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const concurrency = Math.max(1, input.concurrency ?? 1);
  const entries = input.xboxEntries;
  const matched: MatchedEntry[] = [];
  const unresolved: UnresolvedEntry[] = [];

  async function processOne(xbox: RawGamePassEntry): Promise<void> {
    const candidates = await input.resolveCandidates(xbox);
    const result = matchOne(xbox, candidates, input.ctx, threshold);
    if (result.status === "matched") {
      matched.push({
        xbox,
        steamAppIds: result.steamAppIds,
        method: result.method,
        confidence: result.confidence,
      });
    } else {
      unresolved.push({
        xbox,
        reason: result.reason,
        ...(result.best ? { bestCandidate: result.best } : {}),
      });
    }
  }

  // 固定サイズのワーカープールで並列処理する（共有indexを持たないリゾルバ前提）。
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < entries.length) {
      const index = cursor++;
      const xbox = entries[index];
      if (xbox) await processOne(xbox);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => worker())
  );

  return { matched, unresolved, excludedAppIds: [...input.ctx.exclusions] };
}
