import type { RawGamePassEntry, SteamCandidate } from "../types";
import type { SteamCandidateResolver } from "./types";

const STORESEARCH_ENDPOINT = "https://store.steampowered.com/api/storesearch/";
const APPDETAILS_ENDPOINT = "https://store.steampowered.com/api/appdetails";

/** storesearchのヒット率を上げるための装飾除去語（検索語専用・照合には使わない）。 */
const DECORATION_TERMS =
  /通常版|(スタンダード|ゴールド|アルティメット|デラックス|エンハンスド|アニバーサリー|コレクターズ)\s*エディション|エディション|ゲーム\s*プレビュー|(gold|ultimate|deluxe|enhanced|anniversary|collector's|standard|game\s+of\s+the\s+year|goty)\s+edition|windows\s+edition|game\s+preview|z\s+version|for\s+windows(\s*\+\s*launcher)?|for\s+pc/gi;

/**
 * Xboxタイトルの装飾（記号・括弧囲み・"- Windows"・"(Windows PC)"・末尾プラットフォーム語・
 * エディション表記）を落として Steamのタイトル検索に通りやすい語へ整える（純粋関数）。
 *
 * これは「検索語」の前処理であり、照合そのものは正規化タイトルと閾値で厳格に判定するため、
 * 検索語を緩めても偽陽性は増えない（候補が増えるだけ）。
 */
export function cleanSearchTerm(title: string): string {
  let term = title
    .replace(/[™®©]/g, " ")
    // 囲み括弧の文字だけ除去（中身は残す）
    .replace(/[『』「」【】]/g, " ")
    // 丸括弧の注記ごと除去: "(Windows PC)" "(ゲーム プレビュー)"
    .replace(/[（(][^）)]*[）)]/g, " ");
  // " - サブタイトル/エディション" 以降を落とす
  const dashCut = term.split(/\s[-–—]\s/)[0];
  if (dashCut) term = dashCut;
  term = term.replace(DECORATION_TERMS, " ");
  // 末尾のプラットフォーム語・コロンを繰り返し除去する。
  let prev = "";
  while (prev !== term) {
    prev = term;
    term = term
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[:：]$/, "")
      .replace(/\b(windows|pc|console|win)\b\s*$/i, "");
  }
  term = term.replace(/\s+/g, " ").trim();
  return term.length > 0 ? term : title.trim();
}

interface StoreSearchItem {
  type?: string;
  name?: string;
  id?: number;
  platforms?: { windows?: boolean };
}
interface StoreSearchResponse {
  items?: StoreSearchItem[];
}

export interface ParsedStoreSearchItem {
  appId: number;
  name: string;
  windows: boolean;
}

/** storesearch レスポンスから app 型の候補を取り出す（純粋関数）。 */
export function parseStoreSearch(json: unknown): ParsedStoreSearchItem[] {
  const response = (json ?? {}) as StoreSearchResponse;
  const items = response.items ?? [];
  const result: ParsedStoreSearchItem[] = [];
  for (const item of items) {
    if (item.type !== "app") continue;
    if (typeof item.id !== "number" || !item.name) continue;
    result.push({
      appId: item.id,
      name: item.name,
      windows: item.platforms?.windows === true,
    });
  }
  return result;
}

interface AppDetailsData {
  type?: string;
  name?: string;
  release_date?: { date?: string };
  developers?: string[];
  publishers?: string[];
}
type AppDetailsResponse = Record<
  string,
  { success?: boolean; data?: AppDetailsData }
>;

export interface ParsedAppDetails {
  releaseYear?: number;
  publisher?: string;
  developer?: string;
}

/** appdetails レスポンスから発売年・パブリッシャー・デベロッパーを取り出す（純粋関数）。 */
export function parseAppDetails(json: unknown, appId: number): ParsedAppDetails {
  const response = (json ?? {}) as AppDetailsResponse;
  const record = response[String(appId)];
  if (!record?.success || !record.data) {
    return {};
  }
  const data = record.data;
  const yearMatch = data.release_date?.date?.match(/(\d{4})/);
  const out: ParsedAppDetails = {};
  if (yearMatch) out.releaseYear = Number(yearMatch[1]);
  if (data.publishers?.[0]) out.publisher = data.publishers[0];
  if (data.developers?.[0]) out.developer = data.developers[0];
  return out;
}

/**
 * Steamストアのタイトル検索(storesearch)で候補を絞り、appdetailsで発売年・
 * パブリッシャーを補完するリゾルバ。
 *
 * 全アプリ一覧(GetAppList)をダウンロードする方式より軽量で、Windows対応情報も得られる。
 * appdetails はレート制限があるため候補数を絞り、失敗時は補完なしで続行する。
 */
export class LiveSteamResolver implements SteamCandidateResolver {
  constructor(
    private readonly options: {
      fetchImpl?: typeof fetch;
      locale?: string;
      countryCode?: string;
      maxCandidates?: number;
      enrich?: boolean;
    } = {}
  ) {}

  async resolveCandidates(xbox: RawGamePassEntry): Promise<SteamCandidate[]> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const locale = this.options.locale ?? "japanese";
    const cc = this.options.countryCode ?? "jp";
    const maxCandidates = this.options.maxCandidates ?? 8;
    const enrich = this.options.enrich ?? true;

    // 主題名は地域言語で、別言語(英語)タイトルは英語ストアで検索する（JP↔EN表記差に対応）。
    const searches: Array<{ term: string; l: string }> = [
      { term: cleanSearchTerm(xbox.title), l: locale },
      ...(xbox.titleAlternates ?? []).map((t) => ({
        term: cleanSearchTerm(t),
        l: "english",
      })),
    ].filter((s) => s.term.length > 0);

    const seenTerms = new Set<string>();
    const seen = new Set<number>();
    const items: ParsedStoreSearchItem[] = [];
    for (const { term, l } of searches) {
      const key = `${l}:${term}`;
      if (seenTerms.has(key)) continue;
      seenTerms.add(key);
      const url = `${STORESEARCH_ENDPOINT}?term=${encodeURIComponent(term)}&l=${encodeURIComponent(l)}&cc=${encodeURIComponent(cc)}`;
      try {
        const res = await doFetch(url);
        if (!res.ok) continue;
        for (const item of parseStoreSearch(await res.json())) {
          if (!seen.has(item.appId)) {
            seen.add(item.appId);
            items.push(item);
          }
        }
      } catch {
        // この検索語は諦めて次へ。
      }
    }
    if (items.length === 0) return [];

    // Windows対応を優先しつつ上限まで。
    const ranked = [...items].sort(
      (a, b) => Number(b.windows) - Number(a.windows)
    );
    const shortlist = ranked.slice(0, maxCandidates);

    const candidates: SteamCandidate[] = [];
    for (const item of shortlist) {
      const candidate: SteamCandidate = { appId: item.appId, name: item.name };
      if (enrich) {
        const details = await this.fetchDetails(doFetch, item.appId, locale, cc);
        if (details.releaseYear !== undefined) candidate.releaseYear = details.releaseYear;
        if (details.publisher) candidate.publisher = details.publisher;
        if (details.developer) candidate.developer = details.developer;
      }
      candidates.push(candidate);
    }
    return candidates;
  }

  private async fetchDetails(
    doFetch: typeof fetch,
    appId: number,
    locale: string,
    cc: string
  ): Promise<ParsedAppDetails> {
    const url = `${APPDETAILS_ENDPOINT}?appids=${appId}&l=${encodeURIComponent(locale)}&cc=${encodeURIComponent(cc)}&filters=basic,release_date,developers,publishers`;
    try {
      const res = await doFetch(url);
      if (!res.ok) return {};
      return parseAppDetails(await res.json(), appId);
    } catch {
      return {};
    }
  }
}

/**
 * 固定候補を返すリゾルバ。ネットワーク不要でパイプラインをテスト・デモできる。
 * 与えられた候補全件を返し、絞り込みは matcher に任せる。
 */
export class FixtureSteamResolver implements SteamCandidateResolver {
  constructor(private readonly candidates: SteamCandidate[]) {}

  resolveCandidates(_xbox: RawGamePassEntry): Promise<SteamCandidate[]> {
    return Promise.resolve(this.candidates);
  }
}
