// 演出用パーティクル（各1 draw call）: ゲート通過時の光の房 / 疾走のスピード線 / 年賀状のきらめき軌跡
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- ゲート通過時、扉の前にあふれる光の粒（参考 0160–0220） ----------
// 房ごとの強さ(level)を uniform で渡し、頂点シェーダで大きさと明るさへ変換する。
export class GateBursts {
  // gates: [{ x, color: [THREE.Color...] }] / 扉の前面 z と高さ範囲はゲートのローカル座標
  constructor(gates, { perGate = 28, z = .66, yMin = .55, yMax = 2.5, halfWidth = .62 } = {}) {
    const count = gates.length * perGate;
    const position = new Float32Array(count * 3), color = new Float32Array(count * 3);
    const size = new Float32Array(count), gate = new Float32Array(count), phase = new Float32Array(count);
    gates.forEach((def, gi) => {
      for (let k = 0; k < perGate; k++) {
        const i = gi * perGate + k;
        const small = k >= perGate * .55;          // 後半は小さく鋭いきらめき
        position[i * 3] = def.x + rand(-halfWidth, halfWidth);
        position[i * 3 + 1] = rand(yMin, yMax);
        position[i * 3 + 2] = z + rand(0, .32);
        size[i] = small ? rand(.07, .2) : rand(.42, 1.15);
        gate[i] = gi;
        phase[i] = Math.random();
        const c = def.colors[Math.floor(Math.random() * def.colors.length)];
        const gain = small ? 2.4 : 1.25;           // HDR値でブルームに乗せる
        color[i * 3] = c.r * gain; color[i * 3 + 1] = c.g * gain; color[i * 3 + 2] = c.b * gain;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aGate', new THREE.BufferAttribute(gate, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.levels = new Array(gates.length).fill(0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: this.levels }, uTime: { value: 0 }, uPx: { value: 800 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aGate; attribute float aPhase;
        uniform float uLevel[${gates.length}]; uniform float uTime; uniform float uPx;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float level = uLevel[int(aGate + .5)];
          float grow = clamp(level * 1.7 - aPhase * .7, 0., 1.);
          grow = grow * grow * (3. - 2. * grow);
          vec3 p = position;
          p.y += grow * aPhase * .22;
          p.x += sin(uTime * 3. + aPhase * 40.) * .03;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (.3 + .7 * grow) * uPx / max(.1, -mv.z);
          vColor = aColor;
          vAlpha = grow * (.74 + .26 * sin(uTime * 9. + aPhase * 57.));
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - .5) * 2.;
          float soft = pow(max(0., 1. - d), 1.7);
          float core = smoothstep(.34, 0., d);
          float a = (soft * .5 + core * .55) * vAlpha;
          if (a < .004) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
  }
  // target: 房ごとの瞬間値(0–1)。立ち上がりは即時、消え際は余韻を残す
  update(dt, t, target) {
    let any = false;
    for (let i = 0; i < this.levels.length; i++) {
      const goal = target ? target(i) : 0;
      this.levels[i] = Math.max(goal, this.levels[i] - dt * 2.6);
      if (this.levels[i] > .002) any = true;
    }
    this.material.uniforms.uTime.value = t;
    this.points.visible = any;
  }
  reset() { this.levels.fill(0); this.points.visible = false; }
}

// ---------- 疾走のスピード線（カメラ空間。消失点へ収束する細い光の筋） ----------
export class SpeedStreaks {
  constructor(texture, count = 56) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);                 // 長さ方向をZへ寝かせる
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({
      map: texture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.items = Array.from({ length: count }, () => ({
      angle: rand(0, Math.PI * 2), radius: rand(.9, 3.4), z: rand(-34, -1),
      length: rand(2.5, 7), width: rand(.012, .035), speed: rand(.7, 1.3),
    }));
    this.dummy = new THREE.Object3D();
  }
  // strength: 0–1（不透明度）, speed: カメラ空間で奥へ流れる速さ(u/s)
  update(dt, strength, speed = 30) {
    const visible = strength > .01;
    this.mesh.visible = visible;
    if (!visible) return;
    this.mesh.material.opacity = strength * .5;
    const { dummy } = this;
    this.items.forEach((it, i) => {
      it.z -= speed * it.speed * dt;
      if (it.z < -36) { it.z += 35; it.angle = rand(0, Math.PI * 2); }
      dummy.position.set(Math.cos(it.angle) * it.radius, Math.sin(it.angle) * it.radius, it.z);
      dummy.rotation.set(0, 0, it.angle - Math.PI / 2);   // 面の法線を視軸側へ向ける
      dummy.scale.set(it.width, 1, it.length);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- 年賀状の後ろへこぼれるきらめき ----------
export class SparkTrail {
  constructor(texture, count = 90, size = .2) {
    this.count = count;
    this.position = new Float32Array(count * 3);
    this.color = new Float32Array(count * 3);
    this.items = Array.from({ length: count }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, tint: 0 }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: texture, size, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.next = 0;
    this.carry = 0;
    this.palette = [[1.5, 1.3, .7], [1.5, 1.5, 1.4], [1.5, .9, 1.25], [.8, 1.4, 1.5]];
  }
  // origin から毎秒 rate 個を放出する。spread は発生位置のばらつき（カードの大きさ）
  emit(dt, origin, rate = 40, spread = { x: .45, y: .7 }) {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const it = this.items[i];
      it.max = it.life = rand(.3, .62);
      it.vx = rand(-.25, .25); it.vy = rand(-.15, .5); it.vz = rand(-.2, .2);
      it.tint = Math.floor(Math.random() * this.palette.length);
      this.position[i * 3] = origin.x + rand(-spread.x, spread.x);
      this.position[i * 3 + 1] = origin.y + rand(-spread.y, spread.y);
      this.position[i * 3 + 2] = origin.z + rand(-.05, .05);
    }
  }
  update(dt) {
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      if (it.life <= 0) { this.color[i * 3] = this.color[i * 3 + 1] = this.color[i * 3 + 2] = 0; continue; }
      alive = true;
      it.life -= dt;
      this.position[i * 3] += it.vx * dt;
      this.position[i * 3 + 1] += it.vy * dt;
      this.position[i * 3 + 2] += it.vz * dt;
      const k = Math.max(0, it.life / it.max);
      const fade = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** .8;   // ふわっと現れて消える
      const tint = this.palette[it.tint];
      this.color[i * 3] = tint[0] * fade; this.color[i * 3 + 1] = tint[1] * fade; this.color[i * 3 + 2] = tint[2] * fade;
    }
    this.points.visible = alive;
    if (!alive) return;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
  clear() {
    for (const it of this.items) it.life = 0;
    this.color.fill(0);
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.visible = false;
  }
}
