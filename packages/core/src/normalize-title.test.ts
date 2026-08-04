import { describe, expect, it } from "vitest";
import { normalizeGameTitle } from "./normalize-title";

describe("normalizeGameTitle", () => {
  it("記号・商標記号を除去して小文字化する", () => {
    expect(normalizeGameTitle("ELDEN RING™")).toBe("elden ring");
  });

  it("全角を半角に正規化する（NFKC）", () => {
    expect(normalizeGameTitle("ＮｉｅＲ：Ａｕｔｏｍａｔａ")).toBe("nier automata");
  });

  it("the / edition を除去する", () => {
    expect(normalizeGameTitle("The Witcher 3 Game of the Year Edition")).toBe(
      "witcher 3 game of year"
    );
  });

  it("remastered/definitive/complete は別作品の可能性があり残す", () => {
    expect(normalizeGameTitle("Dark Souls: Remastered")).toBe(
      "dark souls remastered"
    );
    expect(normalizeGameTitle("Age of Empires II: Definitive Edition")).toBe(
      "age of empires ii definitive"
    );
  });

  it("日本語タイトルの括弧・商標記号を空白化する", () => {
    expect(normalizeGameTitle("「オーバーウォッチ®」")).toBe("オーバーウォッチ");
    expect(normalizeGameTitle("ペルソナ５ タクティカ")).toBe("ペルソナ5 タクティカ");
  });

  it("ハイフン/ダッシュ区切りとプラットフォーム表記を除去する", () => {
    expect(normalizeGameTitle("A Plague Tale: Requiem - Windows")).toBe(
      "a plague tale requiem"
    );
  });

  it("エディション/早期アクセスのノイズ語を除去する", () => {
    expect(normalizeGameTitle("NBA 2K26 通常版")).toBe("nba 2k26");
    expect(normalizeGameTitle("9 Kings (ゲーム プレビュー)")).toBe("9 kings");
    expect(normalizeGameTitle("Hades II (Game Preview)")).toBe("hades ii");
    expect(normalizeGameTitle("Halo: Campaign Evolved - Standard Edition")).toBe(
      "halo campaign evolved"
    );
    expect(
      normalizeGameTitle("Halo: Campaign Evolved スタンダード エディション")
    ).toBe("halo campaign evolved");
  });

  it("別作品を表す語（remastered, ii, 2）は残す", () => {
    expect(normalizeGameTitle("Dark Souls II")).toBe("dark souls ii");
    expect(normalizeGameTitle("Mass Effect 2 Remastered")).toBe(
      "mass effect 2 remastered"
    );
  });
});
