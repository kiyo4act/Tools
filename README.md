# FANBOX支援者リスト抽出ツール (FanboxEnumerator) - Chrome拡張機能

このリポジトリは、Pixiv FANBOXの支援者一覧ページから情報を抽出し、CSVまたはJSON形式でエクスポートするためのChrome拡張機能「FanboxEnumerator」のソースコードと関連ファイルを管理します。

**ユーザー向け紹介・ダウンロードページ:** [./index.html](./index.html) (GitHub Pagesで公開後、適切なURLに置き換えてください)
**最新バージョン:** 2025年5月31日 (Rev. 2)

## 1. ツールの目的

Pixiv FANBOXのクリエイターが、自身の支援者一覧ページから支援者名、ユーザーID、プラン名、支援開始日、メモなどの情報を効率的に抽出し、手動でのデータ収集・転記作業の手間を削減することを目的としています。抽出したデータは、支援者管理や分析、他のツールとの連携などに活用できます。

## 2. 主な機能

* FANBOX支援者一覧ページ (`https://*.fanbox.cc/manage/relationships`) から情報を抽出。
* 抽出対象: 支援者名, PixivユーザーID, 支援プラン名, 支援開始日, クリエイター設定メモ。
* 拡張機能のポップアップ内で抽出結果をテーブル形式でプレビュー。
* プラン名によるフィルタリング（複数選択可）。
* 支援開始日や継続期間によるフィルタリング。
* プレビューテーブルの各列での昇順/降順ソート。
* フィルタリング・ソート後のデータをCSVまたはJSON形式でダウンロード。

## 3. インストールと使い方

詳細なインストール手順と使い方は、上記の「ユーザー向け紹介・ダウンロードページ」 (`./index.html`) を参照してください。
基本的には、`dist/` ディレクトリにある最新の `.zip` ファイル（例: `FanboxEnumerator_20250531_Rev2.zip`）をダウンロード・解凍し、Chromeの拡張機能ページで「パッケージ化されていない拡張機能を読み込む」から解凍したフォルダ（`manifest.json`が含まれるフォルダ、通常は`_src`の内容）を指定してインストールします。

## 4. 開発者（オーナー）のための備忘録

### 4.1. プロジェクト構成

FanboxEnumerator/├── index.html             # ユーザー向け紹介・ダウンロードページ├── README.md              # このファイル├── _src/                  # 拡張機能のソースコード (Jekyllにより公開サイトから除外)│   ├── manifest.json      # 拡張機能の定義ファイル (version: "2025.5.31.2" など)│   ├── popup.html         # ポップアップUI│   ├── style.css          # ポップアップ用CSS│   ├── popup.js           # ポップアップのロジック│   ├── content_script.js  # FANBOXページに挿入されDOM操作を行うスクリプト│   ├── background.js      # バックグラウンド処理 (ページ条件による有効化など)│   └── icons/             # 拡張機能アイコン (icon16.png, icon48.png, icon128.png)├── dist/                  # ビルドされた拡張機能パッケージ (.zip)│   └── FanboxEnumerator_YYYYMMDD_RevX.zip # 例: FanboxEnumerator_20250531_Rev2.zip└── .github/               # (リポジトリルートに配置)└── workflows/└── build_fanbox_enumerator_extension.yml # GitHub Actionsワークフロー
### 4.2. 技術スタック

* HTML, CSS, JavaScript (Vanilla JS)
* Chrome Extension Manifest V3

### 4.3. AIへメンテナンスを指示する際の手順とポイント

このリポジトリのルートにある、ツール開発全体に関する `README.md` の「AIへの初期指示プロンプト」の指示に従ってください。
「FanboxEnumerator」のメンテナンスを依頼する際は、特に以下の点に注意してください。

1.  **対象ファイル:** 主に `_src/` ディレクトリ内のファイル (`manifest.json`, `popup.html`, `popup.js`, `style.css`, `content_script.js`, `background.js`) と、この `FanboxEnumerator/README.md` およびユーザー向け `FanboxEnumerator/index.html` です。
2.  **FANBOXのHTML構造の変更対応:**
    * この拡張機能は、FANBOXの支援者一覧ページのHTML構造に強く依存します。FANBOX側のページデザインやHTML構造が変更された場合、`_src/content_script.js` 内の `extractDataFromDOM()` 関数にあるDOMセレクタの修正が必須となります。
    * **現在の主要セレクタ (目安):**
        * テーブル全体: `div.commonStyles__Table-sc-1f3w2vz-0.dRWCLG`
        * 各支援者行: 上記テーブル内の `div.commonStyles__Tr-sc-1f3w2vz-1` (ヘッダー行を除く)
        * 各セル: 各行内の `div.commonStyles__Td-sc-1f3w2vz-2.gOXCUW`
        * 詳細なセレクタは `_src/content_script.js` 内の `extractDataFromDOM` 関数を参照してください。
    * HTML構造の変更が疑われる場合は、最新のFANBOX支援者一覧ページのHTMLソースを提供し、上記セレクタの更新を指示してください。
3.  **機能追加・修正:**
    * 具体的な要望（例: 新しいフィルタ条件、UI改善、エラーハンドリング強化など）を明確に伝えてください。
    * `manifest.json` のパーミッション変更が必要な場合も指示してください。
4.  **バージョン情報と更新履歴:**
    * 大きな変更後は、`_src/manifest.json` の `version` (例: `"2025.5.31.2"` -> `"2025.6.1.3"`)、`FanboxEnumerator/index.html` 内のバージョン表記と更新履歴（例: "2025年M月D日 (Rev. N)"）、およびこの `FanboxEnumerator/README.md` の更新履歴の更新を指示してください。リビジョン番号(N)は整数でインクリメントします。
5.  **GA4イベント:**
    * `_src/popup.js` 内でGA4イベント送信を行っています（測定ID: `G-WWQTE7VWKG`）。新しいユーザー操作を追加した場合は、関連イベントの追加も検討・指示してください。

### 4.4. ビルドとパッケージ化

* `_src/` ディレクトリ内のファイルをまとめて `.zip` ファイルにすることで、Chrome拡張機能としてパッケージ化できます。
* リポジトリルートの `.github/workflows/build_fanbox_enumerator_extension.yml` にて、`FanboxEnumerator/_src/` ディレクトリの内容を `FanboxEnumerator_YYYYMMDD_RevX.zip` (Xはmanifest.jsonのversionの最後のセグメントから生成) として `FanboxEnumerator/dist/` ディレクトリに自動で配置するGitHub Actionsワークフローが設定されています。

### 4.5. アイコンについて

拡張機能のアイコン (`_src/icons/icon16.png`, `_src/icons/icon48.png`, `_src/icons/icon128.png`) はSVG形式でプレースホルダーとして提供されています。PNG形式に変換して使用するか、適切なカスタムアイコンに置き換えてください。

## 5. このツールのメンテナンスを行うAIへの指示書

(このセクションは、リポジトリルートのREADME.mdの指示を基に、このツール特有の情報を加味して記述します。内容は上記の「4.3. AIへメンテナンスを指示する際の手順とポイント」と重複する部分が多くなりますが、AIがこのファイル単体を参照することも考慮して記述します。)

### 5.1. はじめに・ツールの背景とあなたの役割

こんにちは。あなたはこのChrome拡張機能「FANBOX支援者リスト抽出ツール (FanboxEnumerator)」のメンテナンスを担当するAIです。このツールは、オーナーがPixiv FANBOXの支援者情報を効率的に抽出し、管理作業を省力化するために開発されました。

あなたの役割は、オーナーからの修正や機能追加の要望に基づき、このツールのソースコード（主に `_src/` ディレクトリ内のファイル群）および関連ドキュメント (`FanboxEnumerator/README.md`, `FanboxEnumerator/index.html`) を適切に変更し、提案することです。

### 5.2. メンテナンスを依頼された場合の基本的な進め方

1.  **オーナーからの指示の正確な把握:**
    * 修正内容、追加機能、UIの変更点、特にFANBOX側のHTML構造の変更に関する情報を正確に理解してください。
    * オーナーから提供される最新のソースコードと、このREADME.mdの内容（特に「4.3. AIへメンテナンスを指示する際の手順とポイント」）を基に作業を行ってください。
2.  **影響範囲の特定と設計:**
    * 要望がツールのどの部分（`manifest.json`のパーミッション、`content_script.js`のDOMセレクタ、`popup.js`のロジック、`popup.html`/`style.css`のUI）に影響するかを特定してください。
3.  **コードの生成と提案:**
    * 変更が必要なファイルの**完全なソースコード**を提案してください。
4.  **バージョン情報と更新履歴の更新 (重要):**
    * オーナーから「バージョン情報と更新履歴を更新してください」という明確な指示があった場合に限り、以下の箇所を更新してください。
        * **`_src/manifest.json` 内:** `version` フィールド (例: `"2025.5.31.2"` -> `"2025.6.1.3"`)。
        * **`FanboxEnumerator/index.html` 内:** バージョン表示（例: "最終更新: 2025年M月D日 (Rev. N)"）と更新履歴リスト。
        * **`FanboxEnumerator/README.md` (このファイル) 内:** 「更新履歴」セクションと、冒頭の最新バージョン情報。
        * このREADME.md内の他のセクション（特にDOMセレクタに関する記述）で、今回の変更によって内容が古くなった箇所があれば、その修正も提案してください。
5.  **GA4イベントの考慮:**
    * 新しいユーザー操作が追加されたり、重要な処理フローが変更されたりした場合は、関連するGA4イベントを `_src/popup.js` 内に追加・修正することを検討し、オーナーに提案してください。

### 5.3. FANBOX HTML構造の変更への対応

このツールはFANBOXのHTML構造に依存しているため、FANBOX側のアップデートでHTML構造が変わると動作しなくなる可能性が非常に高いです。メンテナンスの際は、まず `_src/content_script.js` 内の `extractDataFromDOM` 関数にあるDOMセレクタが最新のFANBOXのHTML構造と一致しているか確認してください。オーナーから最新のHTMLサンプルが提供された場合は、それを元にセレクタを検証・修正してください。

## 6. 更新履歴

* **2025年5月31日 (Rev. 2)**
    * アイコンファイル (SVGプレースホルダー) を追加。
    * GitHub Actionsによるzipパッケージの自動ビルド・デプロイワークフローを追加。
    * 各ファイルのバージョン表記を「日付 (Rev. 整数)」形式に統一。
    * `manifest.json`の`version`を`YYYY.M.D.REV`形式 (例: `2025.5.31.2`) に変更。
    * GitHub Actionsワークフローの配置場所と動作をリポジトリルート基準に修正。
* **2025年5月30日 (Rev. 1)**
    * 初回リリース。基本的な情報抽出、フィルタリング、ソート、エクスポート機能の実装。
