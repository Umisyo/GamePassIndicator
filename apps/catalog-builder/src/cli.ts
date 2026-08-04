import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "@gamepass-indicator/core";
import type { GamePassCatalog } from "@gamepass-indicator/core";
import { runBuild } from "./build";
import { buildManualContext } from "./manual-data";
import { FixtureXboxProvider, LiveXboxProvider } from "./providers/xbox";
import { FixtureSteamResolver, LiveSteamResolver } from "./providers/steam";
import type { CatalogProvider, SteamCandidateResolver } from "./providers/types";
import type {
  AliasesFile,
  ExclusionsFile,
  OverridesFile,
  SteamCandidate,
} from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const dataDir = resolve(repoRoot, "data");
const generatedDir = resolve(repoRoot, "generated");
const fixturesDir = resolve(repoRoot, "fixtures");

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function parseArgs(argv: string[]): { command: string; flags: Map<string, string> } {
  const command = argv[0] ?? "build";
  const flags = new Map<string, string>();
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, "true");
      }
    }
  }
  return { command, flags };
}

async function loadManualContext() {
  const [overrides, exclusions, aliases] = await Promise.all([
    readJson<OverridesFile>(resolve(dataDir, "overrides.json"), {}),
    readJson<ExclusionsFile>(resolve(dataDir, "exclusions.json"), {}),
    readJson<AliasesFile>(resolve(dataDir, "aliases.json"), {}),
  ]);
  return buildManualContext({ overrides, exclusions, aliases });
}

async function buildProviders(
  source: string,
  liveOptions: { enrich: boolean; maxCandidates?: number }
): Promise<{ xboxProvider: CatalogProvider; steamResolver: SteamCandidateResolver }> {
  if (source === "fixture") {
    const [sigls, products, candidates] = await Promise.all([
      readJson<unknown>(resolve(fixturesDir, "xbox/sigls.sample.json"), []),
      readJson<unknown>(resolve(fixturesDir, "xbox/displaycatalog.sample.json"), {}),
      readJson<SteamCandidate[]>(resolve(fixturesDir, "steam/candidates.sample.json"), []),
    ]);
    return {
      xboxProvider: new FixtureXboxProvider({ sigls, products }),
      steamResolver: new FixtureSteamResolver(candidates),
    };
  }
  return {
    xboxProvider: new LiveXboxProvider(),
    steamResolver: new LiveSteamResolver({
      enrich: liveOptions.enrich,
      ...(liveOptions.maxCandidates !== undefined
        ? { maxCandidates: liveOptions.maxCandidates }
        : {}),
    }),
  };
}

async function previousEntryCount(outPath: string): Promise<number> {
  const previous = await readJson<GamePassCatalog | null>(outPath, null);
  return previous ? Object.keys(previous.entriesBySteamAppId).length : 0;
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command !== "build") {
    throw new Error(`未対応のコマンド: ${command}`);
  }

  const source = process.env["BUILDER_SOURCE"] ?? "live";
  const locale = flags.get("locale") ?? "ja-jp";
  const market = flags.get("market") ?? "JP";
  const catalogRegion = flags.get("region") ?? "ja-JP";
  const outPath = resolve(
    flags.get("out") ?? resolve(generatedDir, "catalog-ja-jp.json")
  );
  const metaPath = resolve(generatedDir, "catalog-meta.json");

  console.log(`[builder] source=${source} locale=${locale} market=${market} -> ${outPath}`);

  const limitRaw = flags.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const concurrency = flags.get("concurrency")
    ? Number(flags.get("concurrency"))
    : 1;
  const enrich = flags.get("no-enrich") === undefined;
  const maxCandidates = flags.get("max-candidates")
    ? Number(flags.get("max-candidates"))
    : undefined;

  const ctx = await loadManualContext();
  const { xboxProvider, steamResolver } = await buildProviders(source, {
    enrich,
    ...(maxCandidates !== undefined ? { maxCandidates } : {}),
  });
  const generatedAt = new Date().toISOString();
  // 部分実行(limit)では件数が減るため、大量削除ガードを無効化する。
  const prevCount = limit !== undefined ? 0 : await previousEntryCount(outPath);

  const { catalog, report, conflicts } = await runBuild({
    xboxProvider,
    steamResolver,
    ctx,
    locale,
    market,
    catalogRegion,
    generatedAt,
    previousEntryCount: prevCount,
    threshold: DEFAULT_CONFIDENCE_THRESHOLD,
    concurrency,
    ...(limit !== undefined ? { limit } : {}),
  });

  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  const meta = {
    schemaVersion: catalog.schemaVersion,
    catalogVersion: generatedAt,
    regions: [catalogRegion],
    minimumExtensionVersion: "0.1.0",
  };
  if (flags.get("out") === undefined) {
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }

  console.log(
    `[builder] 完了: matched=${report.matched.length} 出力=${Object.keys(catalog.entriesBySteamAppId).length}件 unresolved=${report.unresolved.length} excluded=${report.excludedAppIds.length} conflicts=${conflicts.length}`
  );
  for (const c of conflicts) {
    console.log(`  [conflict] App ID ${c.steamAppId}: ${c.titles.join(" / ")}`);
  }
  for (const u of report.unresolved) {
    const best = u.bestCandidate
      ? ` (最良: ${u.bestCandidate.name} / ${u.bestCandidate.confidence.toFixed(3)})`
      : "";
    console.log(`  [unresolved] ${u.xbox.title}: ${u.reason}${best}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
