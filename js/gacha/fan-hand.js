import * as THREE from 'three';

// 柄は原点から-Y方向。正面(+Z)に親指、裏から回り込む4指で握る。
export function buildFanHand() {
  const hand = new THREE.Group();
  hand.name = 'fan-grip';
  const skin = new THREE.MeshPhongMaterial({ color: 0xf5c7af, shininess: 12, specular: 0x483127 });
  const nail = new THREE.MeshPhongMaterial({ color: 0xf8d8cb, shininess: 24 });
  const cloth = new THREE.MeshPhongMaterial({ color: 0x342344, shininess: 8 });
  const trim = new THREE.MeshPhongMaterial({ color: 0xd95a91, shininess: 16 });
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  function oval(name, position, scale, material = skin) {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale);
    hand.add(mesh); return mesh;
  }
  function sweep(name, points, radii, material = skin, flatten = 1) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const segments = 32, sides = 12, frames = curve.computeFrenetFrames(segments, false);
    const positions = [], indices = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, center = curve.getPointAt(t);
      const ri = t * (radii.length - 1), j = Math.min(radii.length - 2, Math.floor(ri));
      const radius = THREE.MathUtils.lerp(radii[j], radii[j + 1], ri - j);
      for (let k = 0; k <= sides; k++) {
        const a = k / sides * Math.PI * 2;
        const p = center.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius)
          .addScaledVector(frames.binormals[i], Math.sin(a) * radius * flatten);
        positions.push(p.x, p.y, p.z);
        if (i < segments && k < sides) {
          const n = i * (sides + 1) + k;
          indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
        }
      }
    }
    const capStart = positions.length / 3;
    positions.push(...curve.getPointAt(0).toArray(), ...curve.getPointAt(1).toArray());
    for (let k = 0; k < sides; k++) {
      const end = segments * (sides + 1) + k;
      indices.push(capStart, k + 1, k, capStart + 1, end, end + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; hand.add(mesh);
    return mesh;
  }
  const palm = oval('palm', [.070, -.126, -.008], [.055, .072, .031]);
  palm.rotation.z = -.23;
  sweep('wrist', [[.073, -.166, -.01], [.095, -.209, -.015], [.141, -.252, -.021]], [.037, .029, .035]);
  // 中節は正面、末節は柄の左側から裏へ。小指ほど短く細くする。
  for (let i = 0; i < 4; i++) {
    const y = -.060 - i * .032, x = i * .003;
    const radius = .016 - i * .0012;
    sweep(`finger-${i}`, [[.103 - i * .006, y - .006, -.012], [.068, y, .025],
      [.025 + x, y + .001, .034], [-.013 + x, y - .005, .019],
      [-.021 + x, y - .009, -.006], [-.008 + x, y - .011, -.023]],
    [radius * 1.12, radius, radius * .95, radius * .8, .002]);
  }
  // 対立する親指は斜めに添える。根元の母指球から末節まで連続した丸み。
  oval('thenar', [.089, -.111, .022], [.029, .039, .027]).rotation.z = -.35;
  sweep('thumb', [[.100, -.128, .024], [.087, -.092, .051], [.058, -.058, .057],
    [.028, -.040, .048], [.006, -.039, .038]], [.023, .022, .019, .016, .003]);
  const thumbNail = oval('thumbnail', [.024, -.040, .061], [.014, .009, .0025], nail);
  thumbNail.rotation.z = -.22;
  // 袖も厚みのある筒。手首の下へ差し込み、肌との隙間を作らない。
  sweep('sleeve', [[.118, -.230, -.018], [.196, -.300, -.025], [.310, -.382, -.039], [.410, -.454, -.047]],
    [.037, .050, .071, .080], cloth, .78);
  const cuff = oval('cuff', [.121, -.233, -.017], [.042, .017, .035], cloth);
  cuff.rotation.z = .81;
  const piping = oval('cuff-piping', [.110, -.222, -.016], [.042, .004, .035], trim);
  piping.rotation.z = .81;
  for (const offset of [-.025, .020]) {
    sweep('sleeve-seam', [[.157 + offset, -.262, .015], [.249 + offset, -.337, .021], [.378 + offset, -.428, .015]],
      [.0015, .002, .0015], trim);
  }
  return hand;
}
