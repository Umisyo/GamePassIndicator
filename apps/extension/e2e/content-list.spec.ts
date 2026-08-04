import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = resolve(here, "../dist/content-list.js");
const FIXTURE = resolve(here, "../../../fixtures/steam/search-results.html");

const ICON = ".steam-gamepass-list-icon";

const AVAILABLE_ENTRY = {
  id: "e",
  canonicalTitle: "ELDEN RING",
  normalizedTitle: "elden ring",
  aliases: [],
  xboxUrl: "https://www.xbox.com/ja-JP/games/store/-/E",
  platforms: ["pc"],
  plans: ["pc-game-pass"],
  regions: ["JP"],
  status: "available",
  steamAppIds: [1245620],
  match: { method: "manual", confidence: 1 },
  updatedAt: "2026-08-03T03:00:00.000Z",
};

const CONSOLE_ONLY = {
  ...AVAILABLE_ENTRY,
  id: "c",
  platforms: ["console"],
  steamAppIds: [1086940],
};

// カタログに存在する App ID のみ返す（ELDEN RING=対象, console-only=非対象。Dota=カタログ外）
const CATALOG: Record<string, unknown> = {
  "1245620": AVAILABLE_ENTRY,
  "1086940": CONSOLE_ONLY,
};

async function setup(page: Page): Promise<void> {
  const html = readFileSync(FIXTURE, "utf8");
  await page.addInitScript((catalog) => {
    const w = window as unknown as { chrome: unknown };
    w.chrome = {
      runtime: {
        sendMessage: (msg: { appIds: number[] }) => {
          const entries: Record<string, unknown> = {};
          for (const id of msg.appIds) {
            const found = (catalog as Record<string, unknown>)[String(id)];
            if (found) entries[String(id)] = found;
          }
          return Promise.resolve({
            type: "gamepass-lookup-batch-result",
            entries,
          });
        },
      },
    };
  }, CATALOG);
  await page.route("https://store.steampowered.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html })
  );
  await page.goto("https://store.steampowered.com/search/?term=x");
  await page.addScriptTag({ path: BUNDLE });
}

test("PC Game Pass対象の行だけにアイコンが付く", async ({ page }) => {
  await setup(page);

  // ELDEN RING の行にアイコン
  const eldenRow = page.locator('[data-ds-appid="1245620"]');
  await expect(eldenRow.locator(ICON)).toHaveCount(1);

  // Dota(カタログ外)と Console-only にはアイコンなし
  await expect(page.locator('[data-ds-appid="570"]').locator(ICON)).toHaveCount(0);
  await expect(page.locator('[data-ds-appid="1086940"]').locator(ICON)).toHaveCount(0);

  // 全体でアイコンは1つ
  await expect(page.locator(ICON)).toHaveCount(1);
});

test("動的に追加された行にもアイコンが付き、二重付与されない", async ({ page }) => {
  await setup(page);
  await expect(page.locator(ICON)).toHaveCount(1);

  // 無限スクロールで新しい対象行が追加されるのを模す
  await page.evaluate(() => {
    const rows = document.getElementById("search_resultsRows");
    const a = document.createElement("a");
    a.className = "search_result_row";
    a.setAttribute("data-ds-appid", "1245620");
    a.textContent = "ELDEN RING (dup listing)";
    rows?.appendChild(a);
  });

  await expect(page.locator(ICON)).toHaveCount(2);

  // 再度DOM変化を起こしても増えない（二重付与しない）
  await page.evaluate(() => {
    document.body.appendChild(document.createElement("div"));
  });
  await page.waitForTimeout(250);
  await expect(page.locator(ICON)).toHaveCount(2);
});
