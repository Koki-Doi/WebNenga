import * as THREE from 'three';

// 参考フレーム118: 頭・胴・上げた腕を分け、接近してもノイズ模様にしない。
// 各段2 draw calls。ローカル+Zを向くので、観客席の回転にも追従する。
export function buildStandAudience(tier) {
  const group = new THREE.Group();
  const silhouette = new THREE.Shape();
  const outline = [[-.10, 0], [-.10, .23], [-.20, .36], [-.23, .52],
    [-.19, .54], [-.15, .39], [-.055, .29], [.055, .29],
    [.15, .39], [.19, .54], [.23, .52], [.20, .36], [.10, .23], [.10, 0]];
  outline.forEach(([x, y], i) => i ? silhouette.lineTo(x, y) : silhouette.moveTo(x, y));
  silhouette.closePath();
  const columns = 320, rows = 12, count = columns * rows;
  const bodies = new THREE.InstancedMesh(new THREE.ShapeGeometry(silhouette),
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), count);
  const heads = new THREE.InstancedMesh(new THREE.CircleGeometry(.075, 7),
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), count);
  const palette = [0xdedbc7, 0x8d9591, 0x5e6886, 0xa84b5b, 0x537c6c, 0x987b65, 0xbca36d];
  const skins = [0xd7ab8d, 0xb78570, 0xe4bea3, 0xa97e65];
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const rise = Math.sin(tier.angle) * tier.depth, run = Math.cos(tier.angle) * tier.depth;
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const i = row * columns + col;
    const t = (row + .45) / rows;
    const variation = ((i * 73 + row * 11) % 101) / 101;
    const x = -106 + col * .665 + (row % 2) * .26;
    const y = tier.baseY + rise * t + .035;
    const z = tier.frontZ - run * t;
    const scale = .83 + variation * .24;
    dummy.position.set(x, y, z);
    dummy.scale.set(scale, scale, 1);
    dummy.rotation.z = (variation - .5) * .12;
    dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, color.setHex(palette[(i * 3 + row) % palette.length]));
    dummy.position.y += .365 * scale;
    dummy.position.z += .014;
    dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, color.setHex(skins[(i + row) % skins.length]));
  }
  for (const mesh of [bodies, heads]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
