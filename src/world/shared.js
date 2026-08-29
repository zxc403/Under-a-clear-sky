// 晴空之下 · 共享 TSL 着色库
// 天空颜色函数同时驱动:天空穹顶 / 水面反射 / 远景雾化,保证全场景色调统一
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, float, mix, smoothstep, clamp,
  fract, floor, sin, cos, pow, max, abs, dot, normalize,
} from 'three/tsl';

// ---- 全局环境参数(锁定 14:28 午后) ----
export const SUN_DIR = new THREE.Vector3(-0.52, 0.60, 0.45).normalize();
export const sunDirU = uniform(SUN_DIR);
export const timeU = uniform(0.0);

// ---- 程序噪声(value noise + fbm,双后端通用) ----
const hash2 = Fn(([p]) =>
  fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123))
);

const vnoise = Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2.0).add(3.0));
  const a = hash2(i);
  const b = hash2(i.add(vec2(1.0, 0.0)));
  const c = hash2(i.add(vec2(0.0, 1.0)));
  const d = hash2(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

// 4  octave fbm, 手动展开避免版本差异
export const fbm = Fn(([p]) => {
  let v = vnoise(p).mul(0.5);
  v = v.add(vnoise(p.mul(2.03).add(vec2(19.7, 7.3))).mul(0.25));
  v = v.add(vnoise(p.mul(4.09).add(vec2(-13.1, 27.7))).mul(0.125));
  v = v.add(vnoise(p.mul(8.17).add(vec2(31.3, -11.9))).mul(0.0625));
  return v;
});

// ---- 天空颜色(HDR 线性空间,含大积云与太阳光晕) ----
export const skyColor = Fn(([dir]) => {
  const d = normalize(dir);
  const sun = sunDirU;
  const y = d.y;

  // 基础大气渐变:地平线暖白 -> 中天青 -> 天顶湛蓝
  const t = pow(clamp(y, 0.0, 1.0), 0.60);
  const zen = vec3(0.13, 0.42, 0.90);
  const mid = vec3(0.34, 0.62, 0.97);
  const hor = vec3(0.82, 0.94, 1.02);
  let col = mix(hor, mix(mid, zen, smoothstep(0.14, 0.80, t)), smoothstep(0.0, 0.18, t));
  col = mix(col.mul(0.94), col, smoothstep(-0.08, 0.0, y));

  // 太阳:光晕先铺,日轮在云之前加入(云可遮挡日轮)
  const sd = max(dot(d, sun), 0.0);
  const warm = vec3(1.0, 0.86, 0.62);
  const glow = pow(sd, 420.0).mul(2.0).add(pow(sd, 32.0).mul(0.30));
  col = col.add(warm.mul(glow));
  const haze = pow(sd, 3.0).mul(pow(clamp(float(1.0).sub(abs(y)), 0.0, 1.0), 3.0)).mul(0.08);
  col = col.add(warm.mul(haze));
  const disk = smoothstep(0.9993, 0.99985, sd).mul(26.0);
  col = col.add(vec3(1.0, 0.95, 0.85).mul(disk));

  // 大积云层:投影到固定云平面,覆盖整片天空(上一版投影在天顶退化+阈值过严导致无云)
  const py = max(y, 0.03);
  const cp = d.xz.div(py.add(0.15)).mul(0.42).add(vec2(timeU.mul(0.004), timeU.mul(0.0016)));
  const n1 = fbm(cp);
  const detail = fbm(cp.mul(2.1).add(vec2(7.7, 3.1)));
  const densBase = n1.mul(0.75).add(detail.mul(0.25));
  const cov = smoothstep(0.42, 0.60, densBase);
  const horizonFade = smoothstep(0.008, 0.06, y);

  // 前向散射银边:朝太阳方向偏移采样,云缘被阳光打亮
  const sunOff = vec2(sun.x, sun.z).normalize().mul(0.07);
  const n2 = fbm(cp.add(sunOff));
  const lining = clamp(n1.sub(n2), 0.0, 1.0).mul(cov);

  const cloudLight = vec3(1.10, 1.07, 1.02);
  const cloudDark = vec3(0.62, 0.71, 0.85);
  let ccol = mix(cloudLight, cloudDark, smoothstep(0.55, 0.95, densBase).mul(0.72));
  ccol = ccol.add(vec3(1.0, 0.82, 0.55).mul(lining.mul(1.7).mul(pow(sd, 2.0).add(0.25))));

  const cmask = cov.mul(horizonFade);
  col = mix(col, ccol, cmask);

  // 高层卷云(拉伸噪声薄丝)
  const cir = fbm(cp.mul(vec2(2.2, 7.5)).add(vec2(3.3, 9.1)));
  col = col.add(vec3(1.0).mul(smoothstep(0.62, 0.95, cir).mul(0.10).mul(smoothstep(0.2, 0.5, y))));

  return col;
});
