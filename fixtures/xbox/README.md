# Xbox fixtures

Catalog Builder（Phase 3）実装時に、Xbox公式ページの保存HTMLをここへ置く。

想定ファイル:

- `catalog.html` — Game Pass一覧ページ
- `product-pc.html` — PC対応作品の商品ページ
- `product-console-only.html` — Consoleのみの商品ページ

これらは実DOMへの依存を避け、Xbox側のDOM変更検知に使う。
