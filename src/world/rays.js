// 丁达尔光束:沿阳光方向的平行体积光"假片",噪声呼吸,克制用量(新海诚式可见光束)
// 所有光束严格平行于 SUN_DIR(平行光物理一致),加法混合;URL 加 ?rays=0 可整体关闭
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, float, smoothstep, uv } from 'three/tsl';
import { SUN_DIR, timeU, fbm } from './shared.js';

export function createGodRays() {
  const group = new THREE.Group();
  const axis = SUN_DIR.clone().normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

  const LEN = 26, WID = 4.4;
  const geo = new THREE.PlaneGeometry(WID, LEN, 1, 8);

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;
  mat.blending = THREE.AdditiveBlending;
  mat.fog = false;
  mat.colorNode = vec3(1.0, 0.93, 0.78);

  // 端部/边缘淡出 + fbm 缓慢呼吸;强度刻意压低,宁缺毋滥
  mat.opacityNode = Fn(() => {
    const u = uv();
    const axial = smoothstep(float(0.0), float(0.16), u.y)
      .mul(smoothstep(float(1.0), float(0.55), u.y));
    const lateral = smoothstep(float(0.0), float(0.35), u.x)
      .mul(smoothstep(float(1.0), float(0.65), u.x));
    const breathe = fbm(vec2(u.x.mul(2.0), u.y.mul(0.8).sub(timeU.mul(0.05))));
    return axial.mul(lateral).mul(float(0.35).add(breathe.mul(0.65))).mul(float(0.07));
  })();

  // 主街上空 5 束(叶隙/楼间漏光的位置感)
  const spots = [
    [-4.5, -176], [1.5, -128], [-2.0, -86], [4.0, -48], [0.0, -14],
  ];
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 9.2, z);
    m.quaternion.copy(quat);
    m.renderOrder = 20;
    group.add(m);
  }
  return group;
}
