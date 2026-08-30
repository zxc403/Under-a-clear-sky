// 晴空之下 · 氛围原型入口
// WebGPURenderer(WebGPU 优先,自动/手动降级 WebGL2) + TSL 全节点着色
import * as THREE from 'three/webgpu';
import { pass, Fn, vec3, float, dot, mix, smoothstep, screenUV } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { SUN_DIR, timeU } from './world/shared.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createTown } from './world/town.js';
import { createGodRays } from './world/rays.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from './controls/input.js';
import { Player } from './controls/player.js';
import { HUD } from './ui/hud.js';

// 调试着色器编译错误捕获:three 的节点编译错误走 console.error,直接显示到屏幕上
const _errBox = document.createElement('div');
_errBox.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:92vw;max-height:40vh;overflow:auto;z-index:99;background:rgba(120,0,0,.85);color:#fff;font:11px/1.5 monospace;padding:8px 10px;border-radius:6px;display:none;white-space:pre-wrap;';
document.body.appendChild(_errBox);
const _errs = [];
function _pushErr(m) {
  _errs.push(String(m).slice(0, 800));
  _errBox.style.display = 'block';
  _errBox.textContent = _errs.slice(0, 4).join('\n----\n');
}
const _cerr = console.error.bind(console);
console.error = (...a) => { _pushErr(a.map(x => x?.stack || x?.message || String(x)).join(' ')); _cerr(...a); };
const _cwarn = console.warn.bind(console);
console.warn = (...a) => {
  const msg = a.map(x => x?.message || String(x)).join(' ');
  if (/Clock|deprecat/i.test(msg)) return _cwarn(...a); // 无害弃用警告不上屏
  _pushErr('[warn] ' + msg); _cwarn(...a);
};

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

// 治愈调色:阴影偏青 + 轻饱和 + 暖高光 + 轻暗角(全部显式 float/vec3,防类型错配)
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
  renderer.toneMappingExposure = 1.045; // V2.1:整体曝光减弱约 5%(用户反馈天空略亮)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdceffa, 100, 720); // 距离雾收紧:远景 CBD/天际线获得空气透视
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
  // 丁达尔光束(?rays=0 关闭)
  if (new URLSearchParams(location.search).get('rays') !== '0') scene.add(createGodRays());

  // 验货建筑 02/03: 鱼八水产 + 岬咖啡 (GLB, 1unit=1m, 原点底面中心); ?noglb=1 用于 A/B 排查
  if (new URLSearchParams(location.search).get('noglb') !== '1') {
    const loader = new GLTFLoader();
    const placed = [];
    function placeGLB(url, x, z, rotY, name) {
      loader.load(url, (gltf) => {
        const m = gltf.scene;
        m.position.set(x, 0, z);
        m.rotation.y = rotY;
        m.traverse((o) => {
          if (o.isMesh) {
            // 关键修复:GLTF 默认材质(legacy)混入 TSL 节点管线会触发通道串色,
            // 统一替换为节点材质并保留顶点色,与场景其他对象同路径编译
            const src = o.material;
            const nm = new THREE.MeshStandardNodeMaterial({
              vertexColors: false, // 顶点色(COLOR_0)与节点管线冲突=串色根源,禁用
              roughness: 0.92,
              metalness: 0.0,
            });
            if (src && src.color) nm.color = src.color.clone(); // 分色多网格:每网格自带底色
            o.material = nm;
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        scene.add(m);
        placed.push(name);
        console.log('[building] placed:', name);
      }, undefined, (err) => console.warn('[building] load fail:', url, err));
    }
    placeGLB('models/fishshop_02.glb', -22, -14, Math.PI, 'fishshop_02');
    placeGLB('models/cafe_03.glb', 20, -46, 0, 'cafe_03');
  }

  const hud = new HUD();
  hud.setBackend(backend);
  const input = new Input();
  input.attach(renderer.domElement);
  const player = new Player(camera);
  // 调试出生点:?spawn=beach(海滨步道)/?spawn=plaza(广场),便于快速验收
  const sp = new URLSearchParams(location.search).get('spawn');
  if (sp === 'beach') player.pos.set(0, 0, 30);
  else if (sp === 'plaza') player.pos.set(0, 0, 44);

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

  // 后处理:Bloom(高阈值 0.88 / 小半径 0.30 / 适中强度 0.32,防糊)+ 治愈调色(显式类型,修复串色后接回)
  const postProcessing = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode();
  postProcessing.outputNode = grade(sceneColor.add(bloom(sceneColor, 0.32, 0.30, 0.88)));

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
