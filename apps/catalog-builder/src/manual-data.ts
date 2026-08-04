import { normalizeGameTitle } from "@gamepass-indicator/core";
import type {
  AliasesFile,
  ExclusionsFile,
  ManualContext,
  OverridesFile,
} from "./types";

function parseAppId(key: string): number {
  const id = Number(key);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`手動補正のSteam App IDが不正です: "${key}"`);
  }
  return id;
}

/**
 * overrides / exclusions / aliases を照合用コンテキストへ展開する。
 *
 * - overrides は Steam App ID主キー。xboxProductId 単位で引けるよう逆引きにする。
 * - aliases のキー・値は任意表記でよく、拡張と同じ正規化を通してからグループ化する。
 *   例: "NieR:Automata Game of the YoRHa Edition" と
 *       "NieR:Automata BECOME AS GODS Edition" を同一グループにできる。
 */
export function buildManualContext(input: {
  overrides: OverridesFile;
  exclusions: ExclusionsFile;
  aliases: AliasesFile;
}): ManualContext {
  const overrideByProductId = new Map<string, number[]>();
  for (const [appIdKey, value] of Object.entries(input.overrides)) {
    const appId = parseAppId(appIdKey);
    if (!value.xboxProductId) {
      throw new Error(`override に xboxProductId がありません: ${appIdKey}`);
    }
    const list = overrideByProductId.get(value.xboxProductId) ?? [];
    list.push(appId);
    overrideByProductId.set(value.xboxProductId, list);
  }

  const exclusions = new Set<number>();
  for (const [appIdKey, value] of Object.entries(input.exclusions)) {
    if (value.exclude) {
      exclusions.add(parseAppId(appIdKey));
    }
  }

  const aliasGroupOf = new Map<string, number>();
  let groupId = 0;
  for (const [key, values] of Object.entries(input.aliases)) {
    const members = [key, ...values]
      .map((t) => normalizeGameTitle(t))
      .filter((t) => t.length > 0);
    if (members.length === 0) {
      continue;
    }
    const id = groupId++;
    for (const member of members) {
      aliasGroupOf.set(member, id);
    }
  }

  return { overrideByProductId, exclusions, aliasGroupOf };
}
