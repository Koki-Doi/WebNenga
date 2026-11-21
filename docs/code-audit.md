# コード全体・Google Analytics調査

調査日: 2026-09-27。対象はローカル作業ツリー（未コミット変更を含む）。この調査時点ではMarkdownのみを変更した。その後のGA4修正を以下へ反映済み。最新の計測仕様は [GA4実装・検証記録](ga4-implementation.md) を参照。

## 調査範囲と確認方法

自作JavaScriptの主要処理、HTMLの読み込み・計測設定、CSSの表示・印刷・動き軽減設定、既存テストとドキュメントを横断確認した。ライブラリ `html2canvas.esm.js` は版・呼び出し・構文の確認までで、内部実装の全行レビューは行っていない。画像・動画・Analytics.pdfは今回のコード調査対象外。

- 初回調査時は `node --test tests/*.test.mjs`: 24件成功。その後のGA4変更を含む直近の実行結果は34件成功（うちGA4関連13件）。
- `node --check`: `js/` 配下27ファイル成功。
- Node上の独立した再現確認で、非同期flushの待機不足、作成者指定解除の範囲、カード切替後の閲覧時間の帰属を確認。外部へ計測イベントは送信していない。
- GA4の送信制限・ページビュー仕様はGoogle公式資料と照合。管理画面・本番通信・データ到達・Supabase設定にはアクセスしていない。
- 3Dブラウザテスト、印刷、アップロード、スマートフォン実機は今回再実行していない。過去のブラウザ確認は各履歴文書を参照。

## 構成とデータの流れ

| 領域 | 主なファイル | 現行の責務・確認内容 |
| --- | --- | --- |
| 起動 | `index.html`, `js/main.js` | 静的HTMLとES Modules。DOMContentLoadedで操作・効果・編集・印刷を初期化。外部モジュール読込失敗時はmain全体の起動にも影響し得る |
| 編集・共有 | `js/editor.js`, `js/templates.js`, `js/utils.js` | 80msの入力集約、DOM反映、宛名・差出人のハッシュID、JSONのBase64URL化、history.replaceState、URLコピー・共有 |
| CSV | `js/csv-mode.js` | A〜Fをデータとして読み、Gへ共有URL。BOM・CRLF・CR・引用符内改行に対応。先頭行もデータ |
| 画像・保存 | `js/image-utils.js`, `js/storage.js` | HEIF変換、向き補正、圧縮、Cropper連携。Supabase公開URLへ保存。editor側では失敗後に画像Data URL埋め込みへ切替 |
| カード操作 | `js/card-controls.js`, `js/card-effects.js` | 反転、スワイプ、キー、落下・傾き・光沢。効果は収束・非表示時停止。ジャイロは対象モバイルのみ |
| サイズ・位置 | `js/message-autofit-lite.js`, `js/position-controls.js` | 本文の最大行幅と比例縮小、縦位置の保存と範囲制限。位置調整には独立した毎フレームループが残る |
| 印刷・撮影 | `js/print.js` | html2canvas遅延読込、表裏の一時スタイル、宛名縦積み、2ページ印刷、ガチャ用DOM画像生成 |
| 計測 | `js/card-analytics.js`, `index.html`, `js/gacha/gacha-boot.js` | GAタグ、カード開封・反転・滞在・エラー・演出イベント。詳細は後述 |
| 3D本体 | `js/gacha/gacha-world.js`, `gacha-state.js`, `gacha-phases.js`, `gacha-ui.js`, `gacha-boot.js` | ワールド・テクスチャ、共有状態、13フェーズ、音声とUI、先読み・実行・終了 |
| 3D部品 | `model-geometry.js`, `fan-hand.js`, `stand-audience.js` | 形状共有、静止部品のインスタンス化、扇の手・観客形状 |
| カメラ・模型室 | `race-layout.js`, `corridor-camera.js`, `model-preview.js`, `model-preview.html` | カメラ経路、連続性、10場面の模型表示、実時間再生・コマ送り |
| 表示 | `nenga.css`, `gacha.css`, `model-preview.css` | カード・編集・印刷・3D重ね表示。CSSの動き軽減設定はあるが、JS演出全体の停止とは別 |
| 旧実装 | `js/tilt.js`, `js/message-autofit.js` | 現在のHTMLエントリからは読み込まれていない。現行効果との二重読込に注意 |

共有データは `a/s/m/h/bgurl/pv/mbg/mtid/iy/my` を持つ。CSVでは `kn` も出力し、位置 `iy/my` は出力しない。`data` は圧縮・暗号化ではなく、JSONを復元可能な形式で埋め込んだもの。IDは本文・年度を含まず、同じ宛名・差出人なら共通になる。通常はSHA-256先頭12文字、代替ハッシュは最大8桁の16進表記。

ガチャは共有データの有効性と初回クリックで判定し、`?nogacha` で抑止。スワイプはクリックを経由せず直接反転する。手描きカードテクスチャで準備し、再生時に実DOM撮影へ非同期で差し替える。撮影失敗時は手描き表示が残る。

## Google Analyticsの修正状況

全体調査後に、カード切替時の時間帰属、明示的な閲覧者指定、保存不可時のunknown判定、BFCache復帰、ガチャ終了理由、ローカル環境の送信停止を実装した。HTML末尾の未接続の計測サンプルも削除した。その後のユーザー指定により、宛名・差出人・本文・生エラーメッセージをイベントへ送信する仕様へ更新した。

現行イベント・パラメータ・テスト結果は [ga4-implementation.md](ga4-implementation.md) が正本。調査時点で再現した `?as=recipient` の履歴優先とカード切替の誤帰属は回帰テストを追加して修正済み。非GA領域の問題は以下に残す。

現行の氏名・本文は `recipient/sender/message` としてカード独自イベントへ付与し、生エラーは `error_message` としてエラーイベントへ付与する。ガチャは開始時の氏名・本文を保持し、通常イベントは同一IDの編集後の内容を同期する。HTMLコメントもこの仕様へ更新済み。

## 問題点と改善候補

優先度「高」は共有結果・計測の正確さに影響するもの、「中」は特定条件の不具合・性能・保守上の問題。静的確認のみの項目を実機再現済みとは扱わない。

| 優先度 | 根拠・条件 | 影響と対応案 |
| --- | --- | --- |
| 高 | `utils.js` のdebounce.flushが非同期関数の戻り値を返さない。Nodeでawait直後に未完了を確認 | `editor.js` のコピー・共有が古いURL/IDを使い得る。実行中Promiseも含めて待機する設計へ |
| 高 | `editor.js` のアップロード完了コールバックに最新操作の世代チェックがない | Aアップロード中にBやサンプルを選ぶと、Aの遅い完了が背景を戻し得る。失敗時も可変currentObjUrlと古いdataURLが混ざり得る。非同期操作の世代管理が必要 |
| 中 | `position-controls.js` のinjectPanelは初期非表示でもkeepを予約し、aria-hiddenの変更時だけ停止 | 最初の編集開閉まで毎フレーム採寸・localStorage読込・style更新が続く構造。前回のcard-effects静止停止だけではページ全体は停止しない。初期状態判定と変更時更新へ |
| 中 | `editor.js` と位置調整のlocalStorageアクセスが無保護 | 保存拒否・容量超過等で初期化や共有復元が中断し得る。メモリ上の代替値を用意 |
| 中 | decodeDataはJSON構造を検証せず、applyToDOMは文字列のtrimを前提とする | 正しいJSONでも `a:123` 等で例外になり得る。フィールド型・位置数値・URL形式を入口で検証 |
| 中 | ガチャ先読みは最初のGACHA.cardとengineを保持し、hash変更時に再初期化しない | 別カードへ切替時に手描きテクスチャ・差出人ラベルとDOM撮影のカードが不一致になり得る。計測の切替と一緒に整理 |
| 中 | `encodeImageMax` は最小寸法到達後、サイズ再確認による失敗通知なしで返す | 「2MB未満を保証」というコメントほど強い保証はない。超過結果を明示する。JPEG代替時も保存側はWebP拡張子・MIME固定 |
| 中 | 画像入力のsrcURLにrevoke処理がなく、ImageBitmap.closeもない | 画像を繰り返し選ぶ際の資源保持候補。currentObjUrlの解放とは別に管理する |
| 中 | `image-utils.js` のloadScriptOnceはタグ存在で即resolve | 同時HEIF選択・読込失敗後再試行で、heic2any準備前に呼ぶ可能性。共通Promiseと失敗時リセットへ |
| 中 | `print.js` の撮影は表示DOMを書き換え、複数印刷を排他しない | 連打やガチャ撮影との重複時の復元競合候補。キュー化または独立クローンで撮影する |
| 中 | gacha-bootのフェーズ例外は定型エラーを計測して進行し、初期化失敗時の全資源撤去はない | completeのcompletion_reason=errorで区別できるよう修正済み。初期化再試行時のoverlay/renderer残存は引き続き検証対象 |
| 中 | CSVは行ごとのハッシュ待機・作成履歴書込。セル先頭の数式文字を無害化しない | 大量行では書込集約が候補。外部CSVを表計算ソフトで開く用途では数式扱いの要件も明確化する |
| 低 | 本文幅はgetBoundingClientRectを使い、HTMLエンティティを文字列のまま採寸 | 傾き中の幅や `&amp;` 等で過剰縮小する可能性。offsetWidth系・表示文字の測定を検討 |
| 低 | editorの文字化けがコメントだけでなくテンプレート変更トーストにもある | ユーザーに見える箇所から修正する |

## 性能・外部依存・運用

- 通常カードは静止停止・背景要素キャッシュ・入力のフレーム集約を実施済み。本文採寸も1回へ集約済み。別系統の位置調整ループは上記の残課題。
- ガチャはアイドル時の遅延初期化、共有形状、InstancedMesh、非活動パーティクルの更新省略、終了時の描画/BGM停止を実装。GPU資源の全解放や非表示時の音声停止は別途検討対象。模型室は継続描画する。
- CDN依存はThree.js 0.170.0、GSAP 3.12.5、Cropper.js 1.6.2、heic2any 0.0.4、Supabase JS v2、Google Fonts、gtag。同梱html2canvasは1.4.1。SupabaseはHTMLのUMD読込とstorage.jsのESM importが重複し、v2の完全な版固定もない。
- Supabaseの公開クライアント用anonキーがフロントにある。サーバー専用秘密鍵とは区別する。実際のバケット公開範囲・INSERTポリシー・容量制限はリポジトリだけでは確認できない。公開URLの生成処理があることと、管理設定が適切であることは別。
- Data URL代替は画像を含む非常に長い共有URLになる。コピー、OS共有、履歴更新、相手先アプリの許容長は実環境で確認が必要。
- CSSのprefers-reduced-motion対応だけではJSの落下・ガチャを無効化しない。viewportは拡大制限指定あり。動き・拡大・キーボードフォーカスの実機確認は未完。

## 次の検証

GA4側のカスタム定義・拡張計測・本番受信は [GA4実装記録](ga4-implementation.md) の管理側確認事項を参照。コード上の修正で、すでに送った氏名データが削除されるわけではない。

非GA領域では、編集直後のコピー、背景連続選択、保存拒否、初期非表示の位置調整ループ、印刷連打を優先して検証する。最新のNodeテストは34件成功。ブラウザ用 `tests/model-geometry.html` の10件はNodeテストに含まれず、今回は再実行していない。
