import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { encodeData, parseHash, decodeData } from '../js/utils.js';

const hash = (id = 'abc', data = { a: '宛名 太郎', s: '差出人', m: 'private message' }) =>
  `#id=${id}&data=${encodeData(data)}`;
const source = readFileSync(new URL('../js/card-analytics.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '').replaceAll('export function', 'function');

function setup({ search = '', initialHash = hash(), store = new Map(), storageFails = false,
  disabled = false, gtag = true, globals = {}, navigatorExtra = {} } = {}) {
  let now = 1000, observe;
  const wh = new Map(), dh = new Map(), sent = [], properties = [], replaced = [];
  const classes = new Set(), rootClasses = new Set();
  const card = { classList: { contains: c => classes.has(c) } };
  const location = { href: `https://example.com/nenga/${search}${initialHash}`, hash: initialHash };
  const doc = { visibilityState: 'visible', getElementById: () => card,
    documentElement: { classList: { contains: c => rootClasses.has(c) } },
    addEventListener: (name, fn) => dh.set(name, fn) };
  const api = {};
  const window = { nengaAnalyticsDisabled: disabled, addEventListener: (name, fn) => wh.set(name, fn) };
  if (gtag) window.gtag = (cmd, name, params) => {
    if (cmd === 'event') sent.push(JSON.parse(JSON.stringify({ name, ...params })));
    if (cmd === 'set') properties.push(JSON.parse(JSON.stringify(params)));
  };
  const access = fn => { if (storageFails) throw Error('storage denied'); return fn(); };
  runInNewContext(`${source}\nObject.assign(api, { markCreatedCard, trackCard, syncCardAnalytics, createCardTracker, trackPage, setActiveGacha });`, {
    ...globals, api, window, document: doc, location, URL, parseHash, decodeData,
    navigator: { userAgent: 'Mozilla/5.0 (iPhone) Safari Line/14.1.0', ...navigatorExtra },
    performance: { now: () => now }, innerWidth: 390, innerHeight: 844,
    history: { state: null, replaceState: (_s, _t, url) => replaced.push(url) },
    localStorage: {
      getItem: key => access(() => store.get(key) ?? null),
      setItem: (key, value) => access(() => store.set(key, value)),
      removeItem: key => access(() => store.delete(key)),
    },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
  });
  return { api, sent, properties, store, replaced, classes, rootClasses, doc, window,
    start: () => wh.get('DOMContentLoaded')(), advance: ms => now += ms,
    emit: (name, event = {}) => wh.get(name)?.(event), flip: value => { value ? classes.add('flipped') : classes.delete('flipped'); observe(); },
    visibility: value => { doc.visibilityState = value; dh.get('visibilitychange')(); },
    change: (next, event = 'hashchange') => {
      location.hash = next; location.href = `https://example.com/nenga/${search}${next}`;
      if (event) wh.get(event)?.();
    },
  };
}

test('GA4: 氏名・本文・生エラーを送り、カード情報の上書きは防止', () => {
  const t = setup({ search: '?private=secret', store: new Map([['nenga:views:abc', '1']]) });
  t.start();
  assert.deepEqual(t.sent[0], {
    name: 'card_view', card_id: 'abc', viewer_role: 'recipient', in_app: 'line',
    recipient: '宛名 太郎', sender: '差出人', message: 'private message',
    viewport: '390x844', orientation: 'portrait', view_seq: 2,
    page_location: 'https://example.com/nenga/', page_referrer: '', page_title: 'Web年賀状',
    template_id: 'none', bg_type: 'default', show_kinga: 'on', msg_bg: 'on', message_length: 15,
    url_length: `https://example.com/nenga/?private=secret${hash()}`.length, dom_ready_ms: 1000,
    connection: 'unknown', reduced_motion: 'no',
  });
  assert.deepEqual(t.properties, [{ card_id: null, recipient: null, sender: null, viewer_role: null }]);
  t.api.trackCard('gacha_error', { recipient: 'wrong', error_message: 'raw error details',
    card_id: 'wrong', page_location: 'secret', error_code: 'gacha_failed' });
  assert.equal(t.sent.at(-1).card_id, 'abc');
  assert.equal(t.sent.at(-1).error_code, 'gacha_failed');
  assert.equal(t.sent.at(-1).recipient, '宛名 太郎');
  assert.equal(t.sent.at(-1).error_message, 'raw error details');
  assert.equal(t.sent.at(-1).page_location, 'https://example.com/nenga/');
});

test('GA4: 表裏の変化と表示時間差分、非表示→pagehideの二重送信を防止', () => {
  const t = setup(); t.start(); t.advance(250);
  t.flip(true); t.flip(true); t.flip(false);
  assert.equal(t.sent[1].sec_to_back, .25);
  t.visibility('hidden');
  assert.equal(t.sent.at(-1).engaged_sec, .25);
  assert.equal(t.sent.at(-1).flip_count, 2);
  const count = t.sent.length;
  t.emit('pagehide'); assert.equal(t.sent.length, count);
  t.advance(10000); t.visibility('visible'); t.advance(125); t.visibility('hidden');
  assert.equal(t.sent.at(-1).engaged_sec, .125);
  assert.equal(t.sent.at(-1).flip_count, 0);
});

test('GA4: カード切替は旧カードの閲覧を確定し新カードの回数・初回反転をリセット', () => {
  const t = setup(); t.start(); t.advance(10000); t.flip(true);
  t.change(hash('second'));
  assert.equal(t.sent.at(-2).name, 'card_leave');
  assert.equal(t.sent.at(-2).card_id, 'abc');
  assert.equal(t.sent.at(-2).engaged_sec, 10);
  assert.equal(t.sent.at(-1).name, 'card_view');
  assert.equal(t.sent.at(-1).card_id, 'second');
  t.flip(false); t.advance(500); t.flip(true);
  assert.equal(t.sent.at(-1).sec_to_back, .5);
  t.change(hash('abc'), 'popstate');
  assert.equal(t.sent.at(-1).view_seq, 2);
});

test('GA4: replaceStateの明示通知、同一ID更新、素のエディタを区別', () => {
  const t = setup(); t.start();
  t.change(hash('abc', { a: '宛名 太郎', s: '差出人', m: 'updated' }), null);
  t.api.syncCardAnalytics({ allowStart: false }); assert.equal(t.sent.length, 1);
  t.change(hash('second'), null); t.api.syncCardAnalytics({ allowStart: false });
  assert.equal(t.sent.at(-1).card_id, 'second');
  const editor = setup({ initialHash: '' }); editor.start();
  editor.change(hash(), null); editor.api.syncCardAnalytics({ allowStart: false });
  editor.api.trackCard('gacha_start'); assert.equal(editor.sent.length, 0);
  editor.change(hash('second')); assert.equal(editor.sent.at(-1).card_id, 'second');
});

test('GA4: 不正データとリンク解除ではカード計測を開始・継続せず、エラーは氏名なしで送る', () => {
  const t = setup(); t.start(); t.advance(200);
  t.change(hash('second', { a: 123, s: 'sender' }));
  assert.equal(t.sent.at(-1).name, 'card_leave');
  const count = t.sent.length;
  t.api.trackCard('gacha_start'); t.change('');
  assert.equal(t.sent.length, count);
  t.emit('error', { message: 'editor only' });
  const error = t.sent.at(-1);
  assert.equal(t.sent.length, count + 1);
  assert.equal(error.name, 'js_error');
  assert.equal(error.card_id, '(none)');
  assert.equal(error.ui_context, 'none');
  assert.equal(error.error_message, 'editor only');
  assert.equal(error.recipient, undefined);
  assert.equal(error.message, undefined);
});

test('GA4: 非同期演出イベントは開始時のカードへ紐づく', () => {
  const t = setup(); t.start(); const track = t.api.createCardTracker();
  t.change(hash('abc', { a: '宛名 太郎', s: '差出人', m: '編集後本文' }));
  t.api.trackCard('gacha_start');
  assert.equal(t.sent.at(-1).message, '編集後本文');
  t.change(hash('second', { a: '別の宛名', s: '別の差出人', m: '別の本文' }));
  track('gacha_complete', { duration_sec: 12, completion_reason: 'skipped' });
  assert.equal(t.sent.at(-1).card_id, 'abc');
  assert.equal(t.sent.at(-1).completion_reason, 'skipped');
  assert.equal(t.sent.at(-1).view_seq, 1);
  assert.equal(t.sent.at(-1).recipient, '宛名 太郎');
  assert.equal(t.sent.at(-1).sender, '差出人');
  assert.equal(t.sent.at(-1).message, 'private message');
});

test('GA4: 生エラーと定型コードを1ページ最大3件、アプリ側では切り詰めず送信', () => {
  const t = setup(); t.start();
  const message = '生のエラー'.repeat(100);
  t.emit('error', { message });
  t.emit('unhandledrejection', { reason: new Error('rejection details') });
  t.emit('error', { error: new Error('error object') }); t.emit('error');
  const errors = t.sent.filter(e => e.name === 'js_error');
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map(e => e.error_code), ['script_error', 'unhandled_rejection', 'script_error']);
  assert.deepEqual(errors.map(e => e.error_message), [message, 'rejection details', 'error object']);
});

test('GA4: creator/recipientは明示指定を優先し、autoでカード別履歴へ戻す', () => {
  const store = new Map([['nenga:created', '["abc"]']]);
  const recipient = setup({ search: '?as=recipient', store }); recipient.start();
  assert.equal(recipient.sent[0].viewer_role, 'recipient');
  assert.equal(recipient.replaced[0], `/nenga/${hash()}`);
  const persisted = setup({ store }); persisted.start();
  assert.equal(persisted.sent[0].viewer_role, 'recipient');
  const auto = setup({ search: '?as=auto', store }); auto.start();
  assert.equal(auto.sent[0].viewer_role, 'creator');
  const creator = setup({ search: '?as=creator', store, initialHash: hash('other') }); creator.start();
  assert.equal(creator.sent[0].viewer_role, 'creator');
});

test('GA4: 保存拒否はunknown、明示指定は保存できなくても有効', () => {
  const t = setup({ storageFails: true }); t.start();
  assert.equal(t.sent[0].viewer_role, 'unknown');
  assert.equal(t.sent[0].view_seq, undefined);
  assert.doesNotThrow(() => t.api.markCreatedCard('abc'));
  const override = setup({ storageFails: true, search: '?as=recipient' }); override.start();
  assert.equal(override.sent[0].viewer_role, 'recipient');
  assert.equal(override.replaced.length, 1);
});

test('GA4: 壊れた作成履歴を扱い、記録は重複せず1000件まで', () => {
  const t = setup({ store: new Map([['nenga:created', '{}']]) }); t.start();
  assert.equal(t.sent[0].viewer_role, 'unknown');
  for (let i = 0; i < 1001; i++) t.api.markCreatedCard(`card${i}`);
  t.api.markCreatedCard('card1000');
  const ids = JSON.parse(t.store.get('nenga:created'));
  assert.equal(ids.length, 1000); assert.equal(ids[0], 'card1');
});

test('GA4: BFCache復帰でcard_viewを増やさず表示時間を再開', () => {
  const t = setup(); t.start(); t.advance(1000); t.emit('pagehide');
  t.advance(10000); t.emit('pageshow'); t.advance(500); t.emit('pagehide');
  assert.equal(t.sent.filter(e => e.name === 'card_view').length, 1);
  assert.equal(t.sent.at(-1).engaged_sec, .5);
});

test('GA4: ローカル無効化・gtagなしでもエラーにしない', () => {
  for (const opts of [{ disabled: true }, { gtag: false }]) {
    const t = setup(opts); t.start(); t.flip(true); t.emit('error');
    t.advance(1000); t.emit('pagehide'); assert.equal(t.sent.length, 0);
  }
});

test('GA4: card_viewにカードの見た目・URL長・表示環境を付け、読込時間は最初の1回だけ', () => {
  const t = setup({
    initialHash: hash('abc', { a: '宛名', s: '差出', m: '😀あ', mtid: 'bus1', pv: 0, mbg: 1,
      bgurl: './images/background_sample3.png' }),
    navigatorExtra: { connection: { effectiveType: '3g' } },
    globals: { matchMedia: q => ({ matches: q.includes('reduce') }) },
  });
  t.start();
  const view = t.sent[0];
  assert.equal(view.template_id, 'bus1');
  assert.equal(view.bg_type, 'sample3');
  assert.equal(view.show_kinga, 'off');
  assert.equal(view.msg_bg, 'on');
  assert.equal(view.message_length, 2);
  assert.equal(view.connection, '3g');
  assert.equal(view.reduced_motion, 'yes');
  assert.equal(view.dom_ready_ms, 1000);
  for (const [bgurl, type] of [['data:image/webp;base64,AAAA', 'data_url'],
    ['https://x.supabase.co/storage/v1/object/public/nenga/bg/a.webp', 'upload'],
    ['https://example.com/other.png', 'other']]) {
    t.change(hash(`id${type}`, { a: 'a', s: 's', bgurl }));
    assert.equal(t.sent.at(-1).bg_type, type);
    assert.equal(t.sent.at(-1).dom_ready_ms, undefined);
    assert.equal(JSON.stringify(t.sent.at(-1)).includes(bgurl), false);
  }
  t.api.trackCard('gacha_skip', { phase: 'run' });
  assert.equal(t.sent.at(-1).template_id, undefined, '見た目の属性はガチャイベントには付けない');
  t.flip(true);
  assert.deepEqual([t.sent.at(-1).name, t.sent.at(-1).bg_type, t.sent.at(-1).show_kinga], ['card_flip_to_back', 'other', undefined]);
  t.advance(300); t.visibility('hidden');
  assert.deepEqual([t.sent.at(-1).name, t.sent.at(-1).template_id, t.sent.at(-1).bg_type], ['card_leave', 'none', 'other']);
});

test('GA4: ガチャ再生中の離脱は場面とFPSをcard_leaveへ付け、終了後は付けない', () => {
  const t = setup(); t.start(); t.advance(500);
  t.api.setActiveGacha(() => ({ phase: 'gatePass', avg_fps: 41.5, min_fps: 18.2 }));
  t.visibility('hidden');
  let leave = t.sent.at(-1);
  assert.equal(leave.phase, 'gatePass');
  assert.equal(leave.avg_fps, 41.5);
  assert.equal(leave.min_fps, 18.2);
  t.api.setActiveGacha(() => ({ phase: 'not-a-phase' }));
  t.visibility('visible'); t.advance(100); t.visibility('hidden');
  assert.equal(t.sent.at(-1).phase, undefined);
  t.api.setActiveGacha(null);
  t.visibility('visible'); t.advance(100); t.visibility('hidden');
  leave = t.sent.at(-1);
  assert.equal(leave.phase, undefined);
  assert.equal(leave.avg_fps, undefined);
});

test('GA4: ガチャ開始は端末性能、完了はFPS・セリフ操作・結果画面の終わり方を送る', () => {
  const t = setup({ globals: { devicePixelRatio: 3 }, navigatorExtra: { hardwareConcurrency: 6, deviceMemory: 4 } });
  t.start();
  t.api.trackCard('gacha_start', { wait_ms: 120, preloaded: 'yes', init_ms: 900 });
  let e = t.sent.at(-1);
  assert.deepEqual([e.wait_ms, e.preloaded, e.init_ms, e.dpr, e.cpu_cores, e.device_memory], [120, 'yes', 900, 3, 6, 4]);
  t.api.createCardTracker()('gacha_complete', { duration_sec: 40, completion_reason: 'completed',
    avg_fps: 55.1, min_fps: 30, speech_taps: 1, speech_auto: 0, reveal_exit: 'timeout' });
  e = t.sent.at(-1);
  assert.deepEqual([e.avg_fps, e.min_fps, e.speech_taps, e.speech_auto, e.reveal_exit], [55.1, 30, 1, 0, 'timeout']);
  assert.equal(e.dpr, undefined, '端末性能はgacha_startだけに付ける');
  t.api.trackCard('gacha_mute', { muted: 'on', phase: 'crowd' });
  assert.deepEqual([t.sent.at(-1).name, t.sent.at(-1).muted, t.sent.at(-1).phase], ['gacha_mute', 'on', 'crowd']);
  t.api.trackCard('gacha_complete', { reveal_exit: 'swipe', avg_fps: -1, min_fps: 'fast' });
  e = t.sent.at(-1);
  assert.deepEqual([e.reveal_exit, e.avg_fps, e.min_fps], [undefined, undefined, undefined]);
  t.api.trackCard('gacha_error', { error_code: 'capture_failed', error_message: 'canvas tainted' });
  assert.equal(t.sent.at(-1).error_code, 'capture_failed');
});

test('GA4: ページイベントは氏名・本文なしで、画面の文脈と受取経験を付ける', () => {
  const t = setup(); t.start();
  assert.equal(t.store.get('nenga:received'), '1', '受取人として開いた端末を記録');
  t.rootClasses.add('editing-open');
  t.api.trackPage('editor_open');
  let e = t.sent.at(-1);
  assert.equal(e.name, 'editor_open');
  assert.equal(e.card_id, 'abc');
  assert.equal(e.ui_context, 'editor');
  assert.equal(e.was_recipient, 'yes');
  for (const key of ['recipient', 'sender', 'message', 'view_seq']) assert.equal(e[key], undefined);
  t.api.trackPage('editor_background', { bg_url: './images/background_sample5.png' });
  assert.equal(t.sent.at(-1).bg_type, 'sample5');
  t.api.trackPage('editor_background', { bg_type: 'upload' });
  assert.equal(t.sent.at(-1).bg_type, 'upload');
  t.api.trackPage('editor_template', { template_id: 'frd1' });
  assert.equal(t.sent.at(-1).template_id, 'frd1');
  t.api.trackPage('share_link', { method: 'share_cancel', url_length: 1234 });
  assert.deepEqual([t.sent.at(-1).method, t.sent.at(-1).url_length], ['share_cancel', 1234]);
  t.api.trackPage('csv_generate', { result: 'ok', rows_ok: 30, rows_ng: 2 });
  assert.deepEqual([t.sent.at(-1).rows_ok, t.sent.at(-1).rows_ng], [30, 2]);
  const count = t.sent.length;
  t.api.trackPage('card_view'); t.api.trackPage('unknown_event');
  assert.equal(t.sent.length, count, 'カードイベントや未定義イベントはページ経路から送れない');
  t.api.trackPage('print_card', { result: 'sent-to-printer', method: 'fax' });
  assert.equal(t.sent.at(-1).result, undefined);
  assert.equal(t.sent.at(-1).method, undefined);
  assert.equal(t.window.nengaTrackPage, t.api.trackPage);
});

test('GA4: 作成者として開いた端末は受取経験に数えない', () => {
  const t = setup({ search: '?as=creator' }); t.start();
  assert.equal(t.store.has('nenga:received'), false);
  t.api.trackPage('editor_open');
  assert.equal(t.sent.at(-1).was_recipient, 'no');
  assert.equal(t.sent.at(-1).viewer_role, 'creator');
});

test('GAタグ: localhostでは読込なし、本番ではクエリ・フラグメントを除く', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const snippet = html.match(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/)[0]
    .replace(/^<script>|<\/script>$/g, '');
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'example.com']) {
    const context = { location: new URL(`https://${host}/nenga/?private=name#data=private`),
      document: { createElement: () => ({}), head: { appendChild: tag => tags.push(tag) } } };
    const tags = []; context.window = context;
    runInNewContext(snippet, context);
    assert.equal(tags.length, host === 'example.com' ? 1 : 0);
    if (tags.length) {
      const config = context.dataLayer[1][2];
      assert.equal(config.page_location, 'https://example.com/nenga/');
      assert.equal(config.page_referrer, '');
    }
  }
});
