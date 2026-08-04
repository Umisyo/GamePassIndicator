import { describe, expect, it } from "vitest";
import { buildManualContext } from "./manual-data";
import { matchCatalog, matchOne, titleSimilarity } from "./matcher";
import type { RawGamePassEntry, SteamCandidate } from "./types";

function xbox(overrides: Partial<RawGamePassEntry> = {}): RawGamePassEntry {
  return {
    xboxProductId: "PROD1",
    title: "Example Game",
    xboxUrl: "https://www.xbox.com/ja-JP/games/store/-/PROD1",
    platforms: ["pc"],
    plans: ["pc-game-pass", "ultimate"],
    regions: ["JP"],
    status: "available",
    ...overrides,
  };
}

const emptyCtx = buildManualContext({ overrides: {}, exclusions: {}, aliases: {} });

describe("titleSimilarity", () => {
  it("完全一致は1", () => {
    expect(titleSimilarity("elden ring", "elden ring")).toBe(1);
  });
  it("無関係は低い", () => {
    expect(titleSimilarity("elden ring", "dota 2")).toBeLessThan(0.5);
  });
});

describe("matchOne", () => {
  it("手動オーバーライドを最優先で採用する", () => {
    const ctx = buildManualContext({
      overrides: { "999": { xboxProductId: "PROD1" } },
      exclusions: {},
      aliases: {},
    });
    const result = matchOne(xbox(), [], ctx);
    expect(result).toEqual({
      status: "matched",
      steamAppIds: [999],
      method: "manual",
      confidence: 1,
    });
  });

  it("共通IDが一致すれば product-id 採用", () => {
    const candidates: SteamCandidate[] = [
      { appId: 111, name: "Totally Different", xboxProductId: "PROD1" },
    ];
    const result = matchOne(xbox(), candidates, emptyCtx);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.method).toBe("product-id");
      expect(result.steamAppIds).toEqual([111]);
    }
  });

  it("正規化タイトル完全一致", () => {
    const candidates: SteamCandidate[] = [{ appId: 1245620, name: "Example Game™" }];
    const result = matchOne(xbox(), candidates, emptyCtx);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.method).toBe("exact-title");
      expect(result.confidence).toBeCloseTo(0.99);
    }
  });

  it("同名候補が複数あり年で絞れなければ未確定", () => {
    const candidates: SteamCandidate[] = [
      { appId: 1, name: "Example Game" },
      { appId: 2, name: "Example Game" },
    ];
    const result = matchOne(xbox(), candidates, emptyCtx);
    expect(result.status).toBe("unresolved");
  });

  it("同名候補が複数でも発売年で1件に絞れれば採用", () => {
    const candidates: SteamCandidate[] = [
      { appId: 1, name: "Example Game", releaseYear: 2010 },
      { appId: 2, name: "Example Game", releaseYear: 2022 },
    ];
    const result = matchOne(xbox({ releaseYear: 2022 }), candidates, emptyCtx);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.steamAppIds).toEqual([2]);
    }
  });

  it("エディション名違いを aliases で一致させる（NieR）", () => {
    const ctx = buildManualContext({
      overrides: {},
      exclusions: {},
      aliases: {
        "NieR:Automata Game of the YoRHa Edition": [
          "NieR:Automata BECOME AS GODS Edition",
        ],
      },
    });
    const entry = xbox({ title: "NieR:Automata BECOME AS GODS Edition" });
    const candidates: SteamCandidate[] = [
      { appId: 524220, name: "NieR:Automata™ Game of the YoRHa Edition" },
    ];
    const result = matchOne(entry, candidates, ctx);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.method).toBe("alias");
      expect(result.steamAppIds).toEqual([524220]);
    }
  });

  it("JP主題名が一致しなくても英語代替タイトルで完全一致する", () => {
    const entry = xbox({
      title: "『スター・ウォーズ 無法者たち』",
      titleAlternates: ["Star Wars Outlaws"],
    });
    const candidates: SteamCandidate[] = [
      { appId: 2842040, name: "Star Wars Outlaws" },
    ];
    const result = matchOne(entry, candidates, emptyCtx);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.method).toBe("exact-title");
      expect(result.steamAppIds).toEqual([2842040]);
    }
  });

  it("低い類似度は採用せず未確定（偽陽性防止）", () => {
    const candidates: SteamCandidate[] = [{ appId: 570, name: "Dota 2" }];
    const result = matchOne(xbox({ title: "Example Game" }), candidates, emptyCtx);
    expect(result.status).toBe("unresolved");
    if (result.status === "unresolved") {
      expect(result.best?.appId).toBe(570);
    }
  });

  it("exclusions のApp IDは候補から除外される", () => {
    const ctx = buildManualContext({
      overrides: {},
      exclusions: { "1245620": { exclude: true } },
      aliases: {},
    });
    const candidates: SteamCandidate[] = [{ appId: 1245620, name: "Example Game" }];
    const result = matchOne(xbox(), candidates, ctx);
    expect(result.status).toBe("unresolved");
  });

  it("オーバーライド対象が exclusions なら採用されない", () => {
    const ctx = buildManualContext({
      overrides: { "999": { xboxProductId: "PROD1" } },
      exclusions: { "999": { exclude: true } },
      aliases: {},
    });
    const result = matchOne(xbox(), [], ctx);
    expect(result.status).toBe("unresolved");
  });
});

describe("matchCatalog", () => {
  it("並列度を上げても全エントリを漏れなく処理する", async () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      xbox({ xboxProductId: `P${i}`, title: `Game ${i}` })
    );
    const report = await matchCatalog({
      xboxEntries: entries,
      resolveCandidates: (x) => [{ appId: 1000 + Number(x.title.split(" ")[1]), name: x.title }],
      ctx: emptyCtx,
      concurrency: 5,
    });
    expect(report.matched).toHaveLength(20);
    const appIds = new Set(report.matched.flatMap((m) => m.steamAppIds));
    expect(appIds.size).toBe(20);
  });
});
