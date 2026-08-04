import {
  applyFetchOutcome,
  isCacheStale,
  lookupBySteamAppId,
  lookupManyBySteamAppId,
  type CatalogCache,
  type CatalogFetchOutcome,
  type ExtensionMessage,
  type GamePassCatalog,
  type LookupBatchResponse,
  type LookupResponse,
} from "@gamepass-indicator/core";
import bundledCatalog from "../../../generated/catalog-ja-jp.json";
import { CATALOG_URL } from "./config";

const STORAGE_KEY = "catalogCache";

async function readCache(): Promise<CatalogCache | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as CatalogCache | undefined) ?? null;
}

async function writeCache(cache: CatalogCache): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: cache });
}

function seedCache(now: number): CatalogCache {
  return { fetchedAt: now, catalog: bundledCatalog as GamePassCatalog };
}

/**
 * 外部カタログの取得を試み、結果種別へ変換する。
 * 304・失敗・例外を明確に区別し、空カタログでの上書きを避ける。
 */
async function fetchOutcome(existing: CatalogCache): Promise<CatalogFetchOutcome> {
  try {
    const headers: Record<string, string> = {};
    if (existing.etag) {
      headers["If-None-Match"] = existing.etag;
    }
    const response = await fetch(CATALOG_URL, { headers });
    if (response.status === 304) {
      return { kind: "not-modified" };
    }
    if (!response.ok) {
      return { kind: "failed" };
    }
    const catalog = (await response.json()) as GamePassCatalog;
    if (!catalog || typeof catalog.entriesBySteamAppId !== "object") {
      return { kind: "failed" };
    }
    const etag = response.headers.get("ETag");
    return { kind: "updated", catalog, ...(etag ? { etag } : {}) };
  } catch {
    return { kind: "failed" };
  }
}

async function refreshCatalog(existing: CatalogCache): Promise<CatalogCache> {
  const outcome = await fetchOutcome(existing);
  const next = applyFetchOutcome(existing, outcome, Date.now());
  if (next && next !== existing) {
    await writeCache(next);
    return next;
  }
  return existing;
}

async function getCatalog(force = false): Promise<GamePassCatalog> {
  const now = Date.now();
  let cache = await readCache();
  if (!cache) {
    cache = seedCache(now);
    await writeCache(cache);
  }
  if (force || isCacheStale(cache, now)) {
    cache = await refreshCatalog(cache);
  }
  return cache.catalog;
}

chrome.runtime.onInstalled.addListener(() => {
  void getCatalog(true);
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message?.type === "gamepass-lookup") {
      void (async () => {
        try {
          const catalog = await getCatalog();
          const entry = lookupBySteamAppId(catalog, message.appId);
          const response: LookupResponse = { type: "gamepass-lookup-result", entry };
          sendResponse(response);
        } catch {
          const response: LookupResponse = { type: "gamepass-lookup-result", entry: null };
          sendResponse(response);
        }
      })();
      return true;
    }

    if (message?.type === "gamepass-lookup-batch") {
      void (async () => {
        try {
          const catalog = await getCatalog();
          const entries = lookupManyBySteamAppId(catalog, message.appIds);
          const response: LookupBatchResponse = {
            type: "gamepass-lookup-batch-result",
            entries,
          };
          sendResponse(response);
        } catch {
          const response: LookupBatchResponse = {
            type: "gamepass-lookup-batch-result",
            entries: {},
          };
          sendResponse(response);
        }
      })();
      return true;
    }

    if (message?.type === "gamepass-refresh") {
      void (async () => {
        try {
          const catalog = await getCatalog(true);
          sendResponse({ type: "gamepass-meta", generatedAt: catalog.generatedAt });
        } catch {
          sendResponse({ type: "gamepass-meta", generatedAt: null });
        }
      })();
      return true;
    }

    if (message?.type === "gamepass-meta") {
      void (async () => {
        const cache = await readCache();
        sendResponse({
          type: "gamepass-meta",
          generatedAt: cache?.catalog.generatedAt ?? null,
        });
      })();
      return true;
    }

    return false;
  }
);
