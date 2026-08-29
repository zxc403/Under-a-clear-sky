// HUD:开场封面 / 顶栏状态 / 触屏控件样式 / 提示气泡
const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
#topbar {
  position: absolute; display: flex; justify-content: space-between;
  top: calc(8px + env(safe-area-inset-top, 0px));
  left: calc(14px + env(safe-area-inset-left, 0px));
  right: calc(14px + env(safe-area-inset-right, 0px));
  font-size: 11px; letter-spacing: .12em; color: rgba(255,255,255,.92);
  text-shadow: 0 1px 6px rgba(30,60,90,.45);
}
#stats { opacity: .85; }
#overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #69b6ec 0%, #a8dcf5 55%, #eaf9fb 100%);
  pointer-events: auto; transition: opacity .8s ease;
}
#overlay.hide { opacity: 0; pointer-events: none; }
#ov-card { text-align: center; color: #1e3d59; padding: 0 24px; }
#ov-logo { font-size: clamp(24px, 5.2vmin, 42px); letter-spacing: .28em; font-weight: 700; }
#ov-sub { margin-top: 8px; font-size: clamp(13px, 2.4vmin, 18px); letter-spacing: .5em; opacity: .8; }
#ov-desc { margin-top: 16px; font-size: 13px; line-height: 1.9; opacity: .65; }
#ov-enter {
  margin-top: 24px; padding: 13px 42px; font-size: 16px; letter-spacing: .3em;
  color: #fff; background: #2f7fd6; border: none; border-radius: 999px;
  box-shadow: 0 6px 24px rgba(47,127,214,.4); cursor: pointer;
}
#ov-enter:disabled { background: #9db8cc; box-shadow: none; cursor: wait; }
#ov-tips { margin-top: 24px; font-size: 11.5px; line-height: 2; opacity: .55; }
#toast {
  position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%) translateY(10px);
  background: rgba(20,40,60,.78); color: #fff; padding: 10px 20px; border-radius: 999px;
  font-size: 13px; opacity: 0; transition: all .3s ease; white-space: nowrap;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
#touch-ui { display: none; }
@media (pointer: coarse) { #touch-ui { display: block; } }
#joy-base {
  display: none; position: fixed; width: 124px; height: 124px; margin: -62px 0 0 -62px;
  border-radius: 50%; background: rgba(255,255,255,.14);
  border: 1.5px solid rgba(255,255,255,.35); z-index: 20; pointer-events: none;
}
#joy-knob {
  position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; border-radius: 50%;
  background: rgba(255,255,255,.5); transform: translate(-50%,-50%);
}
#btn-cluster {
  position: fixed; z-index: 21; width: 190px; height: 168px;
  right: calc(18px + env(safe-area-inset-right, 0px));
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
}
.tbtn {
  position: absolute; width: 58px; height: 58px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,.4); background: rgba(255,255,255,.18);
  color: #fff; font-size: 13px; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.tbtn.on { background: rgba(255,255,255,.42); }
.tbtn.latched { background: rgba(120,200,255,.5); }
#btn-jump { right: 0; bottom: 0; width: 72px; height: 72px; font-size: 14px; }
#btn-sprint { right: 82px; bottom: 22px; }
#btn-act { right: 22px; bottom: 92px; }
`;

export class HUD {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const ui = document.createElement('div');
    ui.id = 'hud';
    ui.innerHTML = `
      <div id="topbar">
        <div>UNDER A CLEAR SKY · 氛围原型 α</div>
        <div id="stats"><span id="backend">--</span> · <span id="fps">-- FPS</span> · <span id="tris">--</span></div>
      </div>
      <div id="overlay">
        <div id="ov-card">
          <div id="ov-logo">UNDER A CLEAR SKY</div>
          <div id="ov-sub">晴空之下</div>
          <div id="ov-desc">一条通向大海的主街 · 14:28 的午后<br>天空 / 大积云 / 海面 / 治愈调色 · 首次联调</div>
          <button id="ov-enter" disabled>正在编译着色器…</button>
          <div id="ov-tips">手机:左半屏摇杆移动 · 右半屏滑动视角 · 右下按键<br>电脑:WASD 移动 · 鼠标观察 · Shift 冲刺 · 空格跳跃 · E 交互 · 支持手柄</div>
        </div>
      </div>
      <div id="toast"></div>`;
    document.body.appendChild(ui);
    this.onEnter = null;
    this._enterBtn = ui.querySelector('#ov-enter');
    this._enterBtn.addEventListener('click', () => {
      const ov = ui.querySelector('#overlay');
      ov.classList.add('hide');
      this.onEnter && this.onEnter();
      setTimeout(() => ov.remove(), 900);
    });
  }
  setBackend(b) { document.getElementById('backend').textContent = b; }
  setFps(f, tris) {
    document.getElementById('fps').textContent = f + ' FPS';
    document.getElementById('tris').textContent = (tris / 1000).toFixed(0) + 'k tri';
  }
  ready() { this._enterBtn.disabled = false; this._enterBtn.textContent = '进 入 世 界'; }
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 2200);
  }
}
