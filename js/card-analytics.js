// GA4: card-scoped visits with recipient, sender, message and error details,
// plus page-level editor/print/sensor events without names or message text.
import { parseHash, decodeData } from './utils.js';

const CREATED_KEY = 'nenga:created';
const CREATOR_DEVICE_KEY = 'nenga:creator_device';
const ROLE_OVERRIDE_KEY = 'nenga:viewer_role';
const RECEIVED_KEY = 'nenga:received';
const readCreated = () => {
  const ids = JSON.parse(localStorage.getItem(CREATED_KEY) || '[]');
  if (!Array.isArray(ids)) throw new Error('Invalid creator history');
  return ids.filter(id => typeof id === 'string');
};

export function markCreatedCard(id) {
  if (!id) return;
  try {
    let ids;
    try { ids = readCreated(); } catch { ids = []; }
    localStorage.setItem(CREATED_KEY, JSON.stringify([...ids.filter(x => x !== id), id].slice(-1000)));
  } catch { /* Storage is optional. */ }
}

// recipient explicitly overrides card history; auto restores history-based detection.
let pageRole = null;
if (typeof window !== 'undefined') {
  try {
    const url = new URL(location.href);
    const role = url.searchParams.get('as');
    if (['creator', 'recipient', 'auto'].includes(role)) {
      pageRole = role === 'auto' ? null : role;
      try {
        localStorage.removeItem(CREATOR_DEVICE_KEY);
        if (pageRole) localStorage.setItem(ROLE_OVERRIDE_KEY, pageRole);
        else localStorage.removeItem(ROLE_OVERRIDE_KEY);
      } catch { /* Current-page override still works without storage. */ }
      url.searchParams.delete('as');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* Not a browser URL. */ }
}

function viewerRole(id) {
  if (pageRole) return pageRole;
  try {
    const override = localStorage.getItem(ROLE_OVERRIDE_KEY);
    if (override === 'creator' || override === 'recipient') return override;
    if (localStorage.getItem(CREATOR_DEVICE_KEY) === '1') return 'creator';
    return readCreated().includes(id) ? 'creator' : 'recipient';
  } catch { return 'unknown'; }
}

// 背景URLは送らず、種類だけに丸める（データURLは画像そのものを含むため）。
function bgType(url) {
  if (typeof url !== 'string' || !url) return 'default';
  if (url.startsWith('data:')) return 'data_url';
  const sample = url.match(/background_sample(\d{1,2})\.png(?:$|[?#])/);
  if (sample) return `sample${sample[1]}`;
  if (/\.supabase\.co\//.test(url)) return 'upload';
  return 'other';
}

function cardAttributes(data) {
  const message = typeof data.m === 'string' ? data.m : '';
  return {
    template_id: typeof data.mtid === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(data.mtid) ? data.mtid : 'none',
    bg_type: bgType(data.bgurl),
    show_kinga: data.pv === 0 ? 'off' : 'on',
    msg_bg: data.mbg === 0 ? 'off' : 'on',
    message_length: [...message].length,
  };
}

function cardInfo() {
  try {
    const parsed = parseHash(location.hash);
    if (!parsed || !/^[A-Za-z0-9_-]{1,64}$/.test(parsed.id)) return null;
    const data = decodeData(parsed.data);
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || typeof data.a !== 'string' || typeof data.s !== 'string') return null;
    return { id: parsed.id, recipient: data.a, sender: data.s,
      message: typeof data.m === 'string' ? data.m : '', attrs: cardAttributes(data) };
  } catch { return null; }
}

const IN_APP = (() => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  for (const [pattern, name] of [[/\bLine\//i, 'line'], [/Instagram/i, 'instagram'],
    [/FBAN|FBAV|FB_IAB/i, 'facebook'], [/Twitter/i, 'x'], [/MicroMessenger/i, 'wechat']]) {
    if (pattern.test(ua)) return name;
  }
  return 'none';
})();
const CARD_EVENTS = ['card_view', 'card_flip_to_back', 'card_leave', 'js_error',
  'gacha_start', 'gacha_skip', 'gacha_complete', 'gacha_error', 'gacha_mute'];
// 氏名・本文を付けないページ単位のイベント（エディタ・印刷・センサー・カード外のエラー）。
const PAGE_EVENTS = new Set(['js_error', 'editor_open', 'editor_template', 'editor_background',
  'bg_upload_result', 'share_link', 'csv_generate', 'print_card', 'gyro_permission']);
const EVENTS = new Set([...CARD_EVENTS, ...PAGE_EVENTS]);
const PHASES = new Set(['fan', 'dash', 'doorOpen', 'crowd', 'sky', 'whiteflash',
  'gateWide', 'gatePass', 'lamp', 'goldGate', 'run', 'speech', 'reveal']);
const ERRORS = new Set(['script_error', 'unhandled_rejection', 'gacha_failed', 'phase_failed', 'capture_failed']);
const NUMBERS = ['wait_ms', 'duration_sec', 'sec_to_back', 'engaged_sec', 'flip_count', 'init_ms',
  'avg_fps', 'min_fps', 'speech_taps', 'speech_auto', 'url_length', 'rows_ok', 'rows_ng'];
const ENUMS = {
  completion_reason: ['completed', 'skipped', 'error'],
  preloaded: ['yes', 'no'],
  reveal_exit: ['tap', 'timeout'],
  muted: ['on', 'off'],
  method: ['copy', 'copy_failed', 'share', 'share_cancel', 'share_failed'],
  result: ['ok', 'failed', 'granted', 'denied', 'error', 'uploaded', 'data_url_fallback',
    'heif_failed', 'opened', 'popup_blocked'],
};

let visit = null;
let initialized = false;
let card = null;
let errorsSent = 0;
let pageViewDone = false;
let activeGacha = null;

function uiContext() {
  try {
    if (document.getElementById('gacha-overlay')?.classList.contains('show')) return 'gacha';
    if (document.documentElement?.classList.contains('editing-open')) return 'editor';
  } catch { /* Minimal DOM. */ }
  return visit ? 'card' : 'none';
}

function wasRecipient() {
  try { return localStorage.getItem(RECEIVED_KEY) === '1' ? 'yes' : 'no'; } catch { return 'no'; }
}

// 端末性能の目安。ガチャの重さを端末の格ごとに比べるため gacha_start に付ける。
function deviceInfo() {
  const out = {};
  if (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) out.dpr = Math.round(devicePixelRatio * 100) / 100;
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  if (Number.isFinite(nav.hardwareConcurrency)) out.cpu_cores = nav.hardwareConcurrency;
  if (Number.isFinite(nav.deviceMemory)) out.device_memory = nav.deviceMemory;
  return out;
}

// 表示環境の情報。1ページで最初のカード表示にだけ読込時間を付ける。
function viewExtras(context) {
  const extras = { ...context.attrs, url_length: location.href.length };
  if (!pageViewDone) extras.dom_ready_ms = Math.round(performance.now());
  pageViewDone = true;
  const type = typeof navigator === 'undefined' ? null : navigator.connection?.effectiveType;
  extras.connection = ['slow-2g', '2g', '3g', '4g'].includes(type) ? type : 'unknown';
  extras.reduced_motion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'yes' : 'no';
  return extras;
}

// trusted はこのモジュール内で算出した値。呼出元の params は許可した値だけ通す。
function send(context, eventName, params = {}, trusted = {}) {
  if (!context || !EVENTS.has(eventName) || typeof window === 'undefined'
      || typeof window.gtag !== 'function' || window.nengaAnalyticsDisabled) return;
  // Card details come from the visit, not arbitrary event parameters.
  const safe = {};
  for (const key of NUMBERS) {
    if (typeof params[key] === 'number' && Number.isFinite(params[key]) && params[key] >= 0) safe[key] = params[key];
  }
  for (const [key, values] of Object.entries(ENUMS)) {
    if (values.includes(params[key])) safe[key] = params[key];
  }
  if (PHASES.has(params.phase)) safe.phase = params.phase;
  if (ERRORS.has(params.error_code)) safe.error_code = params.error_code;
  if (eventName === 'js_error' || eventName === 'gacha_error') {
    if (params.error_message != null) safe.error_message = String(params.error_message);
  }
  if (typeof params.template_id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(params.template_id)) safe.template_id = params.template_id;
  if (typeof params.bg_url === 'string') safe.bg_type = bgType(params.bg_url);
  else if (/^(upload|default)$/.test(params.bg_type)) safe.bg_type = params.bg_type;
  if (params.transport_type === 'beacon') safe.transport_type = 'beacon';
  const url = new URL(location.href);
  const personal = context.page ? {} : {
    recipient: context.recipient, sender: context.sender, message: context.message,
    ...(context.seq ? { view_seq: context.seq } : {}),
  };
  window.gtag('event', eventName, {
    ...safe, ...trusted, card_id: context.id ?? '(none)',
    viewer_role: context.id ? viewerRole(context.id) : 'unknown', ...personal,
    in_app: IN_APP, viewport: `${innerWidth}x${innerHeight}`,
    orientation: innerWidth > innerHeight ? 'landscape' : 'portrait',
    page_location: url.origin + url.pathname,
    page_referrer: '', page_title: 'Web年賀状',
  });
}

// 見た目別に「裏面まで見たか・何秒見たか」を比べるため、裏面到達と離脱にもテンプレートと背景を付ける。
const lookOf = (context) => ({ template_id: context.attrs?.template_id, bg_type: context.attrs?.bg_type });

function flushEngagement() {
  if (!visit) return;
  if (visit.visibleSince != null) {
    visit.pendingMs += Math.max(0, performance.now() - visit.visibleSince);
    visit.visibleSince = null;
  }
  if (visit.pendingMs <= 0 && !visit.flips) return;
  // ガチャ再生中の離脱なら、その場面とそこまでの描画性能を付ける。
  let gacha = {};
  try { gacha = activeGacha?.() || {}; } catch { gacha = {}; }
  send(visit, 'card_leave', {
    engaged_sec: visit.pendingMs / 1000, flip_count: visit.flips, transport_type: 'beacon',
    phase: gacha.phase, avg_fps: gacha.avg_fps, min_fps: gacha.min_fps,
  }, lookOf(visit));
  visit.pendingMs = 0;
  visit.flips = 0;
}

// replaceState does not fire hashchange. The editor calls this explicitly after updating its URL.
// A bare editor must not become a recipient visit merely by generating its first share URL.
export function syncCardAnalytics({ allowStart = true } = {}) {
  if (!initialized) return;
  const info = cardInfo();
  const id = info?.id;
  if (visit && id === visit.id) {
    Object.assign(visit, info);
    return;
  }
  const hadVisit = !!visit;
  flushEngagement();
  visit = null;
  if (!id || (!hadVisit && !allowStart)) return;
  let seq = 0;
  try {
    const key = `nenga:views:${id}`;
    seq = Math.max(0, parseInt(localStorage.getItem(key), 10) || 0) + 1;
    localStorage.setItem(key, String(seq));
  } catch { seq = 0; }
  const now = performance.now();
  visit = { ...info, seq, started: now, visibleSince: document.visibilityState === 'visible' ? now : null,
    pendingMs: 0, flips: 0, sentBack: false, wasFlipped: !!card?.classList.contains('flipped') };
  send(visit, 'card_view', {}, viewExtras(visit));
  // 受取人として開いた端末は、後でエディタを使ったときに「自分も作った」と分かるよう記録する。
  if (viewerRole(id) === 'recipient') {
    try { localStorage.setItem(RECEIVED_KEY, '1'); } catch { /* Storage is optional. */ }
  }
}

export function trackCard(eventName, params = {}) {
  send(visit, eventName, params, eventName === 'gacha_start' ? deviceInfo() : {});
}

// Long-running animation events retain their originating card even after navigation.
export function createCardTracker() {
  const context = visit ? { ...visit } : null;
  return (eventName, params = {}) => send(context, eventName, params,
    eventName === 'gacha_start' ? deviceInfo() : {});
}

// Page-level events never include names or message text.
export function trackPage(eventName, params = {}) {
  if (!PAGE_EVENTS.has(eventName)) return;
  send({ id: cardInfo()?.id ?? null, page: true }, eventName, params,
    { ui_context: uiContext(), was_recipient: wasRecipient() });
}

// The gacha registers a getter for its current phase and frame-rate summary while it is playing.
export function setActiveGacha(getter) {
  activeGacha = typeof getter === 'function' ? getter : null;
}

if (typeof window !== 'undefined') {
  // Modules loaded outside the ES import graph (card-effects) report through this hook.
  window.nengaTrackPage = trackPage;
  window.addEventListener('DOMContentLoaded', () => {
    if (initialized) return;
    initialized = true;
    card = document.getElementById('card');
    // Clear legacy user-scoped card/name properties; all new metadata is event-scoped.
    if (typeof window.gtag === 'function' && !window.nengaAnalyticsDisabled) {
      window.gtag('set', 'user_properties', { card_id: null, recipient: null, sender: null, viewer_role: null });
    }
    syncCardAnalytics();
    window.addEventListener('hashchange', () => syncCardAnalytics());
    window.addEventListener('popstate', () => syncCardAnalytics());
    if (card) new MutationObserver(() => {
      if (!visit) return;
      const flipped = card.classList.contains('flipped');
      if (flipped === visit.wasFlipped) return;
      visit.wasFlipped = flipped;
      visit.flips++;
      if (flipped && !visit.sentBack) {
        visit.sentBack = true;
        send(visit, 'card_flip_to_back', { sec_to_back: (performance.now() - visit.started) / 1000 }, lookOf(visit));
      }
    }).observe(card, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushEngagement();
      else if (visit && visit.visibleSince == null) visit.visibleSince = performance.now();
    });
    window.addEventListener('pagehide', flushEngagement);
    window.addEventListener('pageshow', () => {
      if (visit && document.visibilityState === 'visible' && visit.visibleSince == null) visit.visibleSince = performance.now();
    });
    // カードを開いていない時（エディタだけの利用）のエラーも、氏名なしのページイベントとして送る。
    const reportError = (code, error) => {
      if (errorsSent >= 3) return;
      errorsSent++;
      const params = { error_code: code, error_message: String(error?.message ?? error ?? 'unknown') };
      if (visit) send(visit, 'js_error', params, { ui_context: uiContext() });
      else trackPage('js_error', params);
    };
    window.addEventListener('error', e => reportError('script_error', e.error ?? e.message));
    window.addEventListener('unhandledrejection', e => reportError('unhandled_rejection', e.reason));
  });
}
