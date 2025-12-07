// js/editor.js
// 蟷ｴ雉迥ｶ繧ｨ繝・ぅ繧ｿ譛ｬ菴難ｼ医・繝ｬ繝薙Η繝ｼ蜊ｳ譎ょ渚譏 / Supabase縺ｸ髱槫酔譛溘い繝・・繝ｭ繝ｼ繝・/ CSV荳諡ｬ逕滓・・・
// 萓晏ｭ・ utils.js, templates.js, image-utils.js, storage.js, csv-mode.js

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

const SHORT_ID_LEN = 12; // URL逕ｨ縺ｮ遏ｭ縺ИD

export function initEditor() {
  const $ = (s) => document.querySelector(s);

  // ===== DOM =====
  const addrEl   = $('.address');
  const addrMainEl = $('.address-main');
  const senderEl = $('.sender');
  const msgEl    = $('.greeting-side p');
  const greeting = $('.greeting-side');
  const photoEl  = $('.new-year-image');

  const openBtn  = $('#editor-open');
  const overlay  = $('#editor-overlay');
  const closeBtn = $('#editor-close');
  const editorScroll = $('#editor-scroll');

  // 蟾ｦ繝壹う繝ｳ・磯壼ｸｸ繝｢繝ｼ繝会ｼ・
  const panelText  = $('#panel-text');
  const inpAddress = $('#inp-address');
  const inpHonor   = $('#inp-honorific');
  const inpSender  = $('#inp-sender');
  const selTpl     = $('#sel-message-template');
  const inpMessage = $('#inp-message');
  const chkPhoto   = $('#chk-photo');
  const chkMsgBg   = $('#chk-msgbg');

  // 閭梧勹・壹し繝ｳ繝励Ν/繧｢繝・・繝ｭ繝ｼ繝・繝医Μ繝溘Φ繧ｰ
  const sampleGrid   = $('#sample-grid');
  const inpBgFile    = $('#inp-bgfile');
  const bgUploader   = $('#bgfile-uploader');
  const cropBox      = $('#cropper');
  const cropImg      = $('#crop-img');
  const btnCropReset = $('#btn-crop-reset');
  const btnCropApply = $('#btn-crop-apply');
  const btnExport    = $('#btn-export');

  // 蜈ｱ譛・
  const actionsBar = $('#editor-actions');
  const txtUrl   = $('#share-url');
  const btnCopy  = $('#btn-copy');

  // CSV繝｢繝ｼ繝・
  const btnCsvMode  = $('#btn-csv-mode');
  const csvPanel    = $('#csv-panel');
  const csvFile     = $('#csv-file');
  const csvGenerate = $('#csv-generate');
  const csvExit     = $('#csv-exit');
  const csvSummary  = $('#csv-summary');
  const csvPreview  = $('#csv-preview');

  const updateBgFileVisualState = () => {
    const hasFile = !!(inpBgFile?.files && inpBgFile.files.length);
    bgUploader?.classList.toggle('uploader--has-file', hasFile);
  };
  updateBgFileVisualState();

  // ===== State =====
  // 陦ｨ遉ｺ逕ｨ・・lob蜿ｯ繝ｻ繝励Ξ繝薙Η繝ｼ蜆ｪ蜈茨ｼ・
  let selectedBgUrl = './images/background_sample1.png';
  // 蜈ｱ譛臥畑・亥ｸｸ縺ｫ蜈ｬ髢偽RL・晄ｰｸ邯啅RL縺ｮ縺ｿ・・
  let stableBgUrl   = './images/background_sample1.png';

  let cropper = null;
  let currentObjUrl = null;
  let didAutoApply = false;
  let currentTplId  = 'std1';
  let csvOpen = false;
  let remoteUploadDisabled = false;
  let uploadFallbackNotified = false;

  // ===== 閭梧勹蜿肴丐繝倥Ν繝・=====
  function setBackground(displayUrl, stableUrl) {
    // 繝励Ξ繝薙Η繝ｼ縺ｯ蟶ｸ縺ｫ蜊ｳ譎ゅ↓ displayUrl 繧呈緒逕ｻ
    selectedBgUrl = displayUrl || './images/background_sample1.png';
    greeting.style.setProperty('--bg-image', `url("${selectedBgUrl}")`);
    // 蜈ｱ譛臥畑縺ｯ螳牙ｮ啅RL縺梧擂縺滓凾縺ｮ縺ｿ譖ｴ譁ｰ
    if (stableUrl) stableBgUrl = stableUrl;
    // URL蜀咲函謌・
    applyPreviewAndURL();
  }
  function revokeObjUrl() {
    if (currentObjUrl) { URL.revokeObjectURL(currentObjUrl); currentObjUrl = null; }
  }

  // ===== 繝｢繝ｼ繝繝ｫ髢矩哩 =====
  const isEditorOpen = () => overlay.getAttribute('aria-hidden') === 'false';

  // 繧ｨ繝・ぅ繧ｿ荳ｭ縺ｯ繧ｫ繝ｼ繝峨・繧ｭ繝ｼ繝懊・繝画桃菴懊ｒ謚第ｭ｢・・nter/Space縺ｪ縺ｩ・・
  window.addEventListener('keydown', (e) => {
    if (isEditorOpen() && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) {
      e.stopPropagation();
    }
  }, true);
  // 閭梧勹繧ｯ繝ｪ繝・け縺ｮ蜿崎ｻ｢繧呈椛豁｢
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

  // ===== 繝｡繝・そ繝ｼ繧ｸ繝・Φ繝励Ξ =====
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
    showToast(`繝・Φ繝励Ξ繝ｼ繝医・{t.label}縲阪ｒ驕ｩ逕ｨ縺励∪縺励◆`);
  });

  // ===== 蛻晄悄繝輔か繝ｼ繝縺ｸ豬√＠霎ｼ縺ｿ =====
  (function hydrate(){
    const addrSource = addrMainEl || addrEl;
    const domAddr = (addrSource?.innerText||addrSource?.textContent||'').replace(/\u00a0/g,' ').trim();
    const {base,honor} = splitHonorific(domAddr);
    inpAddress.value = base; inpHonor.value = honor;
    inpSender.value  = (senderEl.innerText||senderEl.textContent||'').trim();
    inpMessage.value = htmlToPlain(msgEl.innerHTML);
    chkPhoto.checked = !photoEl.classList.contains('hidden');
    chkMsgBg.checked = !msgEl.classList.contains('no-bg');

    greeting.style.setProperty('--bg-image', `url("${selectedBgUrl}")`);
  })();

  // ===== 驕ｩ逕ｨ & URL逕滓・ =====
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
    const addrTarget = addrMainEl || addrEl;
    if (addrTarget) addrTarget.innerHTML = escapeHtml(final).replace(/ /g,'&nbsp;');
    senderEl.textContent  = (sender||'').trim();
    msgEl.innerHTML       = plainToHtml(message||'');
  }

  const buildShareURL = (obj, id) => {
    const enc  = encodeData(obj);
    const base = location.href.split('#')[0];
    return `${base}#id=${id}&data=${enc}`;
  };

  // 謖ｨ諡ｶ髱｢縺ｮ逕ｻ蜒上・繝｡繝・そ繝ｼ繧ｸ菴咲ｽｮ繧ょ・譛峨ョ繝ｼ繧ｿ縺ｫ蜷ｫ繧√ｋ
  const POS_KEYS = {
    imgY: 'nenga_img_shift_y_px',
    msgY: 'nenga_msg_shift_y_px',
  };
  const getPosState = () => ({
    imgY: Number(localStorage.getItem(POS_KEYS.imgY) ?? 0),
    msgY: Number(localStorage.getItem(POS_KEYS.msgY) ?? 0),
  });
  const setPosState = (imgY = 0, msgY = 0) => {
    localStorage.setItem(POS_KEYS.imgY, String(imgY));
    localStorage.setItem(POS_KEYS.msgY, String(msgY));
    const rImg = document.getElementById('range-img-y');
    const rMsg = document.getElementById('range-msg-y');
    const oImg = document.getElementById('out-img-y');
    const oMsg = document.getElementById('out-msg-y');
    if (rImg) rImg.value = imgY;
    if (rMsg) rMsg.value = msgY;
    if (oImg) oImg.textContent = imgY;
    if (oMsg) oMsg.textContent = msgY;
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

    // 蜈ｱ譛臥畑縺ｯ蟶ｸ縺ｫ螳牙ｮ啅RL・・lob縺ｯ蜈･繧後↑縺・ｼ・
    const bgurlForShare = stableBgUrl || './images/background_sample1.png';
    const { imgY, msgY } = getPosState();

    const dataObj = {
      a: address, s: sender, m: message, h: honor,
      bgurl: bgurlForShare,
      pv: chkPhoto.checked ? 1 : 0,
      mbg: chkMsgBg.checked ? 1 : 0,
      mtid: currentTplId,
      iy: imgY,
      my: msgY
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

  // ===== 繧ｵ繝ｳ繝励Ν閭梧勹 =====
  sampleGrid?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.sample'); if (!btn) return;
    const src = btn.getAttribute('data-src'); if (!src) return;
    // 繝励Ξ繝薙Η繝ｼ & 蜈ｱ譛牙酔譎よ峩譁ｰ・亥・髢九ヵ繧｡繧､繝ｫ縺ｪ縺ｮ縺ｧ縺昴・縺ｾ縺ｾ螳牙ｮ啅RL・・
    setBackground(src, src);
    showToast('サンプル背景を適用しました');
    e.stopPropagation();
  });

  // ===== 逕ｻ蜒上ヨ繝ｪ繝溘Φ繧ｰ 竊・繝励Ξ繝薙Η繝ｼ蜊ｳ譎・竊・繝舌ャ繧ｯ繧ｰ繝ｩ繧ｦ繝ｳ繝峨〒繧｢繝・・繝ｭ繝ｼ繝会ｼ域ｯ主屓繝ｦ繝九・繧ｯKey・・=====
  function destroyCropper(){ if (cropper){ cropper.destroy(); cropper=null; } }


  async function processCropAndUpload() {
    if (!cropper) return;

    // A. 繝励Ξ繝薙Η繝ｼ逕ｨ dataURL 繧堤函謌・
    const cRaw = cropper.getCroppedCanvas({ width: OUT_W, height: OUT_H, imageSmoothingQuality: 'high' });
    const dataURL = encodeImageMax(cRaw, {
      maxKB: 1900, startQ: 0.78, minQ: 0.35, stepQ: 0.06,
      longStart: Math.max(OUT_W, OUT_H), minLong: 1000, shrinkRate: 0.9
    });

    revokeObjUrl();
    currentObjUrl = URL.createObjectURL(dataURLToBlob(dataURL));
    setBackground(currentObjUrl);  // 繝励Ξ繝薙Η繝ｼ縺ｧ縺ｯ蜈ｱ譛臥畑URL縺ｯ譖ｴ譁ｰ縺励↑縺・

    const applyLocalOnlyBackground = () => {
      setBackground(currentObjUrl, dataURL);
      if (!uploadFallbackNotified) {
        showToast('外部ストレージに接続できないため、画像をデータURLとして共有に埋め込みます');
        uploadFallbackNotified = true;
      }
    };

    if (remoteUploadDisabled) {
      applyLocalOnlyBackground();
      return;
    }

    // B. Supabase 縺ｸ繧｢繝・・繝ｭ繝ｼ繝会ｼ・LS 縺ｧ INSERT 縺ｮ縺ｿ蜿ｯ: upsert:false & unique key・・
    (async ()=>{
      try {
        const shortId = await hashIdShort(sanitize(inpAddress.value), sanitize(inpSender.value), 10);
        const publicUrl = await uploadBgWebP(dataURL, shortId);
        // 謌仙粥 竊・蜈ｬ髢偽RL譖ｴ譁ｰ & 繝励Ξ繝薙Η繝ｼ繧ょｮ牙ｮ啅RL縺ｸ
        setBackground(publicUrl, publicUrl);
        showToast('背景をアップロードしてURLを更新しました');
      } catch (err) {
        console.error('Upload failed', err);
        remoteUploadDisabled = true;
        applyLocalOnlyBackground();
      }
    })();
  }
  inpBgFile?.addEventListener('change', async ()=>{
    updateBgFileVisualState();
    let f = inpBgFile.files?.[0]; if(!f) return;

    // HEIF 竊・JPEG 螟画鋤・亥ｿ・ｦ√↑蝣ｴ蜷医・縺ｿ・・
    try { if (isHeifFile(f)) f = await convertHeifToBlob(f); }
    catch { showToast('HEIFの変換に失敗しました'); return; }

    // EXIF縺ｮ蜷代″陬懈ｭ｣莉倥″縺ｧ螳牙・縺ｫ隱ｭ縺ｿ霎ｼ縺ｿ・・OS蟇ｾ遲厄ｼ・
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
        // 蛻晏屓縺ｯ閾ｪ蜍暮←逕ｨ・医Θ繝ｼ繧ｶ謫堺ｽ懊↑縺励〒1蝗槭・蜿肴丐縺輔○繧具ｼ・
        if (!didAutoApply){
          setTimeout(async ()=>{
            await processCropAndUpload(); // 初回の自動適用
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

  // 逕ｻ蜒乗嶌縺榊・縺暦ｼ育｢ｺ隱咲畑・・
  btnExport?.addEventListener('click', async ()=>{
    const src = stableBgUrl || selectedBgUrl;
    if (!src){ showToast('背景が設定されていません'); return; }
    const blob = await fetch(src).then(r=>r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'nenga_bg.webp'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 800);
  });

  // ===== URL繧ｳ繝斐・ =====
  btnCopy?.addEventListener('click', async ()=>{
    await applyPreviewAndURL.flush?.();
    const ok = await tryCopy(txtUrl.value);
    btnCopy.textContent = ok ? 'コピー成功' : 'コピー失敗';
    setTimeout(()=> (btnCopy.textContent='URLをコピー'), 1200);
    if (ok) showToast('URLをコピーしました');
  });

  // ===== 繝上ャ繧ｷ繝･蠕ｩ蜈・=====
  window.addEventListener('hashchange', bootFromHash);
  bootFromHash();
  async function bootFromHash(){
    const parsed = parseHash(location.hash); if(!parsed){ applyPreviewAndURL(); return; }
    const obj = decodeData(parsed.data); if(!obj) return;
    const { a, s, m, h='様', bgurl=null, pv=1, mbg=1, mtid='std1', iy=0, my=0 } = obj;

    const address = a ?? ''; const sender = s ?? ''; const message = m ?? ''; const honor = h ?? '様';
    applyToDOM(address, sender, message, honor);
    setPosState(iy || 0, my || 0);

    // 蠕ｩ蜈・凾縺ｯ display/stable 繧貞酔縺伜ｮ牙ｮ啅RL縺ｫ
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

  // ===== CSV繝｢繝ｼ繝・=====
  function setCsvMode(on){
    csvOpen = !!on;
    csvPanel.style.display = csvOpen ? 'block' : 'none';
    panelText.style.display = csvOpen ? 'none' : '';
    actionsBar.style.display = csvOpen ? 'none' : '';
    btnCsvMode.setAttribute('aria-pressed', csvOpen ? 'true' : 'false');
    btnCsvMode.textContent = csvOpen ? 'CSVモード終了' : 'CSVモード';
    if (csvOpen){
      csvSummary.textContent = 'CSVを読み込んでください';
      csvPreview.value='';
      csvGenerate.disabled = true;
      setTimeout(()=> csvFile?.focus(), 0);
    }
  }
  btnCsvMode?.addEventListener('click', ()=> setCsvMode(!csvOpen));
  csvExit?.addEventListener('click', ()=> setCsvMode(false));

  csvFile?.addEventListener('change', async ()=>{
    csvGenerate.disabled = true;
    csvSummary.textContent = 'CSVを読み込み中…';
    csvPreview.value='';
    const f = csvFile.files?.[0]; if (!f) return;
    if (!/\.csv$/i.test(f.name) && (f.type && f.type.indexOf('csv') === -1)) { showToast('CSVファイルを選択してください'); return; }
    const text = await f.text(); const rows = parseCSV(text);
    if (!rows.length) { showToast('CSVの読み込みに失敗しました'); return; }
    csvSummary.textContent = `${f.name}（${rows.length} 件）を読み込みました`;
    csvPreview.value = rows.slice(0, 10).map(r => r.join(',')).join('\n');
    csvGenerate.disabled = false;
  });

  csvGenerate?.addEventListener('click', async ()=>{
    const f = csvFile?.files?.[0]; if (!f) { showToast('CSVを選択してください'); return; }
    await handleCsvGenerate({
      file: f,
      currentBgUrl: stableBgUrl,                  // 蜈ｱ譛峨・蟶ｸ縺ｫ螳牙ｮ啅RL
      buildUrl: (obj, id)=>{
        const enc  = encodeData(obj);
        const base = location.href.split('#')[0];
        return `${base}#id=${id}&data=${enc}`;
      },
    });
  });
}










