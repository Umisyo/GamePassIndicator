import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT_BUNDLE = resolve(here, "../dist/content.js");
const FIXTURE_NORMAL = resolve(here, "../../../fixtures/steam/normal-game.html");
const FIXTURE_NO_TARGET = resolve(
  here,
  "../../../fixtures/steam/no-target.html"
);

const ROOT_SELECTOR = "#steam-gamepass-indicator-root";

// テスト用の固定カタログ（appId -> エントリ）。
const AVAILABLE_ENTRY = {
  id: "sample-elden-ring",
  canonicalTitle: "ELDEN RING",
  normalizedTitle: "elden ring",
  aliases: [],
  xboxUrl: "https://www.xbox.com/ja-JP/games/store/elden-ring/SAMPLE0001",
  platforms: ["pc"],
  plans: ["pc-game-pass", "ultimate"],
  regions: ["JP"],
  status: "available",
  steamAppIds: [1245620],
  match: { method: "manual", confidence: 1 },
  updatedAt: "2026-08-03T03:00:00.000Z",
};

const CONSOLE_ONLY_ENTRY = {
  ...AVAILABLE_ENTRY,
  id: "sample-console-only",
  platforms: ["console"],
  plans: ["ultimate"],
  steamAppIds: [1086940],
};

const CATALOG: Record<string, unknown> = {
  "1245620": AVAILABLE_ENTRY,
  "1086940": CONSOLE_ONLY_ENTRY,
};

/**
 * chrome スタブを注入し、Steam URLをフィクスチャHTMLで応答させ、
 * ビルド済み content.js を注入する。
 */
async function setupSteamPage(
  page: Page,
  options: { path: string; fixture: string; fail?: boolean }
): Promise<void> {
  const html = readFileSync(options.fixture, "utf8");

  await page.addInitScript(
    ([catalog, fail]) => {
      const w = window as unknown as {
        __CATALOG: Record<string, unknown>;
        __FAIL: boolean;
        chrome: unknown;
      };
      w.__CATALOG = catalog as Record<string, unknown>;
      w.__FAIL = fail as boolean;
      w.chrome = {
        runtime: {
          sendMessage: (message: { appId: number }) =>
            w.__FAIL
              ? Promise.reject(new Error("network failure"))
              : Promise.resolve({
                  type: "gamepass-lookup-result",
                  entry: w.__CATALOG[String(message.appId)] ?? null,
                }),
        },
        storage: {
          local: { get: () => Promise.resolve({}) },
        },
      };
    },
    [CATALOG, options.fail ?? false] as const
  );

  await page.route("https://store.steampowered.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html })
  );

  await page.goto(`https://store.steampowered.com${options.path}`);
  await page.addScriptTag({ path: CONTENT_BUNDLE });
}

test("対象作品(PC Game Pass)ではバッジが表示される", async ({ page }) => {
  await setupSteamPage(page, {
    path: "/app/1245620/ELDEN_RING/",
    fixture: FIXTURE_NORMAL,
  });

  const badge = page.locator(ROOT_SELECTOR);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("PC Game Passでプレイできます");
  await expect(badge.locator("a")).toHaveAttribute(
    "href",
    AVAILABLE_ENTRY.xboxUrl
  );
});

test("Consoleのみの作品ではバッジが表示されない", async ({ page }) => {
  await setupSteamPage(page, {
    path: "/app/1086940/SampleConsole/",
    fixture: FIXTURE_NORMAL,
  });

  await page.waitForTimeout(200);
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(0);
});

test("カタログに無い作品ではバッジが表示されない", async ({ page }) => {
  await setupSteamPage(page, {
    path: "/app/570/Dota/",
    fixture: FIXTURE_NORMAL,
  });

  await page.waitForTimeout(200);
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(0);
});

test("バッジは二重挿入されない", async ({ page }) => {
  await setupSteamPage(page, {
    path: "/app/1245620/ELDEN_RING/",
    fixture: FIXTURE_NORMAL,
  });
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(1);

  // content.js をもう一度注入して handlePage を再実行させる。
  await page.addScriptTag({ path: CONTENT_BUNDLE });
  await page.waitForTimeout(100);
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(1);
});

test("URL変更後に再判定される", async ({ page }) => {
  // 最初はカタログに無いappId。
  await setupSteamPage(page, {
    path: "/app/570/Dota/",
    fixture: FIXTURE_NORMAL,
  });
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(0);

  // SPA的にURLを対象作品へ変更し、DOM変更でMutationObserverを発火させる。
  await page.evaluate(() => {
    history.pushState({}, "", "/app/1245620/ELDEN_RING/");
    document.body.appendChild(document.createElement("span"));
  });

  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(1);
});

test("挿入先が無いページでは何も起きない（ページを壊さない）", async ({
  page,
}) => {
  await setupSteamPage(page, {
    path: "/app/1245620/ELDEN_RING/",
    fixture: FIXTURE_NO_TARGET,
  });

  await page.waitForTimeout(200);
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(0);
  // 本文は保持されている。
  await expect(page.locator("#unrelated")).toContainText("本文");
});

test("カタログ取得に失敗してもページを壊さない", async ({ page }) => {
  await setupSteamPage(page, {
    path: "/app/1245620/ELDEN_RING/",
    fixture: FIXTURE_NORMAL,
    fail: true,
  });

  await page.waitForTimeout(200);
  await expect(page.locator(ROOT_SELECTOR)).toHaveCount(0);
  await expect(page.locator(".game_area_purchase_game")).toBeVisible();
});
