// js/position-controls.js
(() => {
  const LS_KEYS = {
    imgY: 'nenga_img_shift_y_px',
    msgY: 'nenga_msg_shift_y_px',
  };

  const $ = (s, r = document) => r.querySelector(s);

  function applyShifts(imgY, msgY) {
    const card = $('#card');
    const gSide = card ? $('.greeting-side', card) : null;
    const img = gSide ? $('.new-year-image', gSide) : null;
    const msg = gSide ? ($('.greeting-message', gSide) || $('p', gSide)) : null;

    if (img) img.style.translate = `0 ${imgY}px`;
    if (msg) msg.style.translate = `0 ${msgY}px`;
  }

  function loadState() {
    const imgY = Number(localStorage.getItem(LS_KEYS.imgY) ?? 0);
    const msgY = Number(localStorage.getItem(LS_KEYS.msgY) ?? 0);
    return { imgY, msgY };
  }
  function saveState({ imgY, msgY }) {
    localStorage.setItem(LS_KEYS.imgY, String(imgY));
    localStorage.setItem(LS_KEYS.msgY, String(msgY));
  }

  function buildPanel() {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = 'panel-position-controls';
    // 背景設定パネルの空きスペースに馴染むよう、最小の内連スタイルだけ付与
    sec.style.marginTop = '12px';
    sec.style.border = '1px solid rgba(0,0,0,0.06)';
    sec.style.borderRadius = '8px';
    sec.style.padding = '12px';

    sec.innerHTML = `
      <h3 class="group-title" style="margin:0 0 8px;">位置調整（挨拶面）</h3>

      <div class="stack" style="display:grid;gap:6px;">
        <label class="stack" style="display:grid;gap:6px;">
          <span class="label" style="font-weight:600;">画像（px）</span>
          <div class="row" style="display:flex;align-items:center;gap:8px;">
            <input id="range-img-y" type="range" min="-300" max="300" step="1" value="0" style="flex:1;">
            <output id="out-img-y" style="min-width:5ch;text-align:right;">0</output>
          </div>
          <div class="hint" style="font-size:12px;color:#666;">上へマイナス／下へプラス</div>
        </label>
      </div>

      <div class="stack" style="display:grid;gap:6px;margin-top:8px;">
        <label class="stack" style="display:grid;gap:6px;">
          <span class="label" style="font-weight:600;">挨拶文（px）</span>
          <div class="row" style="display:flex;align-items:center;gap:8px;">
            <input id="range-msg-y" type="range" min="-300" max="300" step="1" value="0" style="flex:1;">
            <output id="out-msg-y" style="min-width:5ch;text-align:right;">0</output>
          </div>
          <div class="hint" style="font-size:12px;color:#666;">上へマイナス／下へプラス</div>
        </label>
      </div>

      <div class="row" style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <button id="btn-pos-reset" type="button">リセット</button>
        <span class="hint" style="font-size:12px;color:#666;">プレビュー＝実表示に即時反映</span>
      </div>
    `;
    return sec;
  }

  // 背景エディタ（Cropper）セクションと、その「右カラム（プレビュー側）」を推定取得
  function findBackgroundEditorHost() {
    const editorHost = $('#editor-scroll') || $('.editor-body');
    if (!editorHost) return { editorHost: null, bgSection: null, rightCol: null };

    // 1) 背景エディタ内の核となる要素を探す
    const cropEl =
      editorHost.querySelector('#cropper') ||
      editorHost.querySelector('.cropper') ||
      editorHost.querySelector('[data-role="cropper"]') ||
      editorHost.querySelector('.bg-editor') ||
      null;

    if (!cropEl) return { editorHost, bgSection: null, rightCol: null };

    // 2) 背景エディタのセクション（見出しやボタンを含むまとまり）
    const bgSection = cropEl.closest('section, .group') || cropEl.parentElement;

    // 3) 右カラム（プレビュー側/画像側）の候補を広めに探索
    //    - よくあるクラス名の列候補を優先
    const rightColCandidate =
      cropEl.closest('.col, .column, .pane, .panel, .right, .right-col, .sidebar, .preview, .preview-col') ||
      cropEl.parentElement;

    return { editorHost, bgSection, rightCol: rightColCandidate };
  }

  function injectPanel() {
    const { editorHost, bgSection, rightCol } = findBackgroundEditorHost();
    if (!editorHost) return;
    if ($('#panel-position-controls')) return; // 二重挿入防止

    const sec = buildPanel();

    if (rightCol && rightCol.contains($('#cropper') || rightCol.querySelector('.cropper'))) {
      // 最優先：クロッパーと同じ“右カラム”の**直下**に挿入（＝空いているスペースに内包）
      //   - まず #cropper のブロック末尾を探す（ボタン群を含む親要素の後）
      const cropBlock = ($('#cropper') && $('#cropper').closest('div, section, .block, .panel, .pane')) || rightCol;
      cropBlock.insertAdjacentElement('afterend', sec);
    } else if (bgSection && bgSection.parentElement) {
      // フォールバック1：背景セクション直後
      bgSection.insertAdjacentElement('afterend', sec);
    } else {
      // フォールバック2：エディタ末尾
      editorHost.appendChild(sec);
    }

    const rImg = $('#range-img-y', sec);
    const rMsg = $('#range-msg-y', sec);
    const oImg = $('#out-img-y', sec);
    const oMsg = $('#out-msg-y', sec);
    const btnReset = $('#btn-pos-reset', sec);

    const { imgY, msgY } = loadState();
    rImg.value = imgY;
    rMsg.value = msgY;
    oImg.textContent = imgY;
    oMsg.textContent = msgY;
    applyShifts(Number(imgY), Number(msgY));

    const onInput = () => {
      const vImg = Number(rImg.value);
      const vMsg = Number(rMsg.value);
      oImg.textContent = vImg;
      oMsg.textContent = vMsg;
      applyShifts(vImg, vMsg);
      saveState({ imgY: vImg, msgY: vMsg });
    };
    rImg.addEventListener('input', onInput);
    rMsg.addEventListener('input', onInput);

    btnReset.addEventListener('click', () => {
      rImg.value = 0; rMsg.value = 0;
      oImg.textContent = '0'; oMsg.textContent = '0';
      applyShifts(0, 0);
      saveState({ imgY: 0, msgY: 0 });
    });

    // DOM差し替えに追従（トリミング後の画像入替／本文再描画）
    let rafId = 0;
    const keep = () => {
      const s = loadState();
      applyShifts(s.imgY, s.msgY);
      rafId = requestAnimationFrame(keep);
    };
    rafId = requestAnimationFrame(keep);

    // エディタ開閉で節約
    const overlay = $('#editor-overlay');
    const obs = new MutationObserver(() => {
      const hidden = overlay?.getAttribute('aria-hidden') === 'true';
      if (hidden && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      else if (!hidden && !rafId) { rafId = requestAnimationFrame(keep); }
    });
    if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  window.addEventListener('DOMContentLoaded', () => {
    const { imgY, msgY } = loadState();
    applyShifts(imgY, msgY);

    const tryInject = () => {
      const ok = !!($('#editor-scroll') || $('.editor-body'));
      if (ok) { injectPanel(); return true; }
      return false;
    };
    if (!tryInject()) {
      const mo = new MutationObserver(() => { if (tryInject()) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  });
})();
