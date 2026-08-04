import { describe, expect, it } from "vitest";
import { runBuild } from "./build";
import { buildManualContext } from "./manual-data";
import { FixtureSteamResolver } from "./providers/steam";
import { FixtureXboxProvider } from "./providers/xbox";
import type { SteamCandidate } from "./types";

const SIGLS = [
  { siglId: "pc" },
  { id: "SAMPLE0001" },
  { id: "SAMPLE0002" },
  { id: "SAMPLE0003" },
];

const PRODUCTS = {
  Products: [
    {
      ProductId: "SAMPLE0001",
      LocalizedProperties: [{ ProductTitle: "ELDEN RING", PublisherName: "FromSoftware" }],
      MarketProperties: [{ OriginalReleaseDate: "2022-02-25T00:00:00Z" }],
    },
    {
      ProductId: "SAMPLE0002",
      LocalizedProperties: [
        { ProductTitle: "NieR:Automata BECOME AS GODS Edition", PublisherName: "Square Enix" },
      ],
      MarketProperties: [{ OriginalReleaseDate: "2017-03-17T00:00:00Z" }],
    },
    {
      ProductId: "SAMPLE0003",
      LocalizedProperties: [{ ProductTitle: "Some Unmatched Game" }],
    },
  ],
};

const CANDIDATES: SteamCandidate[] = [
  { appId: 1245620, name: "ELDEN RING", releaseYear: 2022 },
  { appId: 524220, name: "NieR:Automata™ Game of the YoRHa Edition", releaseYear: 2017 },
  { appId: 570, name: "Dota 2" },
];

describe("runBuild (fixture end-to-end)", () => {
  it("取得→照合→生成→検証を通し、対象のみカタログ化する", async () => {
    const ctx = buildManualContext({
      overrides: {},
      exclusions: {},
      aliases: {
        "NieR:Automata Game of the YoRHa Edition": [
          "NieR:Automata BECOME AS GODS Edition",
        ],
      },
    });

    const { catalog, report } = await runBuild({
      xboxProvider: new FixtureXboxProvider({ sigls: SIGLS, products: PRODUCTS }),
      steamResolver: new FixtureSteamResolver(CANDIDATES),
      ctx,
      locale: "ja-jp",
      market: "JP",
      catalogRegion: "ja-JP",
      generatedAt: "2026-08-03T03:00:00.000Z",
      previousEntryCount: 0,
    });

    // ELDEN RING は完全一致、NieR は alias一致で採用。
    expect(report.matched).toHaveLength(2);
    // Some Unmatched Game は未確定。
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0]?.xbox.title).toBe("Some Unmatched Game");

    expect(catalog.entriesBySteamAppId["1245620"]?.match.method).toBe("exact-title");
    expect(catalog.entriesBySteamAppId["524220"]?.match.method).toBe("alias");
    expect(catalog.entriesBySteamAppId["570"]).toBeUndefined();
  });
});
