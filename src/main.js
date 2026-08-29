// 晴空之下 · 氛围原型入口
// WebGPURenderer(WebGPU 优先,自动/手动降级 WebGL2) + TSL 全节点着色
import * as THREE from 'three/webgpu';
import { pass, Fn, vec3, float, dot, mix, smoothstep, screenUV } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { SUN_DIR, timeU } from './world/shared.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createTown } from './world/town.js';
import { Input } from './controls/input.js';
import { Player } from './controls/player.js';
import { HUD } from './ui/hud.js';

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.style.display = 'flex';
  el.textContent = '场景初始化出错了,请截图发给我:\n\n' + msg;
}
let booted = false;
addEventListener('error', (e) => {
  if (/pointer.?lock|WrongDocument/i.test(String(e.message))) return; // 指针锁定失败非致命
  if (!booted) fatal(e.message);
});
addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message || e.reason);
  if (/pointer.?lock|WrongDocument/i.test(msg)) return;
  if (!booted) fatal(msg);
});

// 安全请求指针锁定(部分环境会拒绝,静默忽略)
function tryPointerLock(el) {
  try {
    const p = el.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    try {
      const p = el.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* 环境不支持,忽略 */ }
  }
}

// 治愈调色:阴影偏青 + 轻饱和 + 暖高光 + 轻暗角
const grade = Fn(([c]) => {
  const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const shadowT = float(1.0).sub(smoothstep(0.0, 0.35, lum));
  let gcol = c.add(vec3(0.0, 0.30, 0.55).mul(shadowT.mul(0.10)));
  const lum2 = dot(gcol, vec3(0.2126, 0.7152, 0.0722));
  gcol = mix(vec3(lum2), gcol, 1.07);
  gcol = gcol.mul(mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.6, 1.6, lum2).mul(0.5)));
  const vig = smoothstep(1.35, 0.55, screenUV.sub(0.5).length().mul(1.15));
  return gcol.mul(mix(1.0, vig, 0.16));
});

async function boot() {
  const app = document.getElementById('app');
  const hasWebGPU = !!navigator.gpu;
  let renderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: !hasWebGPU });
    await renderer.init();
  } catch (err) {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
    await renderer.init();
  }
  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd4ebf7, 140, 1300);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 7000);

  // 14:28 午后阳光
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 50, far: 900 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbfe6f5, 0x9db08f, 0.85));

  scene.add(createSky());
  scene.add(createWater());
  const town = createTown();
  scene.add(town.group);

  const hud = new HUD();
  hud.setBackend(backend);
  const input = new Input();
  input.attach(renderer.domElement);
  const player = new Player(camera);

  hud.onEnter = () => {
    if (input.isTouch) {
      document.documentElement.requestFullscreen?.()
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
        .catch(() => {});
    } else {
      tryPointerLock(renderer.domElement);
    }
    booted = true;
  };

  // 后处理:HDR -> Bloom -> 治愈调色
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode();
  const bloomPass = bloom(sceneColor, 0.35, 0.3, 0.9);
  postProcessing.outputNode = grade(sceneColor.add(bloomPass));

  await renderer.compileAsync(scene, camera);
  hud.ready();

  const clock = new THREE.Clock();
  let t = 0, frames = 0, fpsT = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    timeU.value = t;
    input.update(dt);
    player.update(dt, input, town);
    if (input.interactEdge) {
      input.interactEdge = false;
      hud.toast('这里以后能推门进去,下一版开放');
    }
    postProcessing.render();
    frames++; fpsT += dt;
    if (fpsT >= 0.5) {
      hud.setFps(Math.round(frames / fpsT), renderer.info.render.triangles);
      frames = 0; fpsT = 0;
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

boot().catch((e) => fatal(e.stack || e.message));
