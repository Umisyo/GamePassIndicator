# Steam Game Pass Indicator

SteamストアでゲームがPC Game Pass対象かを表示するChrome拡張。
拡張は実行時にXboxを検索せず、事前生成した静的JSONカタログをSteam App IDで引くだけの薄いクライアント。

現状は以下が動作する。

- **Phase 1: Chrome拡張の縦切りMVP** — 商品ページにバッジ表示
- **Phase 2: 外部カタログ配信** — background が GitHub Pages 上のカタログを ETag/TTL 付きで取得・`chrome.storage.local` にキャッシュ。取得失敗時は既存キャッシュ／バンドル版へフォールバック。options に最終更新表示と手動更新
- **Phase 3（一部）: 検索結果・ウィッシュリストのアイコン** — `content-list.ts` が行の `data-ds-appid`/`data-app-id` を一括照会し、PC Game Pass対象の行に小アイコンを付与。無限スクロールの追加行も監視（二重付与防止）
- **Catalog Builder** — Xbox Game Pass一覧を取得しSteam App IDと照合して静的カタログを生成。**実データで生成・検証済み**（下記）
- **CI**: カタログ更新（cron）とPages配信のワークフロー

### 初回カタログ（実データ）

全506件のPC Game Passを実ビルドし、**約382作品が exact-title で自動採用・偽陽性ゼロ**（`generated/catalog-ja-jp.json`, 約250KB）。未マッチの多くはSteam非提供作品（原神・LoL・Rocket League・Battle.net/Ubisoft Connect/MS Store専用等）で正しく未確定。同一ゲームがXbox側で複数SKUとして存在し1つのSteam App IDに集約されるケース（例 Brawlhalla）は重複排除し、別ゲームの衝突のみ `conflicts` に記録する。

学び:
- **検索語クリーナー**を強化（記号 `®™`・末尾 `Windows`/`PC`・`: Windows Edition` 等の除去）すると、`Cooking Simulator Windows` / `Goat Simulator 3: Windows Edition` などが本編に到達して回復する（検索語の緩和は matcher が閾値でゲートするため偽陽性を増やさない）。
- 一方 **照合側の正規化で `gold`/`ultimate` 等まで無条件に落とすと逆効果**。Steamが「本編」と「〇〇エディション」を別アプリとして返すと両者が同一正規化になり曖昧化する（発売年で絞れない `--no-enrich` では未確定が増える）。装飾除去は検索語側に寄せ、照合側は保守的に保つ。
- Steamストア検索はスロットリングがあり、高並列だと一部が取りこぼされ数値が数件ぶれる。nightly は `--concurrency 2` に抑制。さらなる精度は appdetails 有効化（発売年での曖昧解消）や `data/overrides.json` での手動補正で得る。

### 実地検証の結果（PC Game Pass 実データ）

実際の PC Game Pass sigl（506作品）と Steam ストア検索で先頭15件をライブ照合したところ、チューニングを重ねて **14/15 が自動採用（exact-title/fuzzy）、偽陽性ゼロ**（9→12→13→14）。残る1件は「Steamに本編が存在せず体験版のみ」で正しく未確定。他に「本編がSteam未登録でDLCのみ」等は手動 override で対応する。

この過程で以下をチューニングした（いずれも最悪ケースは未確定＝偽陽性は増えない）。

- タイトル正規化にハイフン/ダッシュ区切り、日本語括弧（`「」『』`）、ノイズ語（`通常版`/`スタンダード`/`エディション`/`ゲーム プレビュー`/`standard`）除去を追加（`deluxe`/`premium` 等の内容差を表す語は残す）
- Steam検索語のクリーナー（`- Windows` / `(Windows PC)` / 囲み括弧 / エディション表記の除去）
- **JP↔EN表記差への英語フォールバック**: Xboxから英語タイトルも取得（`languages=en-us` の別コール）し、`titleAlternates` として検索（英語ストア）・照合の両方で利用（例: `『スター・ウォーズ 無法者たち』` → Steam `Star Wars Outlaws` に一致）

## リポジトリ構成

```
steam-gamepass-indicator/
├── apps/
│   ├── extension/          # Chrome拡張 (Manifest V3)
│   │   ├── manifest.json
│   │   ├── build.mjs        # esbuildビルド
│   │   ├── playwright.config.ts
│   │   ├── options.html
│   │   ├── src/
│   │   │   ├── content.ts   # App ID取得・照合問い合わせ・バッジ挿入・URL監視
│   │   │   ├── background.ts # カタログ取得(ETag/TTL)/キャッシュ/lookup応答
│   │   │   ├── config.ts     # 配信URL（ビルド時に上書き可）
│   │   │   ├── options.ts    # 設定・最終更新表示・手動更新
│   │   │   └── styles.css
│   │   └── e2e/content.spec.ts  # 保存HTMLベースのE2E
│   └── catalog-builder/    # Xbox取得→照合→検証→カタログ生成
│       └── src/
│           ├── providers/       # 取得元を隔離（Xbox / Steam の live + fixture）
│           ├── manual-data.ts   # overrides/aliases/exclusions を照合用に展開
│           ├── matcher.ts       # 段階照合（純粋・テスト厚め）
│           ├── generate.ts      # App IDキーのカタログ組み立て
│           ├── validate.ts      # 生成前バリデーション（大量削除ガード等）
│           ├── build.ts         # 取得→照合→生成→検証の一気通貫
│           └── cli.ts           # エントリ（IO・プロバイダ配線）
├── packages/
│   └── core/                # Chrome版・Millennium版で共有する純粋ロジック
│       └── src/
│           ├── types.ts          # カタログ型・メッセージ型
│           ├── steam-app-id.ts    # URL -> App ID
│           ├── normalize-title.ts # タイトル正規化（Builder用）
│           ├── lookup.ts          # カタログ検索・PC Game Pass判定・confidence
│           ├── render-model.ts     # 表示モデル生成・設定
│           ├── cache.ts            # キャッシュ形・TTL判定
│           └── *.test.ts           # Vitest
├── data/                    # 手動補正（Builder用・現状は空）
│   ├── aliases.json
│   ├── overrides.json
│   └── exclusions.json
├── generated/               # 静的カタログ（将来はBuilderの出力）
│   ├── catalog-ja-jp.json
│   └── catalog-meta.json
├── fixtures/                # テスト用の保存HTML
│   ├── steam/
│   └── xbox/
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── vitest.config.ts
```

## 前提

- Node.js 22 以上
- pnpm 10 以上

## セットアップ

```bash
pnpm install
```

esbuild のネイティブバイナリ取得は `package.json` の `pnpm.onlyBuiltDependencies` で許可済み。

## ビルド

```bash
pnpm build          # apps/extension/dist を生成
# 開発時: cd apps/extension && node build.mjs --watch
```

生成物 `apps/extension/dist/` に `manifest.json` / `content.js` / `background.js` / `options.js` / `options.html` / `styles.css` が出力される。

## Chromeへの読み込み

1. `pnpm build` を実行
2. Chrome/Edge で `chrome://extensions` を開く
3. 「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」で `apps/extension/dist` を選択
5. Steam商品ページを開いて確認
   - 対象例（固定カタログ）: `https://store.steampowered.com/app/1245620/`（ELDEN RING / サンプルデータ）→ バッジ表示
   - Consoleのみ例: `.../app/1086940/` → 非表示
   - カタログ外: 非表示

> `generated/catalog-ja-jp.json` はサンプルデータ。実際のGame Pass対象を反映したものではない（Catalog Builder実装で置き換える）。

## パッケージング & リリース

```bash
# dist をビルドして extension.zip を作成（Chrome Web Store へアップロードする成果物）
pnpm --filter @gamepass-indicator/extension package

# アイコンを再生成（icons/*.png。本番用デザインができたら差し替え）
pnpm --filter @gamepass-indicator/extension gen-icons
```

### CI（自動ビルド）
- `.github/workflows/ci.yml`: push(main)/PR で typecheck・unit・E2E・`package` を実行し、`extension.zip` を**Artifact**として保存
- `.github/workflows/extension-release.yml`: `v*` タグの push で zip をビルドし **GitHub Release** に添付

### Chrome Web Store 公開手順
1. `manifest.json` の `version` を上げる（公開ごとに増やす。再利用不可）
2. `git tag v0.1.1 && git push origin v0.1.1` → Release に zip が付く（または CI Artifact / ローカル `package` の zip を使う）
3. [Developer Dashboard](https://chrome.google.com/webstore/devconsole)（初回のみ $5 登録）で zip をアップロード
4. リスティング入力: アイコン128×128（`icons/icon-128.png`）、スクリーンショット（1280×800 か 640×400）、説明、カテゴリ、言語、プライバシー慣行の申告（本拡張は個人データ非収集）
5. 送信 → 審査（数時間〜数日）

Edge Add-ons は [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)（無料）へ同じ zip をアップロードすれば公開できる。

## テスト

```bash
pnpm test        # Vitest ユニットテスト（packages/core）
pnpm test:e2e    # Playwright E2E（ビルド→保存HTMLで検証）
```

E2E初回のみブラウザ取得が必要:

```bash
cd apps/extension && pnpm exec playwright install chromium
```

## 型チェック

```bash
pnpm typecheck   # 全パッケージ tsc --noEmit（strict）
```

## Catalog Builder

Xbox Game Pass一覧を取得し、Steam App IDと照合して `generated/catalog-ja-jp.json` を生成する。

```bash
# fixture（保存JSON）で取得→照合→生成→検証を通す（ネットワーク不要・デモ/CI向け）
pnpm --filter @gamepass-indicator/catalog-builder build:fixture

# 実データ取得（Microsoftカタログ + Steamストア検索/appdetails）
# 主なフラグ: --concurrency N（並列度） --no-enrich（appdetails無効=高速・低負荷）
#            --limit N（件数上限） --out PATH（出力先） --max-candidates N
pnpm --filter @gamepass-indicator/catalog-builder build --concurrency 4 --no-enrich

# 件数を絞ったライブ検証（appdetailsで発売年/パブリッシャーも補完）
pnpm --filter @gamepass-indicator/catalog-builder exec \
  tsx src/cli.ts build --limit 15 --out /tmp/catalog.json
```

### 照合パイプライン（`matcher.ts`）

偽陽性（対象外を対象と誤表示）を最優先で防ぐため、confidenceの高い順に段階照合し、曖昧なものは未確定として**出力しない**。

1. 手動オーバーライド（`data/overrides.json`, confidence 1.0）
2. 既知の共通ID（product-id, 1.0）
3. 正規化タイトル完全一致（exact-title, 0.99）
4. 別名一致（`data/aliases.json`, alias, 0.98）— 例: NieRのエディション名違い
5. タイトル＋発売年＋パブリッシャーの曖昧一致（fuzzy）
6. しきい値（既定0.98）未満は未確定リストへ

`data/exclusions.json` のApp IDは候補から除外する。

### 取得元の隔離（`providers/`）

`CatalogProvider` / `SteamCandidateResolver` インターフェースで取得手段を隔離している。

- **Xbox**: `LiveXboxProvider` は Microsoft の sigls/displaycatalog JSONエンドポイントを利用（PC Game Pass専用siglから引くのでPC/Console誤判定を回避）。日本語に加え `en-us` の別コールで英語タイトルを取得し `titleAlternates` に付与する（`alternateLocale: null` で無効化可）。DOMスクレイピングより堅牢という判断だが公式保証APIではないため Provider 層に閉じ込めてある（将来Playwright版へ差し替え可能）。`FixtureXboxProvider` は保存JSONで同じパーサを通す。
- **Steam**: `LiveSteamResolver` は Steam ストア検索(`storesearch`)でタイトルから候補を絞り、`appdetails` で発売年・パブリッシャーを補完する（`GetAppList` は現在 `Method not found` のため不使用）。`FixtureSteamResolver` は固定候補を返す。パーサは実データ fixture (`fixtures/**/*.real.json`) でテスト済み。

### 生成前バリデーション（`validate.ts`）

0件・PC非対応へのPCプラン付与・App ID競合・必須フィールド欠落・**前回比20%超の大量削除**を検出すると例外を投げ、公開を止める（Xbox側変更で空カタログを配信する事故を防ぐ）。

## 配信とキャッシュ (Phase 2)

- **配信**: `.github/workflows/deploy-pages.yml` が `generated/` をGitHub Pagesのサイトルートへ公開する。カタログURLは `https://umisyo.github.io/GamePassIndicator/catalog-ja-jp.json`。リポジトリの Settings → Pages で「GitHub Actions」を有効化しておく。
- **配信URLの変更**: 拡張の既定URLは `apps/extension/src/config.ts`。ビルド時に `CATALOG_BASE_URL=https://... pnpm build` で上書きできる（`manifest.json` の `host_permissions` も合わせて更新すること）。
- **拡張のキャッシュ**（`background.ts`）: 初回はバンドル版を種にし、24時間ごとに `If-None-Match`(ETag) 付きで更新を試みる。304は時刻のみ更新、200は差し替え、失敗時は既存キャッシュを保持。判定ロジックは `packages/core` の `applyFetchOutcome` としてテスト済み。
- **手動更新**: options ページの「今すぐ更新」で強制取得し、最終更新日時（`catalog.generatedAt`）を表示する。
