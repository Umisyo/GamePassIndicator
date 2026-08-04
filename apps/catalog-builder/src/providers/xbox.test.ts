import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attachAlternateTitles,
  FixtureXboxProvider,
  LiveXboxProvider,
  parseDisplayCatalogProducts,
  parseSiglBigIds,
} from "./xbox";
import type { RawGamePassEntry } from "../types";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../fixtures/xbox");
function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
}

describe("parseSiglBigIds", () => {
  it("id を持つ要素だけ取り出す", () => {
    const ids = parseSiglBigIds([
      { siglId: "abc" },
      { id: "A" },
      { id: "B" },
      { foo: "no-id" },
    ]);
    expect(ids).toEqual(["A", "B"]);
  });

  it("配列でなければ空", () => {
    expect(parseSiglBigIds({})).toEqual([]);
  });
});

describe("parseDisplayCatalogProducts", () => {
  const input = { locale: "ja-jp", region: "JP" };

  it("products を RawGamePassEntry へ正規化する", () => {
    const entries = parseDisplayCatalogProducts(
      {
        Products: [
          {
            ProductId: "PROD1",
            LocalizedProperties: [
              { ProductTitle: "ELDEN RING", PublisherName: "FromSoftware" },
            ],
            MarketProperties: [{ OriginalReleaseDate: "2022-02-25T00:00:00Z" }],
          },
        ],
      },
      input
    );
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.xboxProductId).toBe("PROD1");
    expect(entry.title).toBe("ELDEN RING");
    expect(entry.platforms).toEqual(["pc"]);
    expect(entry.plans).toEqual(["pc-game-pass", "ultimate"]);
    expect(entry.regions).toEqual(["JP"]);
    expect(entry.releaseYear).toBe(2022);
    expect(entry.publisherName).toBe("FromSoftware");
    expect(entry.xboxUrl).toBe(
      "https://www.xbox.com/ja-JP/games/store/-/PROD1"
    );
  });

  it("ProductId か ProductTitle が欠ける product はスキップ", () => {
    const entries = parseDisplayCatalogProducts(
      {
        Products: [
          { LocalizedProperties: [{ ProductTitle: "No Id" }] },
          { ProductId: "P2", LocalizedProperties: [{}] },
        ],
      },
      input
    );
    expect(entries).toEqual([]);
  });

  it("Products が無ければ空配列", () => {
    expect(parseDisplayCatalogProducts({}, input)).toEqual([]);
  });

  it("実データfixtureの形状を正しく解釈する", () => {
    const entries = parseDisplayCatalogProducts(
      loadFixture("displaycatalog.real.json"),
      input
    );
    expect(entries.length).toBeGreaterThan(0);
    const overwatch = entries.find((e) => e.xboxProductId === "C1C4DZJPBC2V");
    expect(overwatch?.title).toBe("「オーバーウォッチ®」");
    expect(overwatch?.releaseYear).toBe(2022);
    expect(overwatch?.platforms).toEqual(["pc"]);
  });
});

describe("parseSiglBigIds (実データfixture)", () => {
  it("先頭メタデータを除き id を取り出す", () => {
    const ids = parseSiglBigIds(loadFixture("sigls.real.json"));
    expect(ids.length).toBe(5);
    expect(ids[0]).toBe("C1C4DZJPBC2V");
  });
});

describe("Xbox providers (fetchをスタブ)", () => {
  const input = { locale: "ja-jp", region: "JP" };

  it("LiveXboxProvider は sigls→displaycatalog を辿る（alternateLocale無効）", async () => {
    const sigls = loadFixture("sigls.real.json");
    const products = loadFixture("displaycatalog.real.json");
    const fetchImpl = ((url: string) => {
      const body = url.includes("sigls") ? sigls : products;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as unknown as typeof fetch;

    const provider = new LiveXboxProvider({ fetchImpl, alternateLocale: null });
    const entries = await provider.fetchCatalog(input);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.platforms.includes("pc"))).toBe(true);
  });

  it("LiveXboxProvider は en-us も取得し titleAlternates を付与する", async () => {
    const sigls = loadFixture("sigls.real.json");
    const jaProducts = loadFixture("displaycatalog.real.json");
    const enProducts = loadFixture("displaycatalog-en.real.json");
    const fetchImpl = ((url: string) => {
      let body: unknown = jaProducts;
      if (url.includes("sigls")) body = sigls;
      else if (url.includes("languages=en-us")) body = enProducts;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as unknown as typeof fetch;

    const provider = new LiveXboxProvider({ fetchImpl });
    const entries = await provider.fetchCatalog(input);
    const sw = entries.find((e) => e.xboxProductId === "9P1P7DWHBDBD");
    expect(sw?.titleAlternates).toEqual(["Star Wars Outlaws"]);
  });

  it("FixtureXboxProvider は保存JSONから正規化する", async () => {
    const provider = new FixtureXboxProvider({
      sigls: loadFixture("sigls.real.json"),
      products: loadFixture("displaycatalog.real.json"),
    });
    const entries = await provider.fetchCatalog(input);
    expect(entries.find((e) => e.xboxProductId === "C1C4DZJPBC2V")).toBeDefined();
  });

  it("englishProducts があれば表記差のある作品に titleAlternates を付与する", async () => {
    const provider = new FixtureXboxProvider({
      sigls: loadFixture("sigls.real.json"),
      products: loadFixture("displaycatalog.real.json"),
      englishProducts: loadFixture("displaycatalog-en.real.json"),
    });
    const entries = await provider.fetchCatalog(input);
    const sw = entries.find((e) => e.xboxProductId === "9P1P7DWHBDBD");
    expect(sw?.title).toBe("『スター・ウォーズ 無法者たち』");
    expect(sw?.titleAlternates).toEqual(["Star Wars Outlaws"]);
  });
});

describe("attachAlternateTitles", () => {
  const entry = (xboxProductId: string, title: string): RawGamePassEntry => ({
    xboxProductId,
    title,
    xboxUrl: "u",
    platforms: ["pc"],
    plans: ["pc-game-pass"],
    regions: ["JP"],
    status: "available",
  });

  it("正規化して異なる場合のみ付与する", () => {
    const primary = [
      entry("A", "『スター・ウォーズ 無法者たち』"),
      entry("B", "ELDEN RING"),
    ];
    const alternate = [
      entry("A", "Star Wars Outlaws"),
      entry("B", "ELDEN RING"),
    ];
    const merged = attachAlternateTitles(primary, alternate);
    expect(merged[0]?.titleAlternates).toEqual(["Star Wars Outlaws"]);
    // 正規化同一(ELDEN RING)は付与しない
    expect(merged[1]?.titleAlternates).toBeUndefined();
  });
});
