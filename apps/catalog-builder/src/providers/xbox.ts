import { normalizeGameTitle } from "@gamepass-indicator/core";
import type { RawGamePassEntry } from "../types";
import type { CatalogProvider } from "./types";

/**
 * PC Game Pass のコレクション(sigl) ID。
 * このsiglから引いた作品は定義上すべてPC対象なので、PC/Console判定が単純化でき、
 * Consoleのみ作品を誤ってPC対象と表示する事故を防げる。
 */
export const PC_GAME_PASS_SIGL = "fdd9e2a7-0fee-49f6-ad69-4354098401ff";

const SIGLS_ENDPOINT = "https://catalog.gamepass.com/sigls/v2";
const DISPLAYCATALOG_ENDPOINT =
  "https://displaycatalog.mp.microsoft.com/v7.0/products";

/** displaycatalog のうち本ビルダーが読む最小フィールドのみ型付けする。 */
interface DisplayCatalogProduct {
  ProductId?: string;
  LocalizedProperties?: Array<{
    ProductTitle?: string;
    PublisherName?: string;
    DeveloperName?: string;
  }>;
  MarketProperties?: Array<{ OriginalReleaseDate?: string }>;
}

interface DisplayCatalogResponse {
  Products?: DisplayCatalogProduct[];
}

function toLocaleSegment(locale: string): string {
  // "ja-jp" -> "ja-JP"
  const [lang, region] = locale.split("-");
  if (!lang) return locale;
  return region ? `${lang}-${region.toUpperCase()}` : lang;
}

function yearFromIso(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  return Number.isNaN(year) ? undefined : year;
}

/**
 * sigls/v2 のレスポンスから bigId 群を取り出す。
 * 先頭要素はコレクションのメタデータで id を持たないことがある。
 */
export function parseSiglBigIds(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const ids: string[] = [];
  for (const item of json) {
    if (item && typeof item === "object" && "id" in item) {
      const id = (item as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * displaycatalog products レスポンスを RawGamePassEntry[] へ正規化する（純粋関数）。
 * PC Game Pass sigl由来を前提に platforms=['pc'], plans=['pc-game-pass','ultimate']。
 */
export function parseDisplayCatalogProducts(
  json: unknown,
  input: { locale: string; region: string }
): RawGamePassEntry[] {
  const response = (json ?? {}) as DisplayCatalogResponse;
  const products = response.Products ?? [];
  const localeSegment = toLocaleSegment(input.locale);
  const entries: RawGamePassEntry[] = [];

  for (const product of products) {
    const productId = product.ProductId;
    const localized = product.LocalizedProperties?.[0];
    const title = localized?.ProductTitle;
    if (!productId || !title) {
      continue;
    }
    const releaseYear = yearFromIso(product.MarketProperties?.[0]?.OriginalReleaseDate);

    entries.push({
      xboxProductId: productId,
      title,
      xboxUrl: `https://www.xbox.com/${localeSegment}/games/store/-/${productId}`,
      platforms: ["pc"],
      plans: ["pc-game-pass", "ultimate"],
      regions: [input.region],
      status: "available",
      ...(localized?.PublisherName ? { publisherName: localized.PublisherName } : {}),
      ...(localized?.DeveloperName ? { developerName: localized.DeveloperName } : {}),
      ...(releaseYear !== undefined ? { releaseYear } : {}),
    });
  }

  return entries;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * 主言語エントリに別言語エントリのタイトルを titleAlternates として付与する（純粋関数）。
 * 正規化して同一なら付与しない（JP↔EN で表記が異なるものだけ検索・照合の材料にする）。
 */
export function attachAlternateTitles(
  primary: RawGamePassEntry[],
  alternate: RawGamePassEntry[]
): RawGamePassEntry[] {
  const altTitleById = new Map(alternate.map((e) => [e.xboxProductId, e.title]));
  return primary.map((entry) => {
    const alt = altTitleById.get(entry.xboxProductId);
    if (!alt || normalizeGameTitle(alt) === normalizeGameTitle(entry.title)) {
      return entry;
    }
    return { ...entry, titleAlternates: [alt] };
  });
}

/**
 * Microsoftの公開カタログJSONエンドポイント経由でPC Game Pass一覧を取得するプロバイダ。
 *
 * 注意: これらは公式に安定保証されたAPIではない。DOMスクレイピングより堅牢という判断で
 * 採用しているが、この Provider 層に隔離しているため、将来Playwright版へ差し替え可能。
 */
export class LiveXboxProvider implements CatalogProvider {
  constructor(
    private readonly options: {
      siglId?: string;
      fetchImpl?: typeof fetch;
      /** 別言語タイトルを取得するロケール。null で無効化。既定 "en-us"。 */
      alternateLocale?: string | null;
    } = {}
  ) {}

  private async fetchProducts(
    doFetch: typeof fetch,
    bigIds: string[],
    languages: string,
    input: { region: string }
  ): Promise<RawGamePassEntry[]> {
    const entries: RawGamePassEntry[] = [];
    for (const ids of chunk(bigIds, 20)) {
      const url = `${DISPLAYCATALOG_ENDPOINT}?bigIds=${ids.join(",")}&market=${encodeURIComponent(input.region)}&languages=${encodeURIComponent(languages)}&fieldsTemplate=details`;
      const res = await doFetch(url);
      if (!res.ok) {
        throw new Error(`displaycatalog取得に失敗: ${res.status}`);
      }
      entries.push(
        ...parseDisplayCatalogProducts(await res.json(), {
          locale: languages,
          region: input.region,
        })
      );
    }
    return entries;
  }

  async fetchCatalog(input: { locale: string; region: string }): Promise<RawGamePassEntry[]> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const sigl = this.options.siglId ?? PC_GAME_PASS_SIGL;

    const siglUrl = `${SIGLS_ENDPOINT}?id=${encodeURIComponent(sigl)}&language=${encodeURIComponent(input.locale)}&market=${encodeURIComponent(input.region)}`;
    const siglRes = await doFetch(siglUrl);
    if (!siglRes.ok) {
      throw new Error(`Xbox sigls取得に失敗: ${siglRes.status}`);
    }
    const bigIds = parseSiglBigIds(await siglRes.json());
    if (bigIds.length === 0) {
      throw new Error("Xbox siglsから作品IDを取得できませんでした");
    }

    const primary = await this.fetchProducts(doFetch, bigIds, input.locale, input);

    const alternateLocale =
      this.options.alternateLocale === undefined
        ? "en-us"
        : this.options.alternateLocale;
    if (!alternateLocale) {
      return primary;
    }
    const alternate = await this.fetchProducts(
      doFetch,
      bigIds,
      alternateLocale,
      input
    );
    return attachAlternateTitles(primary, alternate);
  }
}

/**
 * 保存済みJSON（sigls + displaycatalog）から取得を再現するプロバイダ。
 * ネットワーク不要でパイプライン全体をテスト・デモできる。
 */
export class FixtureXboxProvider implements CatalogProvider {
  constructor(
    private readonly fixtures: {
      sigls: unknown;
      products: unknown;
      /** en-us products 相当。あれば titleAlternates を付与する。 */
      englishProducts?: unknown;
    }
  ) {}

  fetchCatalog(input: { locale: string; region: string }): Promise<RawGamePassEntry[]> {
    // sigls は件数確認のみに使う（実データはproductsから正規化）。
    parseSiglBigIds(this.fixtures.sigls);
    const primary = parseDisplayCatalogProducts(this.fixtures.products, input);
    if (this.fixtures.englishProducts === undefined) {
      return Promise.resolve(primary);
    }
    const alternate = parseDisplayCatalogProducts(this.fixtures.englishProducts, {
      locale: "en-us",
      region: input.region,
    });
    return Promise.resolve(attachAlternateTitles(primary, alternate));
  }
}
