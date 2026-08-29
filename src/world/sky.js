// 天空穹顶:共享 skyColor 函数,背面球体
import * as THREE from 'three/webgpu';
import { positionLocal } from 'three/tsl';
import { skyColor } from './shared.js';

export function createSky() {
  const geo = new THREE.SphereGeometry(3200, 48, 24);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.fog = false;
  mat.colorNode = skyColor(positionLocal);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}
