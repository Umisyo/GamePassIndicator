import type { GamePassCatalog } from "@gamepass-indicator/core";

export interface ValidateOptions {
  /** 前回カタログの件数。0なら削除率チェックをスキップ。 */
  previousEntryCount: number;
  /** 大量削除とみなす割合。 */
  maxRemovalRatio?: number;
}

export class CatalogValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`カタログのバリデーションに失敗しました:\n- ${issues.join("\n- ")}`);
    this.name = "CatalogValidationError";
    this.issues = issues;
  }
}

/**
 * 生成前バリデーション。Xbox側DOM/API変更による事故（空カタログ配信・大量削除）を防ぐ。
 * 問題があれば CatalogValidationError を投げる。
 */
export function validateCatalog(
  catalog: GamePassCatalog,
  options: ValidateOptions
): void {
  const issues: string[] = [];

  if (catalog.schemaVersion !== 1) {
    issues.push(`schemaVersion が不正です: ${catalog.schemaVersion}`);
  }

  const entries = Object.entries(catalog.entriesBySteamAppId);
  if (entries.length === 0) {
    issues.push("生成件数が0件です");
  }

  const seenAppIds = new Map<string, string>();
  for (const [key, entry] of entries) {
    const appId = Number(key);
    if (!Number.isSafeInteger(appId) || appId <= 0) {
      issues.push(`Steam App IDが正の整数ではありません: "${key}"`);
    }

    // キーが entry.steamAppIds に含まれているか
    if (!entry.steamAppIds.includes(appId)) {
      issues.push(`App ID ${key} が entry.steamAppIds に含まれていません`);
    }

    // 同一App IDの競合（別作品）
    const owner = seenAppIds.get(key);
    if (owner && owner !== entry.id) {
      issues.push(`App ID ${key} が複数作品に割り当てられています (${owner} / ${entry.id})`);
    }
    seenAppIds.set(key, entry.id);

    // 必須フィールド
    if (!entry.xboxUrl) {
      issues.push(`App ID ${key}: xboxUrl がありません`);
    }
    if (!entry.canonicalTitle) {
      issues.push(`App ID ${key}: canonicalTitle がありません`);
    }
    if (entry.platforms.length === 0) {
      issues.push(`App ID ${key}: platforms が空です`);
    }
    if (entry.plans.length === 0) {
      issues.push(`App ID ${key}: plans が空です`);
    }

    // PC非対応をPC Game Pass扱いしていないか
    const claimsPcPlan =
      entry.plans.includes("pc-game-pass") || entry.plans.includes("ultimate");
    if (claimsPcPlan && !entry.platforms.includes("pc")) {
      issues.push(
        `App ID ${key}: PC非対応なのにPC Game Passプランが付与されています`
      );
    }
  }

  // 大量削除の検出
  const maxRemovalRatio = options.maxRemovalRatio ?? 0.2;
  if (options.previousEntryCount > 0) {
    const removed = options.previousEntryCount - entries.length;
    const removedRatio = removed / options.previousEntryCount;
    if (removedRatio > maxRemovalRatio) {
      issues.push(
        `作品の削除率が異常です: ${(removedRatio * 100).toFixed(1)}% (${options.previousEntryCount} -> ${entries.length})`
      );
    }
  }

  if (issues.length > 0) {
    throw new CatalogValidationError(issues);
  }
}
