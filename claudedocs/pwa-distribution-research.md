# PWA配布・収益化リサーチ — 英検準2級単語バトル（親子向けPWA）

作成日: 2026-07-15
対象: バックエンドなし・静的HTML+JS・オフライン対応PWA（親子英単語対戦ゲーム）

---

## 1. 無料/低コストのPWAホスティング・配布チャネル

### GitHub Pages
- Project Pages（`username.github.io/repo/`）はサブパス配下になるため、Service WorkerのデフォルトスコープはSW配置ディレクトリ以下に限定される。SWを`/repo/sw.js`に置き、`start_url`と`scope`を`/repo/`に揃えれば「ホーム画面に追加」の要件は満たせる ([DEV Community](https://dev.to/devv-romano/how-to-scope-your-pwa-service-workers-1n6m), [gist: kosamari](https://gist.github.com/kosamari/7c5d1e8449b2fbc97d372675f16b566e))。
- より広いスコープが必要な場合は`Service-Worker-Allowed`ヘッダーが必要だが、GitHub Pagesは**カスタムレスポンスヘッダーを設定できない**ため、Project Pagesでは事実上「サブパス内スコープに限定」が制約として残る。User/Organization Pages（ルート直下）ならこの制約は発生しない。
- 長期運用の可否: 静的サイト限定・商用利用不可の規約（"no commercial use"条項）がある点に注意が必要という指摘あり ([jp-my-blog.vercel.app比較記事](https://jp-my-blog.vercel.app/blog/github-pages-vs-netlify-cloudflare-pages-and-vercel-the-only-free-static-site-host-comparison-that-matters))。無料の趣味・非商用配布としては問題ないが、将来的に有料化・広告掲載などマネタイズを行うなら規約上グレーになり得る。

### Cloudflare Pages（推奨の代替）
- 2026年時点で無料枠は「無制限サイト数・無制限帯域・月500ビルド」と非常に太く、独自ドメイン・カスタムヘッダー設定・リダイレクトルールも無料枠で可能 ([DanubeData比較](https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026), [puter.com](https://developer.puter.com/blog/cloudflare-pages-alternatives/))。
- `Service-Worker-Allowed`ヘッダーやCache-Controlを`_headers`ファイルで自由に設定できるため、GitHub PagesのSWスコープ制約を回避できる。
- 2026年はCloudflareが新規のフルスタック/SSR案件をWorkersへ誘導する方針だが、静的PWAのような単純なホスティング用途ではPagesは引き続きサポートされる。

### Netlify / Vercel
- Netlifyは無料枠で商用利用可、帯域は月100GBキャップ（超過は高め）。VercelはNext.js等との相性が良いが個人静的PWA用途ではオーバースペック気味 ([DanubeData](https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026), [pristren.com](https://pristren.com/blog/vercel-vs-cloudflare-pages-vs-netlify/))。

**結論**: 現状のGitHub Pagesでの公開は当面問題ないが、独自ドメイン・カスタムヘッダー・将来の商用展開まで見据えるなら**Cloudflare Pages**への移行が無料かつ制約が少なく最も実務的。

---

## 2. 日本市場でのPWA収益化ルート

### (a) アプリストア経由
- **iOS App Store**: Capacitorで既存のHTML/JS/CSSをネイティブシェルに包み、通常の有料アプリまたはIn-App Purchaseとして配信可能。PWA単体（Home Screen追加）の直接販売は不可（Appleの決済ポリシー上、ストア外課金は原則不可）。
  - 2024年2月、Appleは iOS 17.4でEU向けにHome Screen Web App機能を一旦廃止しようとしたが、開発者・Open Web Advocacyの反発で2024年3月に撤回し、EUでも継続提供されている ([mobiloud.com](https://www.mobiloud.com/blog/publishing-pwa-app-store), [MacRumors](https://www.macrumors.com/2025/06/26/app-store-eu-rule-change-dma/))。
  - 2025年6月26日、AppleはEU向けにDMA対応の大幅なポリシー変更を発表。EU域内では代替マーケットプレイスやWeb配信（Web Distribution）が解禁され、2026年1月1日からはCore Technology Fee（CTF）に代えてCore Technology Commission（CTC、デジタル商品売上の5%）に一本化される方針 ([Daring Fireball](https://daringfireball.net/2025/06/apple_app_store_policy_updates_dma), [funnelfox.com](https://blog.funnelfox.com/apple-app-store-fees-2026-eu-dma/), [Apple Developer公式](https://developer.apple.com/support/dma-and-apps-in-the-eu/))。ただし**これはEU限定**であり、日本向け配信では従来通りApp Store経由＋Appleの決済（30%/15%手数料）が基本。
- **Google Play**: PWAをTrusted Web Activity（TWA）でラップしてストア配信可能。Bubblewrap CLIまたはPWABuilderを使い、Lighthouseスコア80以上・Digital Asset Linksでドメイン所有権を検証する必要がある。開発者アカウント登録料$25のみで、TWA自体は無料 ([mobiloud.com](https://www.mobiloud.com/blog/publishing-pwa-app-store))。
  - Google PlayはTWAアプリにもGoogle Play Billing（課金）の使用を要求する点に注意（デジタルコンテンツ課金はストア外決済不可が原則）。

### (b) Web-nativeな決済ルート（バックエンドなしで実現しやすい順）
- **Stripe Payment Links**: コード不要でダッシュボードから決済リンクを3分で作成可能。国内カード決済手数料3.6%、初期費用ゼロ ([Stripe公式](https://docs.stripe.com/payment-links/create), [note記事比較](https://note.com/karanobu/n/n29b20e81b333))。静的サイトでの実現方法としては、決済完了後にStripeの「Redirect to a page you host」機能で「アンロックコード表示ページ」または「フルコンテンツURL」に誘導する形が現実的。完全なアクセス制御（サーバーサイド検証）は組めないため、**性善説ベースの「合言葉」販売**（パスコードでロック解除、URLの推測困難性に依存）が限界となる。
- **Gumroad**: 決済・ファイル配布・ライセンスキー発行まで一括で自動化。海外ユーザー想定なら有力 ([Gumroad Help](https://gumroad.com/help/article/330-stripe-connect))。
- **BOOTH（pixiv）**: 国内向けに実績豊富。銀行振込・コンビニ払い等の決済手段が揃い、若年層〜同人・クリエイター層への訴求力が高い ([ichi-kara.com](https://ichi-kara.com/blog/digital-distribution))。ダウンロード販売またはシリアルコード配布の形が想定される。
- **note**: 有料記事・マガジン形式でシリアルコードやURLを配布する運用も可能（日本語圏での認知度が高い）。

**実務上の現実的な形**: 完全無料PWA＋「対応版（追加問題セット・広告なし・テーマ変更等）はカンパ制解放」のような**投げ銭＋合言葉アンロック**が、バックエンドなし構成に最も自然に馴染む。真の課金制御（アカウント・サーバー検証）をやるなら軽量バックエンド（Cloudflare Workers + KVなど）が最小構成になるが、これは「バックエンドなし」の前提を破る。

### (c) Ko-fi / Buy Me a Coffee型支援
- ワンタイムの投げ銭・月額サポーター課金をボタン一つで埋め込み可能。決済処理・税務処理はプラットフォーム側に委ねられるため、法的にも実装的にも最も軽量。「無料で遊べるが、応援してくれると開発が続けられます」という非対価型（見返りなしの寄付）にすれば特商法上の"販売"に該当しにくく、最もシンプルな選択肢。

---

## 3. 日本の個人開発者による類似事例

- 「マイ例文」（読解力アプリ）: 個人開発、Next.js静的ビルド＋Cloudflare Pages、ローカルストレージのみで個人情報を扱わない設計 ([note: okdd_jp](https://note.com/okdd_jp/n/nafe19a021607))。
- こども向けプログラミング学習アプリのPWA化＋GitHub Pages公開事例（バイブコーディング系）([Qiita: hamham](https://qiita.com/hamham/items/65ac7f9e6cc265c79de7))。
- 学校教育用オンライン投票サービス、GitHub Pages上でPWA化しキャッシュにより再読み込みを高速化 ([Qiita: bockring](https://qiita.com/bockring/items/0856635fc0f34f839e8e))。

傾向として、日本の個人開発の教育系PWAは**GitHub Pages無料枠＋ストア審査なし**の組み合わせが主流であり、直接課金よりも「無料公開＋任意の支援」または「上位版のみ有料配布（BOOTH/Gumroad）」のパターンが目立つ。ストア配信まで踏み込む個人事例は比較的少ない（審査・年間$99のApple Developer料が壁になりやすい）。

---

## 4. 留意すべき制約

- **Apple/PWA（EU）**: 2024年に一度EUでHome Screen Web Appを廃止しようとして撤回した経緯があり、Appleの姿勢は流動的。日本（EU圏外）には現時点でこの規制緩和は適用されないため、日本ユーザー向けPWA配布自体（Webからのインストール）には影響しない。ストア経由で収益化する場合のみ、EU限定の新ルール（Web Distribution、CTC）は無関係と考えてよい ([Apple Developer公式](https://developer.apple.com/support/dma-and-apps-in-the-eu/))。
- **Google Play TWA課金要件**: TWAアプリ内でデジタルコンテンツを販売する場合、Google Play Billingの使用が実質必須（ストア外決済への誘導はポリシー違反リスク）。
- **資金決済法**: 前払いで対価を受け取ってから商品（コンテンツ）を提供する一般的な物販型の決済は基本的に規制対象外だが、「一定期間後に使える権利」を先に売る前払式支払手段（プリペイド型）に該当する設計（例: ポイント制、サブスク的な将来利用権のプール）は資金決済法の届出義務が生じ得る点に注意（詳細は専門家に確認要）。
- **特定商取引法**: 営利目的で反復継続してネット販売を行う場合は個人であっても特商法の「通信販売業者」に該当し、代金・提供時期・事業者情報等の表記義務が生じる ([消費者庁 特定商取引法ガイド](https://www.no-trouble.caa.go.jp/what/mailorder/rule.html))。無料公開＋任意の投げ銭（対価性なし）に留める場合はこの義務を避けやすい。

---

## 参考リンク一覧
- https://dev.to/devv-romano/how-to-scope-your-pwa-service-workers-1n6m
- https://gist.github.com/kosamari/7c5d1e8449b2fbc97d372675f16b566e
- https://jp-my-blog.vercel.app/blog/github-pages-vs-netlify-cloudflare-pages-and-vercel-the-only-free-static-site-host-comparison-that-matters
- https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026
- https://developer.puter.com/blog/cloudflare-pages-alternatives/
- https://pristren.com/blog/vercel-vs-cloudflare-pages-vs-netlify/
- https://www.mobiloud.com/blog/publishing-pwa-app-store
- https://daringfireball.net/2025/06/apple_app_store_policy_updates_dma
- https://blog.funnelfox.com/apple-app-store-fees-2026-eu-dma/
- https://www.macrumors.com/2025/06/26/app-store-eu-rule-change-dma/
- https://developer.apple.com/support/dma-and-apps-in-the-eu/
- https://docs.stripe.com/payment-links/create
- https://note.com/karanobu/n/n29b20e81b333
- https://gumroad.com/help/article/330-stripe-connect
- https://ichi-kara.com/blog/digital-distribution
- https://note.com/okdd_jp/n/nafe19a021607
- https://qiita.com/hamham/items/65ac7f9e6cc265c79de7
- https://qiita.com/bockring/items/0856635fc0f34f839e8e
- https://www.no-trouble.caa.go.jp/what/mailorder/rule.html
