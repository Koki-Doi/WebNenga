import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { W, initWorld, setEnv, resetFx, setStartLamp, setGateCenterFlash, buildFan3D, buildHagaki } from './gacha-world.js';
import { GACHA, state } from './gacha-state.js';
import { corridorChase } from './corridor-camera.js';
import { crowdCamera, courseCamera, gateWideCamera, gatePassCamera, sampleRaceSequence, RACE_SEQUENCE_DURATION } from './race-layout.js';

const canvas = document.getElementById('model-canvas');
const status = document.getElementById('model-status');
const opening = document.getElementById('opening');
const scenes = {
  fan: { number: '01', title: '迎春の扇', description: '折り目、親骨、要。光と角度で確かめる。', eye: [0, .12, 1.6], target: [0, .09, 0] },
  corridor: { number: '02', title: '迎賓の扉', description: '赤茶の鏡板と真鍮の取っ手。あたたかな光の廊下。', eye: [0, 2.7, -5], target: [0, 2.5, -13] },
  race: { number: '03', title: 'スタートゲート', description: '緑の鋳鉄、銀の格子。ゲートの向こうには青空。', camera: gateWideCamera, progress: 1 },
  crowd: { number: '04', title: 'スタンドの歓声', description: '観客席を正面から。右へ流れ、終わり際に走路へ振り向きはじめる。', camera: crowdCamera, progress: .5 },
  course: { number: '05', title: '空へひらくコース', description: '観客席から振り向いて、芝と空へ。視点のつながりを確認。', camera: courseCamera, progress: 1 },
  sequence: { number: '07', title: 'カメラと白い光', description: '観客席 → 旋回・加速 → 白光 → ゲート全景。実際の速度で再生。', camera: (p) => sampleRaceSequence(p * RACE_SEQUENCE_DURATION), progress: 0 },
  card: { number: '06', title: '一枚の年賀状', description: '表から裏へ。想いを届ける、一枚の紙。', eye: [.35, .25, 2.6], target: [0, 0, 0] },
  dash: { number: '08', title: '扉へ向かう年賀状', description: 'カメラは追い越さず、年賀状が先に扉へ。距離と速度を確認。', camera: (p) => corridorChase(p).camera, progress: .35 },
  gatePan: { number: '09', title: 'ゲートを横切る視線', description: '1番から10番まで、房の装飾と番号を追う。', camera: gatePassCamera, progress: .5 },
  lamp: { number: '10', title: '発走灯', description: '消灯から赤点灯へ。支柱とゲートの位置関係も確認。', camera: () => {
    const L = W.lampPos;
    return { px: L.x + .85, py: L.y - 1.45, pz: L.z + 2.9,
      lx: L.x - .1, ly: L.y + .12, lz: L.z - .4, fov: 40, roll: 0 };
  }, progress: 0 },
};

try {
  initWorld(canvas);
  // 専用プレビューは実際のカードや共有URLを読み込まず、サンプルだけを表示。
  await Promise.all([buildFan3D(), buildHagaki(GACHA.card)]);
  W.bloomPass.enabled = false;
  W.gradePass.enabled = false;
  const controls = new OrbitControls(W.camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = .4;
  controls.maxDistance = 40;
  let current = 'fan';
  let playbackStart = null;
  const originalWireframes = new Map();
  W.scene.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material && 'wireframe' in material) originalWireframes.set(material, material.wireframe);
    }
  });
  function resize() {
    const { width, height } = canvas.parentElement.getBoundingClientRect();
    const portrait = document.getElementById('portrait').checked;
    const sw = portrait ? Math.min(width, height * 9 / 16) : width;
    const sh = portrait ? sw * 16 / 9 : height;
    canvas.style.width = `${sw}px`;
    canvas.style.height = `${sh}px`;
    canvas.style.left = `${(width - sw) / 2}px`;
    canvas.style.top = `${(height - sh) / 2}px`;
    W.renderer.setSize(sw, sh, false);
    W.composer.setSize(sw, sh);
    W.camera.aspect = sw / sh;
    W.camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  // initWorld の縦長ステージ用 resize 後にプレビューのアスペクトへ戻す。
  window.addEventListener('resize', resize);
  function resetView() {
    if (scenes[current].camera) {
      const progress = Number(document.getElementById('travel').value) / 100;
      const cs = scenes[current].camera(progress);
      if (current === 'sequence') {
        const atCrowd = cs.shot === '観客席';
        W.amb.intensity = atCrowd ? .82 : .68;
        W.amb.color.set(atCrowd ? 0xe7f2ff : 0xffffff);
        W.key.intensity = atCrowd ? 1.08 : 1.05;
      }
      if (current === 'dash') {
        const chase = corridorChase(progress);
        W.hagaki.position.set(chase.cardX, 1.62, chase.cardZ);
      }
      if (current === 'lamp') setStartLamp(progress >= .5);
      if (current === 'gatePan') setGateCenterFlash(progress, performance.now() / 1000);
      // 本編と同じ: 画面全体の白(whiteout)と、空だけの白(skyWhite)
      W.whiteoutPass.enabled = (cs.whiteout ?? 0) > 0 || (cs.skyWhite ?? 0) > 0;
      W.whiteoutPass.uniforms.amount.value = 0;
      W.whiteoutPass.uniforms.flatAmount.value = cs.whiteout ?? 0;
      W.whiteoutPass.uniforms.sky.value = cs.skyWhite ?? 0;
      W.camera.position.set(cs.px, cs.py, cs.pz);
      W.camera.fov = cs.fov;
      W.camera.updateProjectionMatrix();
      controls.target.set(cs.lx, cs.ly, cs.lz);
      controls.update();
      return;
    }
    W.camera.fov = 50;
    W.camera.updateProjectionMatrix();
    controls.target.set(...scenes[current].target);
    const offset = new THREE.Vector3(...scenes[current].eye).sub(controls.target);
    if (!scenes[current].fixed) offset.multiplyScalar(Math.max(1, .85 / W.camera.aspect));
    W.camera.position.copy(controls.target).add(offset);
    controls.update();
  }
  function selectScene(name) {
    current = name;
    playbackStart = null;
    controls.maxDistance = scenes[name].camera ? 150 : 40;
    controls.enableDamping = !scenes[name].camera;
    document.getElementById('play-sequence').hidden = name !== 'sequence';
    document.getElementById('play-sequence').textContent = '演出を再生 ▶';
    resetFx();
    setEnv(name === 'fan' || name === 'card' ? 'reveal' : name === 'corridor' || name === 'dash' ? 'corridor' : 'race');
    W.gatesG.visible = true;
    W.raceRails.visible = name !== 'gatePan' && name !== 'lamp';
    W.revealG.visible = false;
    W.scene.background = new THREE.Color(name === 'corridor' || name === 'dash' ? 0x684334 : 0xe7ece5);
    W.fan3d.visible = name === 'fan';
    W.hagaki.visible = name === 'card' || name === 'dash';
    W.bloomPass.enabled = name === 'sequence' || name === 'gatePan';
    W.gradePass.enabled = name === 'sequence' || name === 'gatePan';
    if (name === 'sequence' || name === 'gatePan') {
      W.confetti.place(name === 'gatePan' ? { x: 0, y: 7, z: -2 } : { x: 2, y: 8, z: 45 },
        name === 'gatePan' ? { x: 16, y: 5, z: 6 } : { x: 20, y: 6, z: 40 });
      W.confetti.set(true);
      W.sparkles.set(true);
      for (const penlight of W.penlights) penlight.set(true);
    }
    if (name === 'fan' || name === 'card') {
      W.key.position.set(-2, 3, 4); W.key.intensity = 1.2;
      W.amb.intensity = .85;
    }
    document.getElementById('scene-title').textContent = scenes[name].title;
    document.getElementById('scene-number').textContent = `${scenes[name].number} / 10`;
    document.getElementById('scene-description').textContent = scenes[name].description;
    for (const button of document.querySelectorAll('[data-scene]')) {
      button.setAttribute('aria-pressed', String(button.dataset.scene === name));
    }
    opening.disabled = name !== 'corridor' && name !== 'race';
    opening.value = 0;
    document.getElementById('opening-value').textContent = '0%';
    document.getElementById('travel-controls').hidden = !scenes[name].camera;
    document.getElementById('travel').value = (scenes[name].progress ?? 1) * 100;
    document.getElementById('travel-value').textContent = `${document.getElementById('travel').value}%`;
    resetView();
  }
  for (const button of document.querySelectorAll('[data-scene]')) {
    button.addEventListener('click', () => selectScene(button.dataset.scene));
  }
  opening.addEventListener('input', () => {
    const angle = Number(opening.value) / 100 * Math.PI * .48;
    const doors = current === 'corridor' ? [[W.doorL, W.doorR]] : W.gateObjs.map((g) => g.doors);
    for (const [left, right] of doors) { left.rotation.y = -angle; right.rotation.y = angle; }
    document.getElementById('opening-value').textContent = `${opening.value}%`;
  });
  document.getElementById('wireframe').addEventListener('change', (event) => {
    for (const [material, original] of originalWireframes) material.wireframe = event.target.checked || original;
  });
  document.getElementById('reset-view').addEventListener('click', resetView);
  document.getElementById('portrait').addEventListener('change', () => { resize(); resetView(); });
  document.getElementById('play-sequence').addEventListener('click', () => {
    playbackStart = performance.now();
    document.getElementById('play-sequence').textContent = '最初から再生 ↺';
  });
  document.getElementById('travel').addEventListener('input', (event) => {
    playbackStart = null;
    document.getElementById('travel-value').textContent = `${event.target.value}%`;
    resetView();
  });
  resize();
  selectScene('fan');
  let frames = 0;
  W.renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    if (playbackStart !== null) {
      const progress = Math.min(1, (performance.now() - playbackStart) / (RACE_SEQUENCE_DURATION * 1000));
      document.getElementById('travel').value = progress * 100;
      document.getElementById('travel-value').textContent = `${Math.round(progress * 100)}%`;
      resetView();
      if (progress === 1) playbackStart = null;
    }
    controls.update();
    if (current === 'sequence' || current === 'gatePan') {
      const now = performance.now() / 1000;
      W.confetti.update(1 / 60, now);
      W.sparkles.update(1 / 60, now);
      for (const penlight of W.penlights) penlight.update(1 / 60, now);
    }
    if (current === 'gatePan') {
      // 房が中央へ来たときの光の粒（本編は updateWorldFx が描く）
      W.gateBursts.material.uniforms.uPx.value = canvas.height / (2 * Math.tan(W.camera.fov * Math.PI / 360));
      W.gateBursts.update(1 / 60, performance.now() / 1000, state.burst);
    }
    if (current === 'sequence' || current === 'gatePan') W.composer.render();
    else W.renderer.render(W.scene, W.camera);
    if (++frames % 30 === 1) {
      const { calls, triangles } = W.renderer.info.render;
      const seconds = Number(document.getElementById('travel').value) / 100 * RACE_SEQUENCE_DURATION;
      status.textContent = current === 'sequence'
        ? `${sampleRaceSequence(seconds).shot} · ${seconds.toFixed(2)} / ${RACE_SEQUENCE_DURATION.toFixed(2)}秒`
        : `表示中: ${calls.toLocaleString()} draw calls / ${triangles.toLocaleString()} triangles`;
    }
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    W.renderer.setAnimationLoop(null);
    status.textContent = '描画が中断しました。ページを再読み込みしてください。';
  });
} catch (error) {
  console.error('[model-preview]', error);
  status.textContent = 'モデルを読み込めませんでした。ネット接続とWebGL対応をご確認のうえ、再読み込みしてください。';
}
