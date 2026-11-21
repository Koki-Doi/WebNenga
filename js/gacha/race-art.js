// 競馬場まわりの手描きテクスチャ（canvas 2D のみ。THREE には依存しない純粋な描画関数）
// 参考: movie/frames 0148(ゲート全景) / 0196(ゲート上部) / 0240(金ゲートの扉)
const TAU = Math.PI * 2;

// 毎回同じ絵になる決定的な乱数
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Catmull-Rom で制御点を滑らかに結ぶ
function spline(points, samples = 12) {
  const out = [], n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    for (let k = 0; k < samples; k++) {
      const t = k / samples, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => .5 * (2 * p1[a] + (p2[a] - p0[a]) * t
        + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2
        + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(points[n - 1]);
  return out;
}

// 中心線に沿って太さが変わる帯（唐草の一筆）を塗りつぶしパスにする
function ribbonPath(g, pts, width) {
  const left = [], right = [], last = pts.length - 1;
  for (let i = 0; i <= last; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(last, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const half = Math.max(.01, width(i / last)) / 2;
    left.push([pts[i][0] - dy * half, pts[i][1] + dx * half]);
    right.push([pts[i][0] + dy * half, pts[i][1] - dx * half]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (let i = last; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
}
const widest = (width) => Math.max(...[0, .2, .4, .6, .8, 1].map(width));

// ---------- スタートゲートの扉（右扉を描き、左扉はUV反転で使う） ----------
// u: 合わせ目(0)→外框(1) / v: 上(0)→下(1)。実寸 0.605 x 1.95 と同じ縦横比。
export const GATE_LEAF = Object.freeze({ width: 384, height: 1238 });
const GATE_PALETTES = {
  silver: {
    stops: ['#ffffff', '#c9d3d9', '#f5f9fb', '#a7b4bc', '#e8eef1', '#b9c5cc'],
    hi: '#ffffff', lo: '#586770', wire: '#dde5e9', wireHi: '#ffffff', wireLo: '#87959e',
  },
  gold: {
    stops: ['#fff27c', '#eeb712', '#ffe75e', '#cb8c08', '#f8cf33', '#dea012'],
    hi: '#fffcd8', lo: '#80520a', wire: '#f0c226', wireHi: '#fff6ae', wireLo: '#a5720e',
  },
  rainbow: {
    stops: ['#ff86cc', '#ffe066', '#7beeb2', '#6cc9ff', '#b795ff', '#ff86cc', '#ffe066'],
    hi: '#ffffff', lo: '#6a5499', wire: null, wireHi: '#ffffff', wireLo: '#8470b4',
  },
};

export function paintGateLeaf(g, kind = 'silver') {
  const { width: W, height: H } = GATE_LEAF;
  const pal = GATE_PALETTES[kind];
  g.clearRect(0, 0, W, H);
  g.lineJoin = 'round'; g.lineCap = 'butt';
  // 斜めに明暗が繰り返すグラデーションで、磨いた金属の映り込みを出す
  const metal = g.createLinearGradient(0, 0, W * 1.2, H);
  pal.stops.forEach((c, i, a) => metal.addColorStop(i / (a.length - 1), c));
  const wire = pal.wire ?? metal;
  const U = (pts, n) => spline(pts.map(([u, v]) => [u * W, v * H]), n);
  const sample = (fn, n = 40) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
  // 上は合わせ目が高い眉形アーチ、下は丸アーチ
  const upperArch = sample((t) => [t * W, H * (.235 + .12 * t * t)]);
  const lowerArch = sample((t) => {
    const a = t * Math.PI / 2;
    return [W * .80 * Math.sin(a), H * (.84 - .285 * Math.cos(a))];
  });
  const outline = () => {
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(W * .70, 0); g.lineTo(W, H * .11);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  };
  const trace = (pts) => { for (const p of pts) g.lineTo(p[0], p[1]); };

  g.save();
  outline(); g.clip();

  // 中段の深緑の鏡板（上アーチの陰を落として一段奥まって見せる）
  g.beginPath();
  g.moveTo(upperArch[0][0], upperArch[0][1]); trace(upperArch);
  g.lineTo(W, H * .845); g.lineTo(0, H * .845); g.closePath();
  const panel = g.createLinearGradient(0, H * .23, 0, H * .85);
  panel.addColorStop(0, '#1f4f40'); panel.addColorStop(.14, '#3b8a6f');
  panel.addColorStop(.6, '#327a62'); panel.addColorStop(1, '#285f4f');
  g.fillStyle = panel; g.fill();
  // 下アーチの内側は格子なので鏡板を抜く
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, H * .845); trace(lowerArch); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';

  // 格子: 影→本体→ハイライトの3層で丸棒らしく見せる
  const mesh = (region, pitch, lineWidth, x0, y0) => {
    g.save(); region(); g.clip();
    for (const [dx, dy, color, width] of [
      [1.8, 2, pal.wireLo, lineWidth], [0, 0, wire, lineWidth], [-1.2, -1.2, pal.wireHi, lineWidth * .3],
    ]) {
      g.strokeStyle = color; g.lineWidth = width;
      g.beginPath();
      for (let x = x0; x <= W + pitch; x += pitch) { g.moveTo(x + dx, 0); g.lineTo(x + dx, H); }
      for (let y = y0; y <= H + pitch; y += pitch) { g.moveTo(0, y + dy); g.lineTo(W, y + dy); }
      g.stroke();
    }
    g.restore();
  };
  mesh(() => {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W * .70, 0); g.lineTo(W, H * .11);
    trace([...upperArch].reverse()); g.closePath();
  }, 38, 7.5, 19, 22);
  mesh(() => { g.beginPath(); g.moveTo(0, H * .845); trace(lowerArch); g.closePath(); }, 38, 7.5, 19, H * .555 + 26);
  mesh(() => { g.beginPath(); g.rect(0, H * .872, W, H * .1); }, 32, 6.5, 16, H * .872 + 30);

  // 浮き彫り: 右下に影、本体、左上にハイライト
  const emboss = (pts, width, bulb = 0) => {
    const w = widest(width), end = pts[pts.length - 1];
    g.save(); g.translate(w * .1 + 1.5, w * .14 + 2);
    ribbonPath(g, pts, (t) => width(t) + 2); g.fillStyle = pal.lo; g.fill();
    if (bulb) { g.beginPath(); g.arc(end[0], end[1], bulb + 1, 0, TAU); g.fill(); }
    g.restore();
    ribbonPath(g, pts, width); g.fillStyle = metal; g.fill();
    if (bulb) { g.beginPath(); g.arc(end[0], end[1], bulb, 0, TAU); g.fill(); }
    g.save(); g.globalAlpha = .92; g.translate(-w * .13, -w * .17);
    ribbonPath(g, pts, (t) => width(t) * .3); g.fillStyle = pal.hi; g.fill();
    if (bulb) { g.beginPath(); g.arc(end[0], end[1], bulb * .36, 0, TAU); g.fill(); }
    g.restore();
  };
  const taper = (from, to) => (t) => from + (to - from) * t;

  // 眉形アーチ（太帯 + 上の細帯）と丸アーチ
  emboss(upperArch.map(([x, y]) => [x, y - 52]), () => 13);
  emboss(upperArch, () => 44);
  emboss(lowerArch, () => 46);

  // 鏡板の唐草（合わせ目のフルール・大きなC字・外へ伸びる葉先）
  emboss(U([[.06, .335], [.11, .365], [.165, .41], [.185, .468]]),
    (t) => 5 + 36 * Math.sin(Math.PI * Math.min(1, t * 1.04)) ** .9);
  emboss(U([[.53, .328], [.70, .345], [.84, .372], [.925, .41]]), taper(22, 3));
  emboss(U([[.045, .318], [.2, .297], [.38, .302], [.53, .328], [.605, .372], [.565, .418],
    [.45, .432], [.36, .41], [.345, .377], [.405, .36], [.455, .378]]), taper(31, 12), 13);
  // 丸アーチの肩から立ち上がる渦と、裾の隅の小さな渦
  emboss(U([[.60, .645], [.74, .57], [.87, .515], [.915, .468], [.86, .44], [.775, .455],
    [.765, .49], [.815, .50]]), taper(27, 10), 11);
  emboss(U([[.93, .655], [.875, .70], [.85, .76], [.875, .805], [.915, .80], [.925, .765],
    [.895, .75]]), taper(17, 8), 8);

  // 框と裾の帯
  const bar = (x, y, w, h) => {
    g.fillStyle = pal.lo; g.fillRect(x + 2, y + 2.5, w, h);
    g.fillStyle = metal; g.fillRect(x, y, w, h);
    g.fillStyle = pal.hi; g.globalAlpha = .85;
    if (w > h) g.fillRect(x, y + h * .12, w, Math.max(1.5, h * .16));
    else g.fillRect(x + w * .14, y, Math.max(1.5, w * .18), h);
    g.globalAlpha = 1;
  };
  bar(0, H * .84, W, H * .034);            // 裾の太帯
  bar(0, 0, W * .71, H * .018);            // 上框
  bar(0, H - 26, W, 26);                   // 下框
  bar(0, 0, 15, H);                        // 合わせ目の框
  bar(W - 17, H * .105, 17, H);            // 外框
  emboss([[W * .70, H * .009], [W - 8, H * .108]], () => 20);   // 外上の面取り
  g.restore();
}

// ---------- 番号プレート: 黄色地に縦長の濃茶ゴシック数字 ----------
export function paintGatePlate(g, w, h, num) {
  g.clearRect(0, 0, w, h);
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#ffe352'); base.addColorStop(.6, '#f6c521'); base.addColorStop(1, '#dfa312');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#a97812'; g.lineWidth = w * .05;
  g.strokeRect(w * .025, w * .025, w * .95, h - w * .05);
  g.strokeStyle = 'rgba(255,251,205,.75)'; g.lineWidth = w * .016;
  g.strokeRect(w * .075, w * .075, w * .85, h - w * .15);
  g.save();
  g.translate(w / 2, h * .535);
  g.scale(num >= 10 ? .66 : .78, 1);       // 太字を横に詰めて原作の縦長数字に寄せる
  g.font = `700 ${Math.round(h * .8)}px "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#3a2609'; g.strokeStyle = '#3a2609';
  g.lineWidth = h * .035; g.lineJoin = 'round';
  g.strokeText(String(num), 0, 0);
  g.fillText(String(num), 0, 0);
  g.restore();
}

// ---------- ゲート頂部の鋳鉄飾り（右へ巻く波形スクロール。左右反転して並べる） ----------
export function paintCrestScroll(g, w, h) {
  g.clearRect(0, 0, w, h);
  const S = (pts, n = 14) => spline(pts.map(([u, v]) => [u * w, v * h]), n);
  const dark = '#0d3d30', mid = '#1b6a4e', lite = '#3d9a70', rim = '#86d6ab';
  const stroke = (pts, width, bulb = 0) => {
    const m = widest(width), end = pts[pts.length - 1];
    const dot = (r, color, dx = 0, dy = 0) => {
      if (!bulb) return;
      g.fillStyle = color; g.beginPath(); g.arc(end[0] + dx, end[1] + dy, r, 0, TAU); g.fill();
    };
    ribbonPath(g, pts, (t) => width(t) + 8); g.fillStyle = dark; g.fill(); dot(bulb + 4, dark);
    ribbonPath(g, pts, width); g.fillStyle = mid; g.fill(); dot(bulb, mid);
    g.save(); g.translate(-m * .1, -m * .13);
    ribbonPath(g, pts, (t) => width(t) * .44); g.fillStyle = lite; g.fill();
    g.restore();
    dot(bulb * .5, lite, -bulb * .2, -bulb * .25);
    g.save(); g.globalAlpha = .85; g.translate(-m * .2, -m * .26);
    ribbonPath(g, pts, (t) => width(t) * .1); g.fillStyle = rim; g.fill();
    g.restore();
  };
  // 奥の葉から順に重ねる
  stroke(S([[.20, .80], [.40, .87], [.56, .79], [.62, .67]]), (t) => 32 * (1 - t) + 5);
  stroke(S([[.34, .53], [.25, .38], [.27, .21], [.39, .12]]), (t) => 36 * (1 - t * .92) + 3);
  stroke(S([[0, 1.02], [.17, .82], [.33, .52], [.52, .24], [.74, .13], [.92, .27], [.95, .50],
    [.81, .65], [.65, .59], [.615, .43], [.70, .35], [.79, .40]]), (t) => 60 - 42 * t, 17);
}

// ---------- 中央エンブレム: 白い翼 + 金の月桂樹 + 星入りの蹄鉄 ----------
export function paintGateEmblem(g, w, h) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * .56;
  const leaf = (x, y, angle, length, width, fill, edge) => {
    g.save(); g.translate(x, y); g.rotate(angle);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(width, -length * .45, 0, -length);
    g.quadraticCurveTo(-width, -length * .45, 0, 0);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = edge; g.lineWidth = 2.5; g.stroke();
    g.restore();
  };
  const gold = g.createLinearGradient(0, h * .15, 0, h * .95);
  gold.addColorStop(0, '#fff3a0'); gold.addColorStop(.5, '#f6c531'); gold.addColorStop(1, '#c98a0c');
  for (const side of [-1, 1]) {
    // 翼（外へ開く白い羽根）
    for (let i = 0; i < 6; i++) {
      leaf(cx + side * (w * .15 + i * w * .034), cy + h * .02 - i * h * .028,
        side * (1.0 + i * .13), h * (.42 - i * .035), w * .034, '#fffdf3', '#c9b98f');
    }
    // 月桂樹（真下から外上へ弧を描く枝。葉は枝の接線に沿わせて内外へ開く）
    for (let i = 0; i < 8; i++) {
      const theta = .2 + i * .3, radius = h * .37;
      const x = cx + side * radius * Math.sin(theta), y = cy + radius * Math.cos(theta);
      const along = side * (Math.PI / 2 - theta);
      leaf(x, y, along + side * .55, h * .17, w * .024, gold, '#8b5c0b');
      leaf(x, y, along - side * .5, h * .15, w * .022, gold, '#8b5c0b');
    }
  }
  // 蹄鉄
  const r = h * .215;
  g.lineCap = 'round';
  g.strokeStyle = '#7d5108'; g.lineWidth = h * .135;
  g.beginPath(); g.arc(cx, cy, r, Math.PI * .8, Math.PI * .2); g.stroke();
  g.strokeStyle = gold; g.lineWidth = h * .105;
  g.beginPath(); g.arc(cx, cy, r, Math.PI * .8, Math.PI * .2); g.stroke();
  g.strokeStyle = 'rgba(255,252,214,.85)'; g.lineWidth = h * .022;
  g.beginPath(); g.arc(cx, cy, r + h * .03, Math.PI * .95, Math.PI * 1.75); g.stroke();
  g.fillStyle = '#8a5a0a';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (.86 + i * .215);
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, h * .013, 0, TAU); g.fill();
  }
  // 緑の地に金の星
  g.fillStyle = '#1c6a49'; g.beginPath(); g.arc(cx, cy, r * .62, 0, TAU); g.fill();
  g.strokeStyle = '#0f4530'; g.lineWidth = 3; g.stroke();
  g.fillStyle = gold; g.strokeStyle = '#8b5c0b'; g.lineWidth = 2.5; g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = r * (i % 2 ? .2 : .47);
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill(); g.stroke();
}

// ---------- 空（縦グラデーションのみ。雲は別のビルボードで置く） ----------
export function paintSky(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  // 球の上半分(0–.5)が空。地平線付近は白くかすませる
  sky.addColorStop(0, '#1463d4'); sky.addColorStop(.2, '#2484ec');
  sky.addColorStop(.36, '#49a8f6'); sky.addColorStop(.455, '#8fd4fb');
  sky.addColorStop(.495, '#d8f1ff'); sky.addColorStop(.52, '#eef9ff'); sky.addColorStop(1, '#eef9ff');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
}

// アニメ調の積雲: 青みのある影色の塊に、白い上面を左上へずらして重ねる
export function paintCloud(g, w, h, seed = 1) {
  const random = rng(seed);
  g.clearRect(0, 0, w, h);
  const base = h * .74;
  const blobs = [];
  const count = 9 + Math.floor(random() * 5);
  for (let i = 0; i < count; i++) {
    const u = (i + .5) / count + (random() - .5) * .08;
    const hump = Math.sin(Math.PI * u) ** .7;
    const radius = h * (.12 + .2 * hump * (.6 + random() * .6));
    blobs.push({ x: w * (.14 + u * .72), y: base - radius * (.5 + random() * .5), r: radius });
  }
  for (let i = 0; i < 5; i++) {
    const b = blobs[2 + Math.floor(random() * (count - 4))];
    blobs.push({ x: b.x + (random() - .5) * b.r, y: b.y - b.r * (.5 + random() * .4), r: b.r * (.5 + random() * .25) });
  }
  // 上端で切れないよう、塊全体をキャンバス内へ収める
  const top = Math.min(...blobs.map((b) => b.y - b.r));
  const fit = Math.min(1, (base - h * .07) / (base - top));
  for (const b of blobs) { b.y = base - (base - b.y) * fit; b.r *= fit; }
  const layer = (dx, dy, scale, fill) => {
    g.fillStyle = fill; g.beginPath();
    for (const b of blobs) { g.moveTo(b.x + dx + b.r * scale, b.y + dy); g.arc(b.x + dx, b.y + dy, b.r * scale, 0, TAU); }
    g.fill();
  };
  g.save();
  g.beginPath(); g.rect(0, 0, w, base + h * .03); g.clip();
  layer(0, 0, 1, '#ffffff');
  // 下半分に青みの影色を重ね、こぶの下側には三日月形の陰を入れる
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, base - h * .42, 0, base);
  shade.addColorStop(0, 'rgba(150,196,236,0)'); shade.addColorStop(.55, 'rgba(150,196,236,.55)');
  shade.addColorStop(1, 'rgba(118,170,222,.9)');
  g.fillStyle = shade; g.fillRect(0, 0, w, h);
  for (const b of blobs) {
    const crescent = g.createRadialGradient(b.x - b.r * .25, b.y - b.r * .35, b.r * .62, b.x, b.y, b.r * 1.02);
    crescent.addColorStop(0, 'rgba(160,202,238,0)'); crescent.addColorStop(1, 'rgba(160,202,238,.5)');
    g.fillStyle = crescent; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // 横へ流れる筋雲
  for (let i = 0; i < 7; i++) {
    const y = base - h * (.02 + random() * .3), x = w * (.12 + random() * .76);
    g.fillStyle = `rgba(255,255,255,${.5 + random() * .4})`;
    g.beginPath(); g.ellipse(x, y, w * (.1 + random() * .16), h * (.018 + random() * .03), 0, 0, TAU); g.fill();
  }
  // 底辺と左右端を溶かす
  g.globalCompositeOperation = 'destination-out';
  const bottom = g.createLinearGradient(0, base - h * .12, 0, base + h * .03);
  bottom.addColorStop(0, 'rgba(0,0,0,0)'); bottom.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = bottom; g.fillRect(0, base - h * .12, w, h * .3);
  for (const [from, to] of [[0, w * .1], [w, w * .9]]) {
    const side = g.createLinearGradient(from, 0, to, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = side; g.fillRect(Math.min(from, to), 0, w * .1, h);
  }
  g.globalCompositeOperation = 'source-over';
}

// ---------- 芝（明暗の短い葉を全面に散らす。タイル継ぎ目は巻き込んで描く） ----------
export function paintTurf(g, w, h) {
  const random = rng(20270101);
  g.fillStyle = '#3a9832'; g.fillRect(0, 0, w, h);
  // 大きめのむら
  for (let i = 0; i < 90; i++) {
    const x = random() * w, y = random() * h, r = w * (.04 + random() * .09);
    const dark = random() < .5;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, dark ? 'rgba(24,96,34,.22)' : 'rgba(122,206,84,.2)');
      grad.addColorStop(1, 'rgba(60,150,50,0)');
      g.fillStyle = grad; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const colors = ['#5cba46', '#2c852d', '#72cb54', '#257529', '#4aa93c', '#8ad862'];
  g.lineCap = 'round';
  for (let i = 0; i < 15000; i++) {
    const x = random() * w, y = random() * h;
    const length = 7 + random() * 15, lean = (random() - .5) * 7;
    g.strokeStyle = colors[Math.floor(random() * colors.length)];
    g.globalAlpha = .45 + random() * .5;
    g.lineWidth = 1.4 + random() * 1.5;
    for (const oy of y - length < 0 ? [0, h] : [0]) for (const ox of x < 8 ? [0, w] : x > w - 8 ? [0, -w] : [0]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + lean, y + oy - length); g.stroke();
    }
  }
  g.globalAlpha = 1;
}

// 放射状の光条（太陽の光芒・扉からあふれる光・確定時の後光で共用）
export function paintRays(g, w, h, seed = 7, count = 46) {
  const random = rng(seed);
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, radius = Math.min(w, h) / 2;
  for (let i = 0; i < count; i++) {
    const angle = random() * TAU, spread = .012 + random() * .05, reach = radius * (.55 + random() * .45);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, reach);
    const alpha = .12 + random() * .3;
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(.55, `rgba(255,255,255,${alpha * .45})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(cx, cy);
    g.arc(cx, cy, reach, angle - spread, angle + spread);
    g.closePath(); g.fill();
  }
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, radius * .3);
  core.addColorStop(0, 'rgba(255,255,255,.9)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, w, h);
}
