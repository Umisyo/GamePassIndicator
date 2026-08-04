/**
 * Steamの商品ページURLからApp IDを取得する。
 *
 * 実行時にSteamの商品名とXboxの商品名を比較してはいけない。
 * 拡張機能はこのApp IDだけをキーに静的カタログを検索する。
 *
 * 例: https://store.steampowered.com/app/1245620/ELDEN_RING/ -> 1245620
 */
export function getSteamAppId(url: URL): number | null {
  const match = url.pathname.match(/^\/app\/(\d+)(?:\/|$)/);
  if (!match) {
    return null;
  }
  const appId = Number(match[1]);
  return Number.isSafeInteger(appId) && appId > 0 ? appId : null;
}
