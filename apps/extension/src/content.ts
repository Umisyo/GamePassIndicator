import {
  buildRenderModel,
  DEFAULT_SETTINGS,
  getSteamAppId,
  type ExtensionSettings,
  type GamePassCatalogEntry,
  type IndicatorRenderModel,
  type LookupRequest,
  type LookupResponse,
} from "@gamepass-indicator/core";

const ROOT_ID = "steam-gamepass-indicator-root";

/**
 * Steam側DOMの深い階層に強く依存しないよう、複数の挿入候補を用意する。
 */
const TARGET_SELECTORS = [
  ".game_area_purchase_game",
  "#game_area_purchase",
  ".game_meta_data",
];

function findInsertionTarget(): Element | null {
  for (const selector of TARGET_SELECTORS) {
    const target = document.querySelector(selector);
    if (target) {
      return target;
    }
  }
  return null;
}

function createIndicatorElement(model: IndicatorRenderModel): HTMLElement {
  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.className = "steam-gamepass-indicator";

  const title = document.createElement("strong");
  title.className = "steam-gamepass-indicator__heading";
  title.textContent = model.heading;

  const status = document.createElement("div");
  status.className = "steam-gamepass-indicator__status";
  status.textContent = model.statusLine;

  root.append(title, status);

  if (model.leavingAt) {
    const leaving = document.createElement("div");
    leaving.className = "steam-gamepass-indicator__leaving";
    leaving.textContent = `提供終了予定: ${formatDate(model.leavingAt)}`;
    root.append(leaving);
  }

  const link = document.createElement("a");
  link.className = "steam-gamepass-indicator__link";
  link.href = model.linkUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = model.linkLabel;
  root.append(link);

  return root;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function mountIndicator(model: IndicatorRenderModel): void {
  // 二重挿入を防止
  if (document.getElementById(ROOT_ID)) {
    return;
  }
  const target = findInsertionTarget();
  // 挿入先が見つからない場合は、エラー表示せず何もしない。
  if (!target) {
    return;
  }
  target.prepend(createIndicatorElement(model));
}

function removeIndicator(): void {
  document.getElementById(ROOT_ID)?.remove();
}

async function getSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get("settings");
    const partial = stored["settings"] as Partial<ExtensionSettings> | undefined;
    return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function lookupEntry(appId: number): Promise<GamePassCatalogEntry | null> {
  const request: LookupRequest = { type: "gamepass-lookup", appId };
  const response = (await chrome.runtime.sendMessage(request)) as
    | LookupResponse
    | undefined;
  return response?.entry ?? null;
}

async function handlePage(): Promise<void> {
  const appId = getSteamAppId(new URL(location.href));
  if (appId === null) {
    return;
  }

  let entry: GamePassCatalogEntry | null;
  try {
    entry = await lookupEntry(appId);
  } catch {
    // カタログ取得やメッセージングに失敗しても、Steamページ全体を壊さない。
    return;
  }
  if (!entry) {
    return;
  }

  const settings = await getSettings();
  const model = buildRenderModel(entry, settings);
  // Consoleのみ・Cloudのみ・未確定・低confidence・対象外の場合は何も表示しない。
  if (!model) {
    return;
  }

  mountIndicator(model);
}

/**
 * Steamは完全なページリロードなしでURLが切り替わることがある。
 * URLが変わった場合のみ再評価する（コールバックごとに重い処理はしない）。
 */
function observeUrlChanges(): void {
  let currentUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href === currentUrl) {
      return;
    }
    currentUrl = location.href;
    removeIndicator();
    void handlePage();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

observeUrlChanges();
void handlePage();
