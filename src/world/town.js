// 灰盒小镇:主街 + 海滨步道 + 广场 + 沙滩 + 灯塔
// 建筑只是体量/色彩/天际线占位,正式版将全部替换为手搓 GLB
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function addColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + '|' + (opts.rough ?? 0.85) + '|' + (opts.metal ?? 0);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0,
    }));
  }
  return matCache.get(key);
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  return m;
}

function groundPlane(w, d, color, x, y, z, rough = 0.95) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { rough }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

const PALETTE = [0xf2ead8, 0xe8dcc4, 0xf5f2ea, 0xe3d0b8, 0xd9c6a5, 0xead9c2, 0xdde3dd, 0xf0d9c8];
const ROOFS = [0xb4634a, 0xa8573f, 0xc06b4e];
const AWNINGS = [0xc9563c, 0x3e7f86, 0xd9a441, 0x77916b, 0xb45f7a];

function building(r, side, cx, cz, w, d, h, colliders, g) {
  g.add(box(w, h, d, PALETTE[(r() * PALETTE.length) | 0], cx, h / 2, cz));
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  if (r() < 0.6) g.add(box(w + 0.6, 1.0, d + 0.6, ROOFS[(r() * 3) | 0], cx, h + 0.5, cz));
  else g.add(box(w + 0.3, 0.5, d + 0.3, 0xcfc8bb, cx, h + 0.25, cz));
  // 首层店面(深色玻璃)
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 2.6), mat(0x2c3f4c, { rough: 0.25, metal: 0.4 }));
  sf.position.set(side * 9.95, 1.5, cz);
  sf.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  g.add(sf);
  // 招牌条
  g.add(box(0.14, 0.55, w - 3, AWNINGS[(r() * AWNINGS.length) | 0], side * 9.9, 3.55, cz, { cast: false }));
  // 雨棚
  if (r() < 0.65) {
    const aw = box(1.1, 0.08, w - 2.4, AWNINGS[(r() * AWNINGS.length) | 0], side * 9.55, 3.0, cz);
    aw.rotation.z = side * 0.35;
    g.add(aw);
  }
  // 上层窗带
  const floors = Math.floor((h - 4.2) / 2.9);
  for (let f = 0; f < floors; f++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w - 3.2, 1.15), mat(0x33434f, { rough: 0.3, metal: 0.3 }));
    win.position.set(side * 9.96, 4.4 + f * 2.9, cz);
    win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(win);
  }
}

function buildPalmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 5.6, 7);
  trunk.translate(0, 2.8, 0);
  const leaves = [];
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.PlaneGeometry(0.6, 3.4, 1, 4);
    const pos = leaf.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y0 = pos.getY(v) + 1.7;
      const tt = y0 / 3.4;
      pos.setZ(v, -(tt * tt) * 1.6);
      pos.setX(v, pos.getX(v) * (1 - tt * 0.6));
    }
    leaf.computeVertexNormals();
    leaf.translate(0, 1.7, 0);
    leaf.rotateX(-Math.PI / 2 + 0.45);
    leaf.rotateY((i / 8) * Math.PI * 2 + 0.2);
    leaf.translate(0, 5.5, 0);
    leaves.push(leaf);
  }
  return { trunk, leaves: mergeGeometries(leaves) };
}

export function createTown() {
  const g = new THREE.Group();
  const colliders = [];
  const r = rng(20260830);

  // ---- 地面分区 ----
  g.add(groundPlane(1000, 470, 0xe3dbc6, 50, -0.05, -170));           // 小镇基底(暖白)
  g.add(groundPlane(14, 270, 0x585b60, 0, 0.01, -90.5));               // 车行道
  // 中央绿化岛(实体盒,排查平面+渐变串色)
  g.add(box(1.7, 0.1, 266, 0x5f9e58, 0, 0.02, -91, { cast: false }));
  g.add(groundPlane(3, 268, 0xc9c2b3, -8.5, 0.02, -90));               // 左人行道
  g.add(groundPlane(3, 268, 0xc9c2b3, 8.5, 0.02, -90));                // 右人行道
  g.add(groundPlane(216, 8, 0xd9d2c0, 50, 0.015, 48));                 // 海滨步道
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 40), mat(0xe0d8c4, { rough: 0.95 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.025, 48); plaza.receiveShadow = true;
  g.add(plaza);                                                        // 圆形广场
  g.add(groundPlane(500, 7, 0xead9a8, 50, 0.0, 55, 1.0));              // 沙滩

  // 斑马线(街口)
  for (let i = 0; i < 6; i++) g.add(box(0.9, 0.02, 2.4, 0xe8e8e4, -5 + i * 2, 0.03, 38, { cast: false }));

  // ---- 主街两侧建筑(灰盒体量) ----
  for (const side of [-1, 1]) {
    let z = -206;
    while (z < 24) {
      const w = 11 + r() * 4, d = 10 + r() * 5, h = 7 + r() * 9;
      building(r, side, side * (10 + w / 2), z + d / 2, w, d, h, colliders, g);
      z += d + 2 + r() * 4;
    }
  }
  // 第二排(更稀疏更高,做纵深)
  for (const side of [-1, 1]) {
    let z = -196;
    while (z < 10) {
      const w = 12 + r() * 5, d = 11 + r() * 5, h = 10 + r() * 12;
      const cx = side * (27 + w / 2);
      g.add(box(w, h, d, PALETTE[(r() * PALETTE.length) | 0], cx, h / 2, z + d / 2));
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: z, maxZ: z + d });
      g.add(box(w + 0.4, 0.8, d + 0.4, ROOFS[(r() * 3) | 0], cx, h + 0.4, z + d / 2));
      z += d + 6 + r() * 8;
    }
  }
  // 远景 CBD(雾中天际线)
  for (let i = 0; i < 9; i++) {
    const h = 32 + r() * 34;
    g.add(box(16 + r() * 14, h, 16 + r() * 10, 0xa9bdc9, -90 + i * 24 + r() * 8, h / 2, -295 - r() * 30, { rough: 0.7 }));
  }

  // ---- 防波堤 + 灯塔 ----
  g.add(box(38, 2.6, 7, 0x9a9788, 140, -0.5, 64, { rough: 1.0 }));
  const lh = new THREE.Group();
  lh.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2, 12), mat(0x8f8b7c, { rough: 1 })));
  lh.children[0].position.y = 1; lh.children[0].castShadow = true;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.8, 10, 12), mat(0xf4f1e6, { rough: 0.8 }));
  tower.position.y = 7; tower.castShadow = true; lh.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 1.6, 12), mat(0xc9563c, { rough: 0.8 }));
  band.position.y = 9.5; lh.add(band);
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xfff3cf }));
  lampRoom.position.y = 12.9; lh.add(lampRoom);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.2, 10), mat(0xc9563c, { rough: 0.7 }));
  cap.position.y = 14.3; cap.castShadow = true; lh.add(cap);
  lh.position.set(150, 0.8, 64);
  g.add(lh);

  // ---- 步道栏杆(广场缺口可下沙滩) ----
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6);
  const postMat = mat(0xe8e8e4, { rough: 0.5, metal: 0.3 });
  const railSpans = [[-58, -16], [16, 158]];
  let postCount = 0;
  for (const [a, b] of railSpans) postCount += Math.floor((b - a) / 3) + 1;
  const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
  const dummy = new THREE.Object3D();
  let pi = 0;
  for (const [a, b] of railSpans) {
    for (let x = a; x <= b; x += 3) { dummy.position.set(x, 0.55, 51.9); dummy.updateMatrix(); posts.setMatrixAt(pi++, dummy.matrix); }
    g.add(box(b - a, 0.06, 0.06, 0xe8e8e4, (a + b) / 2, 1.06, 51.9, { rough: 0.5, metal: 0.3, cast: false }));
    g.add(box(b - a, 0.04, 0.04, 0xe8e8e4, (a + b) / 2, 0.6, 51.9, { rough: 0.5, metal: 0.3, cast: false }));
  }
  posts.castShadow = true;
  g.add(posts);

  // ---- 路灯(杆 + 发光头) ----
  const lampPos = [];
  for (let x = -50; x <= 150; x += 20) lampPos.push([x, 51.0]);
  for (let i = 0; i < 5; i++) { lampPos.push([-9.3, -190 + i * 80]); lampPos.push([9.3, -150 + i * 80]); }
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.09, 3.8, 6);
  poleGeo.translate(0, 1.9, 0);
  const poles = new THREE.InstancedMesh(poleGeo, mat(0x3d4a44, { rough: 0.6, metal: 0.4 }), lampPos.length);
  const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffeec4 }), lampPos.length);
  lampPos.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z); dummy.rotation.y = 0; dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 3.85, z); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  poles.castShadow = true;
  g.add(poles); g.add(heads);

  // ---- 长椅 ----
  for (const bx of [-30, 20, 70, 120]) {
    g.add(box(1.9, 0.09, 0.55, 0x9a6b4f, bx, 0.46, 46, { rough: 0.8 }));
    g.add(box(0.12, 0.42, 0.5, 0x5c5148, bx - 0.75, 0.21, 46));
    g.add(box(0.12, 0.42, 0.5, 0x5c5148, bx + 0.75, 0.21, 46));
  }

  // ---- 棕榈(实例化:普通材质 + 顶点色路径排查) ----
  const { trunk: palmTrunkGeo, leaves: palmLeafGeo } = buildPalmGeometries();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c42, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9248, roughness: 0.9, side: THREE.DoubleSide });
  const palmPos = [];
  for (let z = -200; z <= 28; z += 18) palmPos.push([0, z]);
  for (let x = -48; x <= 150; x += 22) palmPos.push([x, 50.2]);
  palmPos.push([-14, 45], [14, 45]);
  const palmsTrunk = new THREE.InstancedMesh(palmTrunkGeo, trunkMat, palmPos.length);
  const palmsLeaves = new THREE.InstancedMesh(palmLeafGeo, leafMat, palmPos.length);
  palmPos.forEach(([x, z], i) => {
    dummy.position.set(x + (r() - 0.5) * 1.4, 0, z + (r() - 0.5) * 1.4);
    dummy.rotation.y = r() * Math.PI * 2;
    const s = 0.85 + r() * 0.5;
    dummy.scale.set(s, s * (0.9 + r() * 0.25), s);
    dummy.updateMatrix();
    palmsTrunk.setMatrixAt(i, dummy.matrix);
    palmsLeaves.setMatrixAt(i, dummy.matrix);
  });
  palmsTrunk.castShadow = true;
  palmsLeaves.castShadow = true;
  g.add(palmsTrunk); g.add(palmsLeaves);

  return {
    group: g,
    colliders,
    bounds: { minX: -56, maxX: 156, minZ: -222 },
    getMaxZ: (x) => (Math.abs(x) < 16 ? 56.2 : 51.4),
  };
}
