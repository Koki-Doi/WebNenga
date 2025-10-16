// js/csv-mode.js
// CSVインポート→各行をURL化して「列G」に追記してダウンロード（1行目もデータ扱い）
import { sanitize, encodeData, hashIdShort, showToast } from './utils.js';

// 敬称コード → 表示文字
const HONORIFIC_MAP = {
  '0': '様',
  '1': '殿',
  '2': '君',
  '3': '御中',
  '4': ''      // (-)なし
};

function toCSV(rows) {
  return rows.map(cols => cols.map(v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
}

export function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', inQ = false, row = [];
  const push = () => { row.push(field); field=''; };
  const endRow = () => { rows.push(row); row=[]; };
  while (i < text.length) {
    const c = text[i++];
    if (inQ) {
      if (c === '"') {
        if (text[i] === '"') { field += '"'; i++; } else { inQ = false; }
      } else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { push(); }
      else if (c === '\n') { push(); endRow(); }
      else if (c === '\r') { /* ignore */ }
      else { field += c; }
    }
  }
  push();
  if (row.length > 1 || row[0] !== '') endRow();
  return rows;
}

/**
 * A=宛名 / B=敬称コード / C=差出 / D=挨拶文 / E="謹賀新年"(0/1) / F=挨拶文背景(0/1)
 * ※ 1行目もヘッダーではなくデータとして扱う
 * 出力：列GにURLを追記
 */
export async function handleCsvGenerate({ file, currentBgUrl, buildUrl }) {
  const text = await file.text();
  const rows = parseCSV(text);

  if (!rows.length) {
    showToast('CSVにデータがありません');
    return;
  }

  let ok = 0, ng = 0;
  const start = 0; // ★ ヘッダーなし。先頭行から処理

  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];

    // A〜F
    const A = sanitize(row[0] ?? '');        // 宛名
    const B = String(row[1] ?? '').trim();   // 敬称コード
    const C = sanitize(row[2] ?? '');        // 差出
    const D = String(row[3] ?? '');          // 挨拶文
    const E = String(row[4] ?? '0').trim();  // 謹賀新年(0/1)（保持のみ）
    const F = String(row[5] ?? '1').trim();  // 挨拶文背景(0/1)

    // 必須
    if (!A || !C) {
      ng++;
      const newRow = row.slice();
      newRow[6] = 'ERR: 宛名/差出が空です';
      rows[r] = newRow;
      continue;
    }

    const honor = HONORIFIC_MAP.hasOwnProperty(B) ? HONORIFIC_MAP[B] : HONORIFIC_MAP['0'];
    const showKinga = E === '1' ? 1 : 0;        // 将来互換用
    const msgBg     = F === '0' ? 0 : 1;        // 1:白半透明
    const photoVis  = 1;                         // 既定で表示

    const dataObj = {
      a: A,
      s: C,
      m: D,
      h: honor,
      bgurl: currentBgUrl || './images/background_sample1.png',
      pv: photoVis,
      mbg: msgBg,
      kn: showKinga,
      mtid: 'csv'
    };

    try {
      const id  = await hashIdShort(A, C, 12);
      const url = buildUrl(dataObj, id);
      const newRow = row.slice();
      newRow[6] = url;       // 列GにURL
      rows[r] = newRow;
      ok++;
    } catch (e) {
      const newRow = row.slice();
      newRow[6] = 'ERR: URL生成失敗';
      rows[r] = newRow;
      ng++;
    }
  }

  const out = toCSV(rows);
  const blob = new Blob([out], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (file.name.replace(/\.csv$/i,'') || 'result') + '_with_url.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 800);

  showToast(`CSV生成：成功 ${ok} 行 / 失敗 ${ng} 行（URLは列Gに追記）`);
}
