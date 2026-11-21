import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeData, decodeData, parseHash, plainToHtml } from '../js/utils.js';
import { parseCSV } from '../js/csv-mode.js';
import { initCardControls } from '../js/card-controls.js';

test('日本語・改行・絵文字を共有URLから復元できる', () => {
  const data = { a: '宛名 太郎', s: '差出人', m: '新年おめでとう\n🐎 & < >', h: '様' };
  const encoded = encodeData(data);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeData(parseHash(`#id=example&data=${encoded}`).data), data);
  assert.equal(parseHash('#id=example'), null);
  assert.equal(plainToHtml('<img src=x onerror=alert(1)>\n&'), '&lt;img src=x onerror=alert(1)&gt;<br/>&amp;');
});

test('CSV: BOM・CRLF・CR・引用符内の改行とカンマ', () => {
  assert.deepEqual(parseCSV('\uFEFF"山田, 太郎",0,"差出""人"\r\n次郎,1,花子\r'), [
    ['山田, 太郎', '0', '差出"人'], ['次郎', '1', '花子'],
  ]);
  assert.deepEqual(parseCSV('a,"b\r\nc",\rd,e,f'), [['a', 'b\r\nc', ''], ['d', 'e', 'f']]);
  assert.deepEqual(parseCSV(''), []);
  assert.throws(() => parseCSV('a,"閉じていない'), /引用符/);
});

test('Enter/Spaceはクリック経路を使い、フォーム・HUD・演出中には干渉しない', () => {
  const handlers = new Map();
  const body = {}, unrelatedButton = {}, cardTarget = {};
  let editing = false, playing = false, clicks = 0;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = { addEventListener: (name, fn) => handlers.set(name, fn) };
  globalThis.document = { body, getElementById: () => ({ classList: { contains: () => playing } }) };
  const classes = new Set();
  const container = {
    addEventListener() {}, removeEventListener() {},
    contains: (target) => target === cardTarget,
    click: () => clicks++,
  };
  const card = {
    classList: { contains: (key) => classes.has(key), add: (key) => classes.add(key),
      toggle: (key, value) => value ? classes.add(key) : classes.delete(key) },
    setAttribute() {}, style: { setProperty() {} },
  };
  try {
    initCardControls({ container, card, isEditorOpen: () => editing });
    const key = (code, target = cardTarget) => handlers.get('keydown')({ code, target, preventDefault() {} });
    key('Space'); key('Enter'); assert.equal(clicks, 2);
    key('Enter', unrelatedButton); assert.equal(clicks, 2);
    playing = true; key('Enter', body); assert.equal(clicks, 2);
    playing = false; editing = true; key('Space'); assert.equal(clicks, 2);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
