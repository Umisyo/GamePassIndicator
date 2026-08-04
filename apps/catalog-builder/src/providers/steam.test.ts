import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cleanSearchTerm,
  LiveSteamResolver,
  parseAppDetails,
  parseStoreSearch,
} from "./steam";
import type { RawGamePassEntry } from "../types";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../fixtures/steam");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
}

describe("cleanSearchTerm (実データの装飾除去)", () => {
  it('"- Windows" を落とす', () => {
    expect(cleanSearchTerm("A Plague Tale: Requiem - Windows")).toBe(
      "A Plague Tale: Requiem"
    );
  });
  it("囲み括弧と(注記)を落とす", () => {
    expect(cleanSearchTerm("『NBA 2K26』通常版 (Windows PC)")).toBe("NBA 2K26");
  });
  it("囲み括弧と - エディション を落とす", () => {
    expect(
      cleanSearchTerm("『Halo: Campaign Evolved - スタンダード エディション』")
    ).toBe("Halo: Campaign Evolved");
  });
  it("末尾のプラットフォーム語・記号を落とす", () => {
    expect(cleanSearchTerm("Cooking Simulator Windows")).toBe("Cooking Simulator");
    expect(cleanSearchTerm("Diablo® IV PC")).toBe("Diablo IV");
    expect(cleanSearchTerm("Goat Simulator 3: Windows Edition")).toBe(
      "Goat Simulator 3"
    );
    expect(cleanSearchTerm("Halo Wars 2: Standard Edition")).toBe("Halo Wars 2");
  });

  it("装飾が無ければそのまま", () => {
    expect(cleanSearchTerm("ELDEN RING")).toBe("ELDEN RING");
  });
});

describe("parseStoreSearch (実データfixture)", () => {
  it("app型の候補を name/id/windows へ正規化する", () => {
    const items = parseStoreSearch(loadFixture("storesearch-elden-ring.real.json"));
    expect(items.length).toBeGreaterThan(0);
    const eldenRing = items.find((i) => i.appId === 1245620);
    expect(eldenRing?.name).toBe("ELDEN RING");
    expect(eldenRing?.windows).toBe(true);
  });

  it("items が無ければ空", () => {
    expect(parseStoreSearch({})).toEqual([]);
  });
});

describe("parseAppDetails (実データfixture)", () => {
  it("発売年・パブリッシャー・デベロッパーを取り出す", () => {
    const details = parseAppDetails(
      loadFixture("appdetails-1245620.real.json"),
      1245620
    );
    expect(details.releaseYear).toBe(2022);
    expect(details.publisher).toBe("FromSoftware, Inc.");
    expect(details.developer).toBe("FromSoftware, Inc.");
  });

  it("和文の日付からも年を抽出できる", () => {
    const details = parseAppDetails(
      { "1": { success: true, data: { release_date: { date: "2022年2月24日" } } } },
      1
    );
    expect(details.releaseYear).toBe(2022);
  });

  it("success=false は空", () => {
    expect(parseAppDetails({ "1": { success: false } }, 1)).toEqual({});
  });
});

describe("LiveSteamResolver (fetchをスタブ)", () => {
  const xbox: RawGamePassEntry = {
    xboxProductId: "P",
    title: "ELDEN RING",
    xboxUrl: "https://www.xbox.com/ja-JP/games/store/-/P",
    platforms: ["pc"],
    plans: ["pc-game-pass", "ultimate"],
    regions: ["JP"],
    status: "available",
  };

  it("storesearch→appdetailsの順で候補を組み立てる", async () => {
    const search = loadFixture("storesearch-elden-ring.real.json");
    const details = loadFixture("appdetails-1245620.real.json");
    const fetchImpl = ((url: string) => {
      const body = url.includes("storesearch") ? search : details;
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const resolver = new LiveSteamResolver({ fetchImpl, maxCandidates: 1 });
    const candidates = await resolver.resolveCandidates(xbox);
    expect(candidates[0]?.appId).toBe(1245620);
    expect(candidates[0]?.releaseYear).toBe(2022);
    expect(candidates[0]?.publisher).toBe("FromSoftware, Inc.");
  });

  it("英語代替タイトルがあれば english ストアでも検索し候補を統合する", async () => {
    const swXbox: RawGamePassEntry = {
      ...xbox,
      title: "『スター・ウォーズ 無法者たち』",
      titleAlternates: ["Star Wars Outlaws"],
    };
    const calls: string[] = [];
    const fetchImpl = ((url: string) => {
      calls.push(url);
      // JP検索はヒットなし、English検索でヒット。appdetailsは空。
      let body: unknown = { items: [] };
      if (url.includes("storesearch") && url.includes("l=english")) {
        body = { items: [{ type: "app", name: "Star Wars Outlaws", id: 2842040, platforms: { windows: true } }] };
      }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as unknown as typeof fetch;

    const resolver = new LiveSteamResolver({ fetchImpl, enrich: false });
    const candidates = await resolver.resolveCandidates(swXbox);
    expect(candidates.map((c) => c.appId)).toContain(2842040);
    // JP(日本語)とEN(英語)の2回検索している
    expect(calls.some((u) => u.includes("l=japanese"))).toBe(true);
    expect(calls.some((u) => u.includes("l=english"))).toBe(true);
  });

  it("storesearch失敗時は空を返す（ページ処理を止めない）", async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response("", { status: 503 }))) as unknown as typeof fetch;
    const resolver = new LiveSteamResolver({ fetchImpl });
    expect(await resolver.resolveCandidates(xbox)).toEqual([]);
  });
});
