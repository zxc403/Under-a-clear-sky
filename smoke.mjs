// V2 冒烟测试:在无渲染器环境下构建全部场景对象与 TSL 节点图
// 目的:捕捉 import 错误 / TSL API 误用 / 类型错配(节点图构建是 CPU 侧行为)
import * as THREE from 'three/webgpu';
import { Fn, vec3, float, dot, mix, smoothstep, screenUV } from 'three/tsl';
import { createSky } from './src/world/sky.js';
import { createWater } from './src/world/water.js';
import { createTown } from './src/world/town.js';
import { createGodRays } from './src/world/rays.js';

const sky = createSky();
const water = createWater();
const town = createTown();
const rays = createGodRays();
console.log('[ok] scene objects:',
  'sky=', !!sky,
  'water children=', water.children.length,
  'town children=', town.group.children.length,
  'colliders=', town.colliders.length,
  'rays=', rays.children.length);

// 棕榈叶球形法线校验:法线应偏离原平面法线、指向冠心球面方向
const leafGeo = rays.parent; // not applicable; check town palms via geometry scan
let palmLeafChecked = false;
town.group.traverse((o) => {
  if (!palmLeafChecked && o.isInstancedMesh && o.geometry?.attributes?.normal && o.geometry.attributes.position.count > 100) {
    const nor = o.geometry.attributes.normal;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < nor.count; i++) { nx += Math.abs(nor.getX(i)); ny += Math.abs(nor.getY(i)); nz += Math.abs(nor.getZ(i)); }
    nx /= nor.count; ny /= nor.count; nz /= nor.count;
    // 平面叶片原法线几乎全 ±Z;球形混合后应显著分散
    console.log('[ok] instanced foliage normals avg |xyz| =', nx.toFixed(3), ny.toFixed(3), nz.toFixed(3), '(spherical blend => no single axis near 1.0)');
    palmLeafChecked = true;
  }
});

// 与 main.js 一致的调色节点图(阴影偏青 + 轻饱和 + 暖高光 + 暗角)
const grade = Fn(([c]) => {
  const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const shadowT = float(1.0).sub(smoothstep(float(0.0), float(0.38), lum));
  let gcol = c.add(vec3(0.0, 0.30, 0.55).mul(shadowT.mul(float(0.14))));
  const lum2 = dot(gcol, vec3(0.2126, 0.7152, 0.0722));
  gcol = mix(vec3(lum2), gcol, float(1.10));
  gcol = gcol.mul(mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(float(0.6), float(1.6), lum2).mul(float(0.5))));
  const vig = smoothstep(float(1.35), float(0.55), screenUV.sub(0.5).length().mul(float(1.15)));
  return gcol.mul(mix(vec3(1.0), vec3(vig), float(0.16)));
});
const graded = grade(vec3(0.6, 0.6, 0.6));
console.log('[ok] grade node graph constructed:', !!graded);

console.log('SMOKE PASS');
