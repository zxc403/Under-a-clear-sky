// 输入:键鼠(指针锁定) + 触屏(左摇杆/右滑视角/右下按键) + 手柄
export class Input {
  constructor() {
    this.keys = new Set();
    this.moveX = 0; this.moveY = 0;       // -1..1,Y 前为正
    this.lookDX = 0; this.lookDY = 0;     // 每帧累计弧度
    this.sprint = false;
    this.jumpEdge = false;
    this.interactEdge = false;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.locked = false;
    this.sprintToggle = false;
    this.joy = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0 };
    this.look = { id: -1, lx: 0, ly: 0 };
    this._gp = { jump: false, act: false };
  }

  attach(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpEdge = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.interactEdge = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.lookDX += e.movementX * 0.0023;
        this.lookDY += e.movementY * 0.0023;
      }
    });
    canvas.addEventListener('click', () => {
      if (!this.isTouch && !this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.isTouch) this._buildTouchUI();
  }

  _buildTouchUI() {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.innerHTML = `
      <div id="joy-base"><div id="joy-knob"></div></div>
      <div id="btn-cluster">
        <button id="btn-act" class="tbtn">交互</button>
        <button id="btn-sprint" class="tbtn">冲刺</button>
        <button id="btn-jump" class="tbtn">跳跃</button>
      </div>`;
    document.body.appendChild(root);
    const base = root.querySelector('#joy-base');
    const knob = root.querySelector('#joy-knob');
    const R = 52;

    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY;
        if (x < innerWidth * 0.45 && this.joy.id === -1) {
          this.joy.id = t.identifier; this.joy.active = true;
          this.joy.bx = x; this.joy.by = y; this.joy.x = 0; this.joy.y = 0;
          base.style.display = 'block';
          base.style.left = x + 'px'; base.style.top = y + 'px';
          knob.style.transform = 'translate(-50%,-50%)';
        } else if (x >= innerWidth * 0.45 && this.look.id === -1) {
          this.look.id = t.identifier; this.look.lx = x; this.look.ly = y;
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.bx, dy = t.clientY - this.joy.by;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = dx / d * R; dy = dy / d * R; }
          this.joy.x = dx / R; this.joy.y = -dy / R;
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === this.look.id) {
          this.lookDX += (t.clientX - this.look.lx) * 0.0042;
          this.lookDY += (t.clientY - this.look.ly) * 0.0042;
          this.look.lx = t.clientX; this.look.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.id = -1; this.joy.active = false; this.joy.x = 0; this.joy.y = 0;
          base.style.display = 'none';
        }
        if (t.identifier === this.look.id) this.look.id = -1;
      }
    };
    const opts = { passive: false };
    document.addEventListener('touchstart', onStart, opts);
    document.addEventListener('touchmove', onMove, opts);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);

    const bind = (sel, down) => {
      const el = root.querySelector(sel);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('on'); down(el);
      }, opts);
      el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('on'); });
    };
    bind('#btn-jump', () => { this.jumpEdge = true; });
    bind('#btn-sprint', (el) => {
      this.sprintToggle = !this.sprintToggle;
      el.classList.toggle('latched', this.sprintToggle);
    });
    bind('#btn-act', () => { this.interactEdge = true; });
  }

  update(dt) {
    let kx = 0, ky = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) ky += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ky -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) kx += 1;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.sprintToggle;
    let mx = kx, my = ky;
    if (this.joy.active) { mx = this.joy.x; my = this.joy.y; }

    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const gx = dz(gp.axes[0] || 0), gy = dz(gp.axes[1] || 0);
      if (gx || gy) { mx = gx; my = -gy; }
      this.lookDX += dz(gp.axes[2] || 0) * 2.6 * dt;
      this.lookDY += dz(gp.axes[3] || 0) * 2.2 * dt;
      const jump = !!gp.buttons[0]?.pressed;
      if (jump && !this._gp.jump) this.jumpEdge = true;
      this._gp.jump = jump;
      const act = !!gp.buttons[2]?.pressed;
      if (act && !this._gp.act) this.interactEdge = true;
      this._gp.act = act;
      if (gp.buttons[5]?.pressed || gp.buttons[7]?.pressed) this.sprint = true;
    }
    this.moveX = Math.max(-1, Math.min(1, mx));
    this.moveY = Math.max(-1, Math.min(1, my));
  }
}
