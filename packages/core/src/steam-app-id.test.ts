import { describe, expect, it } from "vitest";
import { getSteamAppId } from "./steam-app-id";

describe("getSteamAppId", () => {
  it("商品ページURLからApp IDを取得する", () => {
    const result = getSteamAppId(
      new URL("https://store.steampowered.com/app/1245620/ELDEN_RING/")
    );
    expect(result).toBe(1245620);
  });

  it("末尾スラッシュなしでも取得する", () => {
    const result = getSteamAppId(
      new URL("https://store.steampowered.com/app/1245620")
    );
    expect(result).toBe(1245620);
  });

  it("クエリ文字列付きでも取得する", () => {
    const result = getSteamAppId(
      new URL("https://store.steampowered.com/app/570/Dota_2/?l=japanese")
    );
    expect(result).toBe(570);
  });

  it("商品ページでなければnull", () => {
    const result = getSteamAppId(
      new URL("https://store.steampowered.com/search/")
    );
    expect(result).toBeNull();
  });

  it("App IDが数値でなければnull", () => {
    const result = getSteamAppId(
      new URL("https://store.steampowered.com/app/abc/")
    );
    expect(result).toBeNull();
  });
});
