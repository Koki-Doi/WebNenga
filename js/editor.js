// js/editor.js
// 年賀状エディタ本体（プレビュー即時反映 / Supabaseへ非同期アップロード / CSV一括生成）
// 依存: utils.js, templates.js, image-utils.js, storage.js, csv-mode.js

import {
  sanitize, escapeHtml, htmlToPlain, plainToHtml,
  splitHonorific, showToast, tryCopy,
  encodeData, decodeData, parseHash, hashIdShort, debounce
} from './utils.js';

import { MESSAGE_TEMPLATES } from './templates.js';

import {
  isHeifFile, convertHeifToBlob, normalizeForIOS,
  waitImageLoaded, dataURLToBlob, encodeImageMax, OUT_W, OUT_H
} from './image-utils.js';

import { uploadBgWebP } from './storage.js';
import { handleCsvGenerate, parseCSV } from './csv-mode.js';

const SHORT_ID_LEN = 12; // URL用の短いID

export function initEditor() {
  const $ = (s) => document.querySelector(s);

  // ===== DOM =====
  const addrEl   = $('.address');
  const senderEl = $('.sender');
  const msgEl    = $('.greeting-side p');
  const greeting = $('.greeting-side');
  const photoEl  = $('.new-year-image');

  const openBtn  = $('#editor-open');
  const overlay  = $('#editor-overlay');
  const closeBtn = $('#editor-close');
  const editorScroll = $('#editor-scroll');

  // 左ペイン（通常モード）
  const panelText  = $('#panel-text');
  const inpAddress = $('#inp-address');
  const inpHonor   = $('#inp-honorific');
  const inpSender  = $('#inp-sender');
  const selTpl     = $('#sel-message-template');
  const inpMessage = $('#inp-message');
  const chkPhoto   = $('#chk-photo');
  const chkMsgBg   = $('#chk-msgbg');

  // 背景：サンプル/アップロード/トリミング
  const sampleGrid   = $('#sample-grid');
  const inpBgFile    = $('#inp-bgfile');
  const cropBox      = $('#cropper');
  const cropImg      = $('#crop-img');
  const btnCropReset = $('#btn-crop-reset');
  const btnCropApply = $('#btn-crop-apply');
  const btnExport    = $('#btn-export');

  // 共有
  const actionsBar = $('#editor-actions');
  const txtUrl   = $('#share-url');
  const btnCopy  = $('#btn-copy');

  // CSVモード
  const btnCsvMode  = $('#btn-csv-mode');
  const csvPanel    = $('#csv-panel');
  const csvFile     = $('#csv-file');
  const csvGenerate = $('#csv-generate');
  const csvExit     = $('#csv-exit');
  const csvSummary  = $('#csv-summary');
  const csvPreview  = $('#csv-preview');

  // ===== State =====
  // 表示用（Blob可・プレビュー優先）
  let selectedBgUrl = './images/background_sample1.png';
  // 共有用（常に公開URL＝永続URLのみ）
  let stableBgUrl   = './images/background_sample1.png';

  let cropper = null;
  let currentObjUrl = null;
  let didAutoApply = false;
  let currentTplId  = 'std1';
  let csvOpen = false;

  // ===== 背景反映ヘルパ =====
  function setBackground(displayUrl, stableUrl) {
    // プレビューは常に即時に displayUrl を描画
    selectedBgUrl = displayUrl || './images/background_sample1.png';
    greeting.style.setProperty('--bg-image', `url("${selectedBgUrl}")`);
    // 共有用は安定URLが来た時のみ更新
    if (stableUrl) stableBgUrl = stableUrl;
    // URL再生成
    applyPreviewAndURL();
  }
  function revokeObjUrl() {
    if (currentObjUrl) { URL.revokeObjectURL(currentObjUrl); currentObjUrl = null; }
  }

  // ===== モーダル開閉 =====
  const isEditorOpen = () => overlay.getAttribute('aria-hidden') === 'false';

  // エディタ中はカードのキーボード操作を抑止（Enter/Spaceなど）
  window.addEventListener('keydown', (e) => {
    if (isEditorOpen() && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) {
      e.stopPropagation();
    }
  }, true);
  // 背景クリックの反転を抑止
  $('#card-container')?.addEventListener('click', (e) => { if (isEditorOpen()) e.stopPropagation(); }, true);

  openBtn?.addEventListener('click', (e)=>{
    e.stopPropagation();
    overlay.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('editing-open');
    document.body.classList.add('editing-open');
    editorScroll.scrollTop = 0;
  });
  function closeEditor() {
    overlay.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('editing-open');
    document.body.classList.remove('editing-open');
  }
  closeBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); closeEditor(); });
  overlay?.addEventListener('click', (e)=>{ if (e.target === overlay) closeEditor(); });

  // ===== メッセージテンプレ =====
  function buildTemplateOptions(){
    selTpl.innerHTML = '';
    for (const t of MESSAGE_TEMPLATES){
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.label;
      selTpl.appendChild(opt);
    }
    selTpl.value = currentTplId;
  }
  buildTemplateOptions();

  selTpl?.addEventListener('change', ()=>{
    const t = MESSAGE_TEMPLATES.find(x=>x.id===selTpl.value) || MESSAGE_TEMPLATES[0];
    currentTplId = t.id;
    inpMessage.value = t.text;
    applyPreviewAndURL();
    showToast(`テンプレート「${t.label}」を適用しました`);
  });

  // ===== 初期フォームへ流し込み =====
  (function hydrate(){
    const domAddr = (addrEl.innerText||addrEl.textContent||'').replace(/\u00a0/g,' ').trim();
    const {base,honor} = splitHonorific(domAddr);
    inpAddress.value = base; inpHonor.value = honor;
    inpSender.value  = (senderEl.innerText||senderEl.textContent||'').trim();
    inpMessage.value = htmlToPlain(msgEl.innerHTML);
    chkPhoto.checked = !photoEl.classList.contains('hidden');
    chkMsgBg.checked = !msgEl.classList.contains('no-bg');

    greeting.style.setProperty('--bg-image', `url("${selectedBgUrl}")`);
  })();

  // ===== 適用 & URL生成 =====
  function setInvalid(el,on){ el?.classList.toggle('is-invalid',!!on); el?.setAttribute('aria-invalid', on?'true':'false'); }
  function validateRequired(){
    const aOk = !!sanitize(inpAddress.value);
    const sOk = !!sanitize(inpSender.value);
    setInvalid(inpAddress,!aOk); setInvalid(inpSender,!sOk);
    return aOk && sOk;
  }
  function applyToDOM(address, sender, message, honor){
    const base = (address||'').trim();
    const suffix = honor || '';
    const final = suffix ? `${base} ${suffix}` : base;
    addrEl.innerHTML      = escapeHtml(final).replace(/ /g,'&nbsp;');
    senderEl.textContent  = (sender||'').trim();
    msgEl.innerHTML       = plainToHtml(message||'');
  }

  const buildShareURL = (obj, id) => {
    const enc  = encodeData(obj);
    const base = location.href.split('#')[0];
    return `${base}#id=${id}&data=${enc}`;
  };

  const applyPreviewAndURL = debounce(async ()=>{
    validateRequired();

    const address = sanitize(inpAddress.value);
    const sender  = sanitize(inpSender.value);
    const message = sanitize(inpMessage.value);
    const honor   = sanitize(inpHonor.value);

    applyToDOM(address, sender, message, honor);
    photoEl.classList.toggle('hidden', !chkPhoto.checked);
    msgEl.classList.toggle('no-bg', !chkMsgBg.checked);

    // 共有用は常に安定URL（blobは入れない）
    const bgurlForShare = stableBgUrl || './images/background_sample1.png';

    const dataObj = {
      a: address, s: sender, m: message, h: honor,
      bgurl: bgurlForShare,
      pv: chkPhoto.checked ? 1 : 0,
      mbg: chkMsgBg.checked ? 1 : 0,
      mtid: currentTplId
    };

    const id  = await hashIdShort(address, sender, SHORT_ID_LEN);
    const url = buildShareURL(dataObj, id);

    if (!csvOpen){
      if (history.replaceState) history.replaceState(null,'', url); else location.hash = url.split('#')[1];
      txtUrl.value = url;
    }
  }, 80);

  ['input','change'].forEach(type=>{
    inpAddress.addEventListener(type, applyPreviewAndURL);
    inpHonor.addEventListener(type, applyPreviewAndURL);
    inpSender.addEventListener(type, applyPreviewAndURL);
    inpMessage.addEventListener(type, applyPreviewAndURL);
    chkPhoto.addEventListener(type, applyPreviewAndURL);
    chkMsgBg.addEventListener(type, applyPreviewAndURL);
  });

  // ===== サンプル背景 =====
  sampleGrid?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.sample'); if (!btn) return;
    const src = btn.getAttribute('data-src'); if (!src) return;
    // プレビュー & 共有同時更新（公開ファイルなのでそのまま安定URL）
    setBackground(src, src);
    showToast('サンプル背景を適用しました');
    e.stopPropagation();
  });

  // ===== 画像トリミング → プレビュー即時 → バックグラウンドでアップロード（毎回ユニークKey） =====
  function destroyCropper(){ if (cropper){ cropper.destroy(); cropper=null; } }

  async function processCropAndUpload() {
    if (!cropper) return;

    // ① プレビュー用dataURL（確実に出す）
    const cRaw = cropper.getCroppedCanvas({ width: OUT_W, height: OUT_H, imageSmoothingQuality: 'high' });
    const dataURL = encodeImageMax(cRaw, {
      maxKB: 1900, startQ: 0.78, minQ: 0.35, stepQ: 0.06,
      longStart: Math.max(OUT_W, OUT_H), minLong: 1000, shrinkRate: 0.9
    });

    revokeObjUrl();
    currentObjUrl = URL.createObjectURL(dataURLToBlob(dataURL));
    setBackground(currentObjUrl);  // ここでは共有用URLは更新しない

    // ② 非同期アップロード（RLSがINSERTのみでもOK: upsert:false & unique key）
    (async ()=>{
      try {
        const shortId = await hashIdShort(sanitize(inpAddress.value), sanitize(inpSender.value), 10);
        const publicUrl = await uploadBgWebP(dataURL, shortId);
        // 成功 → 共有URL更新 & プレビューも安定URLへ
        setBackground(publicUrl, publicUrl);
        showToast('背景をアップロードして共有URLを更新しました');
      } catch (err) {
        console.error('Upload failed', err);
        showToast('背景のアップロードに失敗しました（プレビューは表示中）');
      }
    })();
  }

  inpBgFile?.addEventListener('change', async ()=>{
    let f = inpBgFile.files?.[0]; if(!f) return;

    // HEIF → JPEG 変換（必要な場合のみ）
    try { if (isHeifFile(f)) f = await convertHeifToBlob(f); }
    catch { showToast('HEIFの変換に失敗しました'); return; }

    // EXIFの向き補正付きで安全に読み込み（iOS対策）
    let srcURL;
    try { srcURL = await normalizeForIOS(f, 4096); }
    catch { srcURL = URL.createObjectURL(f); }

    cropImg.src = srcURL; await waitImageLoaded(cropImg);
    destroyCropper(); revokeObjUrl();

    cropper = new window.Cropper(cropImg, {
      viewMode: 1, dragMode: 'move', aspectRatio: 100/148, autoCropArea: 1,
      responsive: true, background: false, movable: true, zoomable: true,
      checkOrientation: false,
      ready(){
        // 初回は自動適用（ユーザ操作なしで1回は反映させる）
        if (!didAutoApply){
          setTimeout(async ()=>{
            await processCropAndUpload(); // 失敗しても例外を外に出さない
            didAutoApply = true;
            showToast('初回トリミングを適用しました');
          }, 30);
        }
      }
    });
    cropBox.setAttribute('aria-hidden','false');
  });

  btnCropReset?.addEventListener('click', ()=> cropper && cropper.reset());
  btnCropApply?.addEventListener('click', async ()=>{ await processCropAndUpload(); });

  // 画像書き出し（確認用）
  btnExport?.addEventListener('click', async ()=>{
    const src = stableBgUrl || selectedBgUrl;
    if (!src){ showToast('背景がありません'); return; }
    const blob = await fetch(src).then(r=>r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'nenga_bg.webp'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 800);
  });

  // ===== URLコピー =====
  btnCopy?.addEventListener('click', async ()=>{
    await applyPreviewAndURL.flush?.();
    const ok = await tryCopy(txtUrl.value);
    btnCopy.textContent = ok ? 'コピー済' : 'コピー失敗';
    setTimeout(()=> (btnCopy.textContent='URLをコピー'), 1200);
    if (ok) showToast('URLをコピーしました');
  });

  // ===== ハッシュ復元 =====
  window.addEventListener('hashchange', bootFromHash);
  bootFromHash();
  async function bootFromHash(){
    const parsed = parseHash(location.hash); if(!parsed){ applyPreviewAndURL(); return; }
    const obj = decodeData(parsed.data); if(!obj) return;
    const { a, s, m, h='様', bgurl=null, pv=1, mbg=1, mtid='std1' } = obj;

    const address = a ?? ''; const sender = s ?? ''; const message = m ?? ''; const honor = h ?? '様';
    applyToDOM(address, sender, message, honor);

    // 復元時は display/stable を同じ安定URLに
    const initBg = bgurl || './images/background_sample1.png';
    setBackground(initBg, initBg);

    photoEl.classList.toggle('hidden', !pv);
    msgEl.classList.toggle('no-bg', !mbg);

    currentTplId = mtid || 'std1'; buildTemplateOptions();
    const {base} = splitHonorific(address);
    inpAddress.value = base; inpHonor.value = honor; inpSender.value = sender; inpMessage.value = htmlToPlain(msgEl.innerHTML);
    chkPhoto.checked = !!pv; chkMsgBg.checked = !!mbg;

    applyPreviewAndURL();
  }

  // ===== CSVモード =====
  function setCsvMode(on){
    csvOpen = !!on;
    csvPanel.style.display = csvOpen ? 'block' : 'none';
    panelText.style.display = csvOpen ? 'none' : '';
    actionsBar.style.display = csvOpen ? 'none' : '';
    btnCsvMode.setAttribute('aria-pressed', csvOpen ? 'true' : 'false');
    btnCsvMode.textContent = csvOpen ? 'CSVモード解除' : 'CSVモード';
    if (csvOpen){
      csvSummary.textContent = 'CSV未選択';
      csvPreview.value=''; csvGenerate.disabled = true;
      setTimeout(()=> csvFile?.focus(), 0);
    }
  }
  btnCsvMode?.addEventListener('click', ()=> setCsvMode(!csvOpen));
  csvExit?.addEventListener('click', ()=> setCsvMode(false));

  csvFile?.addEventListener('change', async ()=>{
    csvGenerate.disabled = true; csvSummary.textContent = 'CSV未選択'; csvPreview.value='';
    const f = csvFile.files?.[0]; if (!f) return;
    if (!/\.csv$/i.test(f.name) && (f.type && f.type.indexOf('csv') === -1)) { showToast('CSVファイルを選択してください'); return; }
    const text = await f.text(); const rows = parseCSV(text);
    if (!rows.length) { showToast('CSVを解析できませんでした'); return; }
    csvSummary.textContent = `読み込み：${f.name}（${rows.length} 行）`;
    csvPreview.value = rows.slice(0, 10).map(r => r.join(',')).join('\n');
    csvGenerate.disabled = false;
  });

  csvGenerate?.addEventListener('click', async ()=>{
    const f = csvFile?.files?.[0]; if (!f) { showToast('CSVが選択されていません'); return; }
    await handleCsvGenerate({
      file: f,
      currentBgUrl: stableBgUrl,                  // 共有は常に安定URL
      buildUrl: (obj, id)=>{
        const enc  = encodeData(obj);
        const base = location.href.split('#')[0];
        return `${base}#id=${id}&data=${enc}`;
      },
    });
  });
}
