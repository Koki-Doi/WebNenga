# GA4実装・検証記録

更新日: 2026-09-27。全体調査後の修正と、ユーザー指定による氏名・本文・生エラー送信を反映した現行仕様。

## 変更点

- `card-analytics.js`: 宛名・差出人・本文と生エラーメッセージを送信する。許可したイベント名・パラメータだけ送信する。呼出元がcard_idやpage_location等を上書きできないようにした。
- カードID・閲覧回数・開始時刻・未送信時間・反転回数を訪問単位で保持する。hashchange/popstateで旧カードの時間を確定してから新カードを開始。editorのreplaceState後も明示同期する。同じIDの本文変更は新しい訪問にせず、以後の通常イベントに送る本文を更新する。
- URLからカードがなくなった場合や、JSON構造・ID形式が不正な場合は訪問を終了。素のエディタが最初の共有URLを作っただけでは計測を開始しない。
- 小数秒の閲覧時間を送信し、短時間のタブ切替で丸め落とさない。非表示直後のpagehideの二重送信を防止。pageshowでBFCache復帰後の時間計測を再開する。
- ガチャはタップ開始時のカード訪問を保持する送信関数を使う。読込・再生中に別カードへ移動しても演出イベントのカードIDが変わらない。開始時の氏名・本文もスナップショットとして保持する。途中フェーズ例外も定型コードと生メッセージを送信する。
- HTML内の未接続サンプル計測を削除。localhost、127.0.0.1、[::1]、非HTTP(S)ではタグ読込と独自イベントを停止する。

### 追加計測（2026-09-27 リポジトリ全体調査後）

- `card_view` にカードの見た目（テンプレート・背景の種類・「謹賀新年」表示・挨拶文背景・本文文字数）、共有URLの長さ、表示環境（回線種別・動きを減らす設定）と、1ページ最初のカードだけ表示準備時間を付ける。背景URL自体は送らず種類に丸める（データURLは画像を含むため）。
- ガチャ: 開始時に先読みの有無・初期化時間・端末性能（画素密度・CPUコア数・端末メモリ）、完了時に平均FPS・最も重い1秒間のFPS・セリフのタップ/自動送り回数・結果画面の終わり方を送る。再生中の `card_leave` にはその時点の場面とFPSを付ける。ミュート操作 `gacha_mute` と、カード撮影失敗（`capture_failed`）も送る。FPS集計は `js/gacha/frame-stats.js`。
- 氏名・本文を付けないページイベントを追加（エディタ操作・画像アップロード結果・共有・CSV生成・印刷・ジャイロ許可）。カードを開いていない時のJSエラーもページイベントとして送る（従来は破棄していた）。
- 受取人として開いた端末を `nenga:received` に記録し、ページイベントの `was_recipient` で「受取人が自分でも作ったか」を見られるようにした。

## 送信データ

測定IDは従来どおり `G-8ZP24N3HRZ`。

共通パラメータは `card_id/recipient/sender/message/viewer_role/in_app/viewport/orientation` と、localStorageへ保存できた場合の `view_seq`。`page_location` はorigin+pathname、`page_title` は固定の「Web年賀状」、`page_referrer` は空。クエリ・共有データ入りフラグメントを送信しないための設定で、リファラーを使う流入分析の情報は減る。

ユーザー指定により、宛名をrecipient、差出人をsender、挨拶文をmessageとしてイベントへ入れる。改行も保持する。旧 `card_id/recipient/sender/viewer_role` ユーザープロパティはnullにし、新規のカード情報はイベント単位で扱う。解除は今後の送信設定に対するもので、過去の記録を削除するものではない。

### 氏名・本文・エラーの対応表

| パラメータ | 取得元 | 付与するイベント |
| --- | --- | --- |
| `recipient` | 共有データの `a`（宛名） | 以下のカード独自イベントすべて |
| `sender` | 共有データの `s`（差出人） | 以下のカード独自イベントすべて |
| `message` | 共有データの `m`（挨拶文）。文字列でなければ空文字 | 以下のカード独自イベントすべて |
| `error_message` | JS例外・Promise拒否理由・ガチャ例外のメッセージ | `js_error` と `gacha_error` |
| `error_code` | 発生箇所に対応する定型コード | `js_error` と `gacha_error` |

氏名・本文はイベント呼出元の任意パラメータではなく、対象カードのデータから取得する。通常のイベントは同一IDの編集内容を同期後に反映し、ガチャのイベントは計測開始時に保持した氏名・本文を使う。このため、再生中の編集や別カードへの移動で演出イベントの内容が混ざらない。一般の `page_view` にこれらの共通パラメータを追加する処理はない。

### イベント一覧

| イベント | 条件・固有パラメータ |
| --- | --- |
| `card_view` | 有効な共有形式のカード訪問開始。ロード・別IDへの移動時。`template_id`（mtid、無効ならnone）、`bg_type`（default/sampleN/upload/data_url/other）、`show_kinga`・`msg_bg`（on/off）、`message_length`、`url_length`、`connection`（slow-2g/2g/3g/4g/unknown）、`reduced_motion`（yes/no）。`dom_ready_ms` は1ページ最初のカードだけ |
| `card_flip_to_back` | 訪問中に初めて裏面へ変化。`sec_to_back` はそのカードの訪問開始からの秒数。非表示時間も含み、編集の自動反転も対象。見た目別に比べるため `template_id/bg_type` も付く |
| `card_leave` | 非表示、pagehide、別IDへ切替・リンク解除。`engaged_sec/flip_count` は前回送信からの差分。beacon指定。`template_id/bg_type` 付き。ガチャ再生中なら `phase/avg_fps/min_fps` も付く |
| `js_error` | `error_code=script_error/unhandled_rejection`。1ロード最大3件。`error_message` にError.messageまたは拒否理由・イベントのmessageを送信。スタック全体の専用送信はしない。`ui_context`（card/editor/gacha/none）付き。カードを開いていない時は氏名・本文なしのページイベントとして送る |
| `gacha_start` | 再生開始。通常クリック経路は `wait_ms`・`preloaded`（yes/no）・`init_ms` 付き。端末性能 `dpr/cpu_cores/device_memory`（取得できる場合のみ） |
| `gacha_skip` | SKIP時の `phase` |
| `gacha_mute` | ミュート切替。`muted`（on/off）と `phase` |
| `gacha_complete` | `duration_sec` と `completion_reason=completed/skipped/error`。途中フェーズ例外があればerrorを優先。`avg_fps/min_fps`、`speech_taps/speech_auto`、結果画面まで進んだ場合は `reveal_exit`（tap/timeout） |
| `gacha_error` | `error_code=gacha_failed/phase_failed/capture_failed` と `error_message`。フェーズ失敗の場合は `phase` も送る。capture_failedは実カード撮影の失敗で、演出は手描き表示のまま続く |

`min_fps` は1秒ごとの区間で最も低いFPS（1秒未満の再生では平均で代用）。1秒を超えるフレーム間隔はタブ非表示とみなして除外する。数値指標はGA上で合計されるため、平均はイベント数で割って求める。

### ページイベント（氏名・本文なし）

共通で `card_id`（URLに有効なカードがなければ `(none)`）・`viewer_role`・`ui_context`・`was_recipient`（この端末で受取人としてカードを開いたことがあるか）と環境情報を付ける。`recipient/sender/message/view_seq` は付けない。

| イベント | 固有パラメータ |
| --- | --- |
| `editor_open` | なし |
| `editor_template` | `template_id` |
| `editor_background` | `bg_type`（sampleN/upload） |
| `bg_upload_result` | `result=uploaded/data_url_fallback/heif_failed` |
| `share_link` | `method=copy/copy_failed/share/share_cancel/share_failed`、`url_length` |
| `csv_generate` | `result=ok/failed`、`rows_ok/rows_ng` |
| `print_card` | `result=opened/popup_blocked/failed` |
| `gyro_permission` | `result=granted/denied/error`。許可ダイアログのある端末（iOS等）のみ |

`card-effects.js` はテストで単独実行するため import せず、`card-analytics.js` が用意する `window.nengaTrackPage` 経由で送る。

通常のpage_viewは本番でのgtag config時に従来どおり送る。カード独自イベントと別の指標であり、card_viewとの合算はしない。

本文と生エラーメッセージはアプリ側で切り詰めずgtagへ渡す。GA4側で長い文字列がそのまま保存・表示されるかは未検証で、全文保管を保証しない。JSエラーは従来どおり1ロード最大3件。

有効な計測対象は、IDが英数字・`_`・`-`の1〜64文字で、復号したデータが配列以外のオブジェクトかつ `a/s` が文字列の共有URL。これは計測モジュールの判定であり、エディタ全体の入力検証を置き換えるものではない。

## 閲覧者指定と保存

- `?as=creator`: `nenga:viewer_role=creator` を保存する。
- `?as=recipient`: `nenga:viewer_role=recipient` を保存し、作成カード履歴より優先する。
- `?as=auto`: 明示指定と旧 `nenga:creator_device` を解除し、作成カード履歴から推定する。
- 上記クエリは処理後に除去する。保存不可でもcreator/recipientの現在ページ内の指定は有効。
- 自動判定では旧creator_device=1も引き続き認識する。指定なしなら `nenga:created` のID一覧で判定。保存読込不可・不正構造はunknown。
- 作成履歴は重複なし・最新1000件。壊れた一覧は次の作成記録で再構築する。閲覧回数は `nenga:views:<id>`。送信失敗の再送キューや受信確認は実装していない。

## 検証

追加計測の変更後（2026-09-27）に `node --test tests/*.test.mjs`: 42件成功（GA4関連18件、FPS集計2件、ジャイロ許可の計測1件を含む）。追加分では、card_viewの見た目属性と背景URLを送らないこと、読込時間が最初の1回だけであること、ガチャ中の離脱の場面・FPS、開始・完了・ミュートの値の許可リスト、ページイベントに氏名・本文が入らないこと、受取経験の記録、カード外のJSエラー送信を確認した。

加えて、GAタグをスタブに差し替えたローカルの複製をブラウザで開き、カード表示・ガチャ（ミュート→SKIP→結果画面タップ、再生中のpagehide）・エディタ（開く・テンプレート・背景・URLコピー）で送信内容を確認した。実際のGoogle Analyticsへは送っていない。

以下は前回の変更時（34件成功）に確認したGA4関連の項目。

- 氏名・本文・生メッセージの送信、旧プロパティ解除、共通値の上書き防止。
- カード切替・戻る操作・replaceState通知・同一ID更新・素のエディタ・不正データ。
- 小数秒の差分、非表示/pagehide二重送信、BFCache復帰、初回裏面時間のリセット。
- 開始時カードの氏名・本文へ紐づく非同期演出の送信、同一ID編集後の本文更新、生メッセージと定型コードの併送・件数上限。
- 明示指定とauto復帰、保存拒否、壊れた履歴、履歴の件数制限。
- ローカルタグ非読込、本番configのURL除去、gtag不在時。

ブラウザAPIとgtagを模擬し、実際のGoogle Analyticsにはテストデータを送っていない。ガチャの全再生・実端末・GA管理画面での受信は今回未検証。

## 管理側の確認と残る制約

- GA4カスタム定義（すべてイベントスコープ）。2026-09-26に登録: ディメンション `card_id/recipient/sender/phase/in_app/viewport/orientation/view_seq/error_message/viewer_role`、指標 `duration_sec/sec_to_back/engaged_sec/flip_count/wait_ms`。
- 2026-09-27に追加登録: ディメンション `message/error_code/completion_reason/template_id/bg_type/show_kinga/msg_bg/connection/reduced_motion/preloaded/reveal_exit/muted/method/result/ui_context/was_recipient/dpr/cpu_cores/device_memory`、指標 `message_length/url_length/dom_ready_ms/init_ms/avg_fps/min_fps/speech_taps/speech_auto/rows_ok/rows_ng`（ディメンション29件・指標15件）。`phase` の表示名は「ガチャスキップ位置」から「ガチャ場面」に変更。登録前に届いたイベントの値は、登録後もレポートに出ない。
- カスタム指標は合計値で表示される。平均FPS・表示準備時間などの平均は「指標の合計 ÷ そのイベントのイベント数」で求める。`dom_ready_ms` はページ内の最初のcard_viewだけに付く。
- データ探索（2026-09-27時点）: 年賀状 宛名別ログ（宛名別サマリー / 閲覧場所・端末 / 閲覧環境・流入元 / タイムライン / 宛名別の閲覧時間）、改善① 閲覧ファネル、改善② 端末・ブラウザ別の完走率（OS・ブラウザ・アプリ別 / 画面サイズ別 / エラー一覧 / 回線・設定別）、改善③ ガチャ演出の評価（スキップ位置 / 所要時間・読込・FPS / 離脱時の場面 / 端末性能と初期化 / 演出中の操作）、改善④ 閲覧体験・見返し・開封タイミング、改善⑤ 作成者の行動（操作の流れ / テンプレート・背景の選択 / 共有・印刷・CSVの結果）、改善⑥ 表示性能・読込（カード表示の準備時間 / ガチャの読込待ち / 共有URLの長さ）、改善⑦ カードの見た目（見た目別の到達 / 見た目別の閲覧時間 / 表示オプション・文字数 / ジャイロ許可）。今回追加したタブのうち、改善⑥⑦・改善②「回線・設定別」・改善③「離脱時の場面」「端末性能と初期化」「演出中の操作」は `閲覧者の種別 ≠ creator` で作成者本人の閲覧を除く（改善⑤は作成者の操作を見るため除外しない）。
- 1イベントのパラメータは最大でもcard_viewの約21個で、GA4の上限25個に収まる。見た目の属性はcard_viewだけ、端末性能はgacha_startだけに付けて件数を抑えている。`message` はGA側の文字数制限で長文が切れる可能性があり、本文の分析は `message_length` を使う。
- 拡張計測による履歴・フォーム等の自動イベントは管理画面に依存する。コードのconfig指定だけで自動計測全体を監査・制御したとは扱わない。履歴変更によるpage_viewの重複や意図しないフォーム計測を確認する。[Googleのページビュー仕様](https://developers.google.com/analytics/devguides/collection/ga4/views)
- 既存URLとの互換性のため、宛名・差出人に由来するカードIDは維持。同じ組合せの別年度も同じID。IDのランダム化・人物とカードの対応管理は別設計が必要で、今回の変更だけで匿名性や規約適合性を保証するものではない。
- localhost以外の検証ホスト・LAN IPは自動除外しない。同意管理、本番プロパティのフィルタ、保存期間も今回未変更。
- completeは結果画面のタップ待ちを含む。スキップなし成功を見る場合はcompletion_reason=completedを使う。独自の再生試行IDはまだない。
- 元のガチャエンジンのカードデータ再構築、共有コピーの非同期flush、画像処理・印刷の競合等は [コード全体調査](code-audit.md) に残した別領域の課題。
