import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type MetaRequest,
  type MetaResponse,
  type RefreshRequest,
} from "@gamepass-indicator/core";

const STORAGE_KEY = "settings";

async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const partial = stored[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function getCheckbox(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`checkbox not found: ${id}`);
  }
  return el;
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "未取得";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

async function renderCatalogStatus(generatedAt: string | null): Promise<void> {
  const el = document.getElementById("catalog-updated");
  if (el) el.textContent = formatUpdated(generatedAt);
}

async function initCatalogSection(): Promise<void> {
  const metaReq: MetaRequest = { type: "gamepass-meta" };
  const meta = (await chrome.runtime.sendMessage(metaReq)) as
    | MetaResponse
    | undefined;
  await renderCatalogStatus(meta?.generatedAt ?? null);

  const button = document.getElementById("refresh");
  button?.addEventListener("click", () => {
    void (async () => {
      if (button instanceof HTMLButtonElement) button.disabled = true;
      try {
        const refreshReq: RefreshRequest = { type: "gamepass-refresh" };
        const res = (await chrome.runtime.sendMessage(refreshReq)) as
          | MetaResponse
          | undefined;
        await renderCatalogStatus(res?.generatedAt ?? null);
      } finally {
        if (button instanceof HTMLButtonElement) button.disabled = false;
      }
    })();
  });
}

async function init(): Promise<void> {
  const showLeaving = getCheckbox("show-leaving-date");
  const showUnavailable = getCheckbox("show-unavailable");

  const settings = await loadSettings();
  showLeaving.checked = settings.showLeavingDate;
  showUnavailable.checked = settings.showUnavailable;

  const persist = async (): Promise<void> => {
    await saveSettings({
      region: "JP",
      showLeavingDate: showLeaving.checked,
      showUnavailable: showUnavailable.checked,
    });
  };

  showLeaving.addEventListener("change", () => void persist());
  showUnavailable.addEventListener("change", () => void persist());

  await initCatalogSection();
}

void init();
