// 玩家:第一人称行走 + 碰撞 + 边界 + 头部微晃
import * as THREE from 'three/webgpu';

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, -120); // 脚底位置
    this.yaw = Math.PI;                        // 面向 +Z(大海)
    this.pitch = -0.02;
    this.eye = 1.7;
    this.vy = 0;
    this.onGround = true;
    this.bobT = 0;
  }

  update(dt, input, town) {
    this.yaw -= input.lookDX;
    this.pitch -= input.lookDY;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    input.lookDX = 0; input.lookDY = 0;

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let ax = fx * input.moveY + rx * input.moveX;
    let az = fz * input.moveY + rz * input.moveX;
    const al = Math.hypot(ax, az);
    if (al > 1) { ax /= al; az /= al; }
    const speed = input.sprint ? 9.0 : 4.6;
    this.pos.x += ax * speed * dt;
    this.pos.z += az * speed * dt;

    if (input.jumpEdge && this.onGround) { this.vy = 5.4; this.onGround = false; }
    input.jumpEdge = false;
    if (!this.onGround) {
      this.vy -= 15 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    }

    // 圆形 vs AABB 推挤
    const r = 0.45;
    for (const b of town.colliders) {
      const nx = Math.max(b.minX, Math.min(this.pos.x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(this.pos.z, b.maxZ));
      const dx = this.pos.x - nx, dz = this.pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          this.pos.x = nx + dx / d * r;
          this.pos.z = nz + dz / d * r;
        } else this.pos.x += r;
      }
    }
    this.pos.x = Math.max(town.bounds.minX, Math.min(town.bounds.maxX, this.pos.x));
    this.pos.z = Math.max(town.bounds.minZ, Math.min(town.getMaxZ(this.pos.x), this.pos.z));

    const moving = Math.hypot(ax, az);
    if (this.onGround && moving > 0.1) this.bobT += dt * (input.sprint ? 11 : 7.5);
    const bob = Math.sin(this.bobT) * 0.035 * Math.min(moving, 1);

    this.camera.position.set(this.pos.x, this.pos.y + this.eye + bob, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }
}
