// 海面:近岸 turquoise 渐变 + 菲涅尔天空反射 + 太阳碎金 + 岸线泡沫
// 近水面(顶点波浪,精细网格) + 远水面(大平面到地平线)
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, float, mix, smoothstep, clamp,
  sin, cos, pow, max, dot, normalize, reflect,
  positionWorld, positionLocal, cameraPosition,
} from 'three/tsl';
import { skyColor, sunDirU, timeU, fbm } from './shared.js';

const WATER_EDGE_Z = 56.0;

// 三组方向波的解析高度/梯度
const waveParts = Fn(([p, t]) => {
  const d1 = vec2(0.8, 0.6);
  const d2 = vec2(-0.5, 0.9);
  const d3 = vec2(0.2, -1.0);
  const p1 = dot(p, d1).mul(0.55).add(t.mul(1.1));
  const p2 = dot(p, d2).mul(0.9).add(t.mul(1.5));
  const p3 = dot(p, d3).mul(1.7).add(t.mul(2.2));
  const h = sin(p1).mul(0.14).add(sin(p2).mul(0.09)).add(sin(p3).mul(0.05));
  const gx = cos(p1).mul(0.14).mul(0.55).mul(d1.x)
    .add(cos(p2).mul(0.09).mul(0.9).mul(d2.x))
    .add(cos(p3).mul(0.05).mul(1.7).mul(d3.x));
  const gz = cos(p1).mul(0.14).mul(0.55).mul(d1.y)
    .add(cos(p2).mul(0.09).mul(0.9).mul(d2.y))
    .add(cos(p3).mul(0.05).mul(1.7).mul(d3.y));
  return vec3(h, gx, gz);
});

const waterNormal = Fn(([p, t]) => {
  const w = waveParts(p, t);
  const ripple = fbm(p.mul(0.8).add(vec2(t.mul(0.06), t.mul(-0.04)))).sub(0.47).mul(0.16);
  return normalize(vec3(w.y.add(ripple).negate(), 1.0, w.z.add(ripple).negate()));
});

// 主颜色(颜色节点,自研光照不走标准材质)
const waterColor = Fn(() => {
  const t = timeU;
  const pw = positionWorld;
  const n = waterNormal(pw.xz, t);
  const view = normalize(cameraPosition.sub(pw));
  const ndv = max(dot(view, n), 0.0);
  const fres = float(0.04).add(pow(float(1.0).sub(ndv), 5.0).mul(0.56));

  // 反射共享同一天空函数 → 水天一色
  const refl = reflect(view.negate(), n);
  const skyRef = skyColor(refl);

  // 深度渐变(由离岸距离伪造浅滩)
  const dist = pw.z.sub(WATER_EDGE_Z);
  const shallow = float(1.0).sub(smoothstep(0.0, 26.0, dist));
  const deep = vec3(0.03, 0.32, 0.55);
  const midc = vec3(0.06, 0.55, 0.72);
  const shal = vec3(0.20, 0.85, 0.78);
  let wcol = mix(deep, midc, smoothstep(0.0, 0.6, shallow));
  wcol = mix(wcol, shal, smoothstep(0.55, 1.0, shallow));
  const sand = vec3(0.76, 0.72, 0.55);
  wcol = mix(wcol, sand.mul(1.05), smoothstep(0.72, 1.0, shallow).mul(0.45));

  let col = mix(wcol, skyRef, clamp(fres, 0.0, 1.0));

  // 太阳碎金(布林高光双峰)
  const hv = normalize(view.add(sunDirU));
  const ndh = max(dot(n, hv), 0.0);
  const spec = pow(ndh, 140.0).mul(1.5).add(pow(ndh, 28.0).mul(0.28));
  col = col.add(vec3(1.0, 0.9, 0.7).mul(spec));

  // 岸线泡沫:滚动波带 + 噪声破碎 + 贴岸白边
  const band = sin(dist.mul(1.8).sub(t.mul(1.6))).mul(0.5).add(0.5);
  const fmask = float(1.0).sub(smoothstep(0.3, 9.0, dist));
  const fn2 = fbm(pw.xz.mul(0.35).add(vec2(t.mul(0.10), t.mul(-0.06))));
  const foamBody = smoothstep(0.42, 0.78, band.mul(0.30).add(fn2.mul(0.62))).mul(fmask);
  const edgeFoam = float(1.0).sub(smoothstep(0.0, 1.5, dist));
  const foam = clamp(foamBody.add(edgeFoam.mul(0.9)), 0.0, 1.0);
  col = mix(col, vec3(1.04), foam.mul(0.85));

  // 远方融入地平线的天空色(空气透视)
  const vd = normalize(pw.sub(cameraPosition));
  const hcol = skyColor(normalize(vec3(vd.x, 0.03, vd.z)));
  col = mix(col, hcol, smoothstep(260.0, 1100.0, pw.sub(cameraPosition).length()).mul(0.5));

  return col;
});

function makeWaterMaterial(withWaves) {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.fog = false;
  mat.colorNode = waterColor();
  if (withWaves) {
    mat.positionNode = positionLocal.add(
      vec3(0.0, 0.0, waveParts(vec2(positionLocal.x, positionLocal.y), timeU).x)
    );
  }
  return mat;
}

export function createWater() {
  const group = new THREE.Group();

  // 近水面:覆盖海岸线附近,密网格带顶点波浪
  const nearGeo = new THREE.PlaneGeometry(500, 160, 200, 64);
  const near = new THREE.Mesh(nearGeo, makeWaterMaterial(true));
  near.rotation.x = -Math.PI / 2;
  near.position.set(50, -0.18, WATER_EDGE_Z + 80);
  near.frustumCulled = false;
  group.add(near);

  // 远水面:平铺到地平线,法线波纹仍在片元里工作
  const farGeo = new THREE.PlaneGeometry(2800, 1900, 1, 1);
  const far = new THREE.Mesh(farGeo, makeWaterMaterial(false));
  far.rotation.x = -Math.PI / 2;
  far.position.set(50, -0.22, WATER_EDGE_Z + 160 + 950);
  far.frustumCulled = false;
  group.add(far);

  return group;
}
