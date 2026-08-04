import type { GamePassCatalogEntry } from "./types";
import { isAvailableOnPcGamePass, isConfidentEnough } from "./lookup";

/**
 * 拡張機能の設定。MVPでは最小限。
 */
export interface ExtensionSettings {
  region: "JP";
  showUnavailable: boolean;
  showLeavingDate: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  region: "JP",
  showUnavailable: false,
  showLeavingDate: true,
};

/**
 * DOMに依存しない表示モデル。
 * Chrome版・Millennium版はこのモデルを各環境のUIに変換する。
 */
export interface IndicatorRenderModel {
  heading: string;
  statusLine: string;
  linkLabel: string;
  linkUrl: string;
  /** ISO文字列。表示しない場合は undefined。 */
  leavingAt?: string;
}

/**
 * エントリと設定から表示モデルを生成する。
 *
 * 表示すべきでない場合は null を返す（呼び出し側はUIを挿入しない）。
 * - confidenceが低い
 * - PC Game Pass対象ではない（Consoleのみ・Cloudのみ・未確定・対象外）
 */
export function buildRenderModel(
  entry: GamePassCatalogEntry,
  settings: ExtensionSettings = DEFAULT_SETTINGS
): IndicatorRenderModel | null {
  if (!isConfidentEnough(entry)) {
    return null;
  }
  if (!isAvailableOnPcGamePass(entry)) {
    return null;
  }

  const model: IndicatorRenderModel = {
    heading: "Xbox Game Pass",
    statusLine: "✓ PC Game Passでプレイできます",
    linkLabel: "Xboxで確認",
    linkUrl: entry.xboxUrl,
  };

  if (settings.showLeavingDate && entry.leavingAt) {
    return { ...model, leavingAt: entry.leavingAt };
  }
  return model;
}
