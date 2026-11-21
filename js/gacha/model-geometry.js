import * as THREE from 'three';

// 共有可能な静的形状。扉などのアニメーションは Mesh / Group 側で行う。
const geometries = new Map();
export function sharedGeometry(key, create) {
  if (!geometries.has(key)) geometries.set(key, create());
  return geometries.get(key);
}

// 折り目で頂点を分離し、紙の山と谷に独立した法線を持たせる。
export function fanSectorGeometry(ri, ro, a1, a2, segments, pleat) {
  const positions = [], uvs = [];
  const vertex = (i, outer) => {
    const t = i / segments;
    const a = a1 + (a2 - a1) * t;
    const r = outer ? ro : ri;
    const z = (i % 2 ? pleat : -pleat) * (outer ? 1 : ri / ro);
    positions.push(Math.cos(a) * r, Math.sin(a) * r, z);
    uvs.push(1 - t, outer ? 1 : 0);
  };
  for (let i = 0; i < segments; i++) {
    for (const [j, outer] of [[i, false], [i, true], [i + 1, false],
      [i, true], [i + 1, true], [i + 1, false]]) vertex(j, outer);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// 円柱を任意の2点に架ける。斜材にも同じ断面と適正な長さを使う。
export function rodBetween(start, end, radius, material, segments = 8) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const geometry = sharedGeometry(`rod:${radius}:${segments}`, () =>
    new THREE.CylinderGeometry(radius, radius, 1, segments));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.scale.y = direction.length();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

// 多数の格子・トラスを1 draw callにまとめる（各扉の子として開閉可能）。
export function instancedRods(rods, radius, material) {
  const geometry = sharedGeometry('unit-rod', () => new THREE.CylinderGeometry(1, 1, 1, 6));
  const mesh = new THREE.InstancedMesh(geometry, material, rods.length);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < rods.length; i++) {
    const a = new THREE.Vector3(...rods[i][0]);
    const b = new THREE.Vector3(...rods[i][1]);
    const direction = b.clone().sub(a);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.scale.set(radius, direction.length(), radius);
    dummy.quaternion.setFromUnitVectors(up, direction.normalize());
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// 呼び出し側が静止部品だけを渡す。個別に動く扉・発光FXには使わない。
export function batchStaticMeshes(group) {
  const batches = new Map();
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh || Array.isArray(child.material) ||
        child.material.transparent || !child.visible) continue;
    const key = `${child.geometry.uuid}:${child.material.uuid}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(child);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    meshes.forEach((mesh, i) => {
      mesh.updateMatrix();
      batch.setMatrixAt(i, mesh.matrix);
      group.remove(mesh);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    group.add(batch);
  }
}
