/**
 * 配信カタログのベースURL。
 * GitHub Pages（generated/ をサイトルートとして公開）を既定の配信先とする。
 * ビルド時に esbuild の define で `__CATALOG_BASE_URL__` を差し替え可能。
 */
declare const __CATALOG_BASE_URL__: string | undefined;

const DEFAULT_BASE_URL = "https://umisyo.github.io/GamePassIndicator";

const BASE_URL =
  typeof __CATALOG_BASE_URL__ === "string" && __CATALOG_BASE_URL__.length > 0
    ? __CATALOG_BASE_URL__
    : DEFAULT_BASE_URL;

export const CATALOG_URL = `${BASE_URL}/catalog-ja-jp.json`;
export const META_URL = `${BASE_URL}/catalog-meta.json`;
