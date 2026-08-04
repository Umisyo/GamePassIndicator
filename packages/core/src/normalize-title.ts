/**
 * タイトル正規化。
 *
 * Catalog Builderでのタイトル照合と、カタログ生成時の normalizedTitle 算出に使う。
 * 実行時（拡張側）のタイトル曖昧検索には使わない。
 *
 * 注意: remastered / remake / complete / definitive / 2 / ii / iii などは
 * 別作品を表す可能性があるため無条件に除去しない。
 */
export function normalizeGameTitle(input: string): string {
  return (
    input
      // ™ は NFKC で "TM" に展開されてしまうため、正規化より前に除去する。
      .replace(/[™®©]/g, "")
      .normalize("NFKC")
      .toLowerCase()
      // 記号・各種括弧・引用符・ハイフン類は区切りとして空白化する
      // （日本語タイトルの「」『』等、および "Title - Windows" のダッシュを含む）。
      .replace(/[:：'"’“”・「」『』【】〔〕()[\]\-–—]/g, " ")
      // エディション/早期アクセスを表すノイズ語（別作品判別には寄与しない）を除去する。
      // deluxe/gold/ultimate 等を無条件に落とすと「本編」と「〇〇エディション」が
      // 同一正規化になり曖昧が増える（appdetailsの発売年で絞れない場合に未確定が増加）ため、
      // ここでは範囲を絞り、装飾除去は検索語クリーナー側に寄せる。
      // remastered/remake/definitive/complete は別作品の可能性があるため残す。
      .replace(/通常版|スタンダード|エディション|ゲーム\s*プレビュー/g, " ")
      .replace(/\b(the|edition|windows|pc|standard|game\s+preview)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
