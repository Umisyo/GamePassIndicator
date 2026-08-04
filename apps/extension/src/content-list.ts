import {
  buildRenderModel,
  type GamePassCatalogEntry,
  type LookupBatchRequest,
  type LookupBatchResponse,
} from "@gamepass-indicator/core";

const ICON_CLASS = "steam-gamepass-list-icon";
const CHECKED_ATTR = "data-gp-checked";

interface RowRef {
  el: HTMLElement;
  appId: number;
}

/**
 * 検索結果・ウィッシュリストの行から Steam App ID を取り出す。
 * Steamは行に data-ds-appid（検索）や data-app-id（ウィッシュリスト）を持つ。
 * バンドル行はカンマ区切りになるため先頭のみ使う。
 */
function collectRows(): RowRef[] {
  const rows: RowRef[] = [];
  const seen = new Set<HTMLElement>();
  const selectors = "[data-ds-appid], [data-app-id]";
  for (const node of document.querySelectorAll(selectors)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hasAttribute(CHECKED_ATTR)) continue;
    if (seen.has(node)) continue;
    const raw =
      node.getAttribute("data-ds-appid") ?? node.getAttribute("data-app-id");
    const first = raw?.split(",")[0]?.trim();
    const appId = Number(first);
    if (!Number.isSafeInteger(appId) || appId <= 0) continue;
    seen.add(node);
    rows.push({ el: node, appId });
  }
  return rows;
}

function addIcon(el: HTMLElement): void {
  if (el.querySelector(`.${ICON_CLASS}`)) return;
  const icon = document.createElement("span");
  icon.className = ICON_CLASS;
  icon.textContent = "Game Pass";
  icon.title = "PC Game Pass対象";
  // レイアウトを崩しにくいよう行の先頭へ差し込む。
  el.prepend(icon);
}

async function batchLookup(
  appIds: number[]
): Promise<Record<string, GamePassCatalogEntry>> {
  const request: LookupBatchRequest = {
    type: "gamepass-lookup-batch",
    appIds,
  };
  const response = (await chrome.runtime.sendMessage(request)) as
    | LookupBatchResponse
    | undefined;
  return response?.entries ?? {};
}

let processing = false;

async function processRows(): Promise<void> {
  if (processing) return;
  const rows = collectRows();
  if (rows.length === 0) return;

  processing = true;
  // 再クエリを避けるため先にチェック済みとしてマークする。
  for (const row of rows) {
    row.el.setAttribute(CHECKED_ATTR, "1");
  }

  try {
    const appIds = [...new Set(rows.map((r) => r.appId))];
    const entries = await batchLookup(appIds);
    for (const row of rows) {
      const entry = entries[String(row.appId)];
      // 表示条件（confidence・PC対象）は content 側で判定する。
      if (entry && buildRenderModel(entry)) {
        addIcon(row.el);
      }
    }
  } catch {
    // 失敗時はマークを外して次の機会に再試行する（ページは壊さない）。
    for (const row of rows) {
      row.el.removeAttribute(CHECKED_ATTR);
    }
  } finally {
    processing = false;
  }
}

/**
 * 検索結果は無限スクロール、ウィッシュリストは動的追加されるため、
 * DOM変化を監視して新規行だけ処理する（debounceで過剰処理を防ぐ）。
 */
function observeRowChanges(): void {
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void processRows();
    }, 150) as unknown as number;
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

observeRowChanges();
void processRows();
