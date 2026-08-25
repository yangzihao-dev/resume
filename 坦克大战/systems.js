// ============================================================
//  systems.js - 碰撞检测 / 输入 / 粒子 / 音效
// ============================================================
import { CONFIG } from './config.js';

// ---------- 碰撞检测 ----------
export const Collision = {
  rect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },
  pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  },
  circleRect(cx, cy, cr, r) {
    const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
    const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
    const dx = cx - nx, dy = cy - ny;
    return dx*dx + dy*dy <= cr*cr;
  },
  circles(x1,y1,r1, x2,y2,r2) {
    const dx = x1-x2, dy = y1-y2;
    const rr = r1+r2;
    return dx*dx + dy*dy <= rr*rr;
  },
  // 子弹与地图碰撞（返回 {hit:true, axis:'x'|'y', tileType} 或 null）
  bulletVsMap(bullet, map) {
    const tile = map.getTileAt(bullet.x, bullet.y);
    const T = CONFIG.TILE;
    if (tile === T.STEEL) {
      if (bullet.pierce > 0 && bullet.canBreakSteel) {
        // 穿甲弹可打钢墙
        map.setTileAt(bullet.x, bullet.y, T.EMPTY);
        bullet.pierce--;
        return { hit:false, brokeSteel:true };
      }
      return { hit:true, tileType:T.STEEL };
    }
    if (tile === T.BRICK) {
      if (bullet.bounce > 0 && !bullet.fromPlayer) {
        return { hit:true, tileType:T.BRICK };
      }
      // 玩家子弹/敌弹打砖墙都摧毁
      map.setTileAt(bullet.x, bullet.y, T.EMPTY);
      if (bullet.pierce > 0) { bullet.pierce--; return { hit:false, brokeBrick:true }; }
      return { hit:true, tileType:T.BRICK };
    }
    if (tile === T.BASE) {
      return { hit:true, tileType:T.BASE };
    }
    return null;
  },
};

// ---------- 输入管理 ----------
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x:0, y:0, down:false, onCanvas:false };
    this.touch = { up:false, down:false, left:false, right:false, fire:false };
    this.joyData = { active:false, startX:0, startY:0, dx:0, dy:0 };

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;
    });
    // 鼠标
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      this.mouse.onCanvas = true;
    });
    canvas.addEventListener('mouseleave', () => this.mouse.onCanvas = false);
    canvas.addEventListener('mousedown', () => this.mouse.down = true);
    window.addEventListener('mouseup', () => this.mouse.down = false);

    // 触屏 - 摇杆
    this._setupJoystick();
    this._setupFireBtn();
  }

  _setupJoystick() {
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    if (!joy) return;
    const onStart = (e) => {
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      const r = joy.getBoundingClientRect();
      this.joyData.active = true;
      this.joyData.startX = r.left + r.width/2;
      this.joyData.startY = r.top + r.height/2;
    };
    const onMove = (e) => {
      if (!this.joyData.active) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      let dx = t.clientX - this.joyData.startX;
      let dy = t.clientY - this.joyData.startY;
      const max = 40;
      const d = Math.sqrt(dx*dx+dy*dy);
      if (d > max) { dx = dx/d*max; dy = dy/d*max; }
      this.joyData.dx = dx; this.joyData.dy = dy;
      if (knob) {
        knob.style.left = `calc(50% + ${dx}px)`;
        knob.style.top = `calc(50% + ${dy}px)`;
      }
      const thr = 12;
      this.touch.up = dy < -thr;
      this.touch.down = dy > thr;
      this.touch.left = dx < -thr;
      this.touch.right = dx > thr;
    };
    const onEnd = () => {
      this.joyData.active = false;
      this.joyData.dx = 0; this.joyData.dy = 0;
      if (knob) { knob.style.left = '50%'; knob.style.top = '50%'; }
      this.touch.up = this.touch.down = this.touch.left = this.touch.right = false;
    };
    joy.addEventListener('touchstart', onStart, {passive:false});
    joy.addEventListener('touchmove', onMove, {passive:false});
    joy.addEventListener('touchend', onEnd);
    joy.addEventListener('touchcancel', onEnd);
  }

  _setupFireBtn() {
    const btn = document.getElementById('fire-btn');
    if (!btn) return;
    const press = (e) => { e.preventDefault(); this.touch.fire = true; };
    const release = () => { this.touch.fire = false; };
    btn.addEventListener('touchstart', press, {passive:false});
    btn.addEventListener('touchend', release);
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
  }

  getState() {
    return {
      up:    !!(this.keys['w'] || this.keys['arrowup']   || this.touch.up),
      down:  !!(this.keys['s'] || this.keys['arrowdown'] || this.touch.down),
      left:  !!(this.keys['a'] || this.keys['arrowleft'] || this.touch.left),
      right: !!(this.keys['d'] || this.keys['arrowright']|| this.touch.right),
      fire:  !!(this.keys[' '] || this.keys['j'] || this.mouse.down || this.touch.fire),
      pause: !!(this.keys['escape'] || this.keys['p']),
    };
  }
}

// ---------- 粒子系统 ----------
export class ParticleSystem {
  constructor() { this.list = []; this.enabled = true; }
  setEnabled(v) { this.enabled = v; if (!v) this.list = []; }

  _push(p) { if (this.enabled) this.list.push(p); }

  explosion(x, y, color='#fbbf24', count=18, sizeBase=4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this._push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 500 + Math.random() * 300,
        maxLife: 800,
        size: sizeBase + Math.random() * sizeBase,
        color,
        gravity: 0.04,
        shrink: true,
      });
    }
  }
  hit(x, y, color='#ffffff') {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this._push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 200 + Math.random() * 150, maxLife: 350,
        size: 2 + Math.random() * 2, color, shrink: true,
      });
    }
  }
  trail(x, y, color='#00f0ff', size=2.5) {
    this._push({
      x: x + (Math.random()-0.5)*2,
      y: y + (Math.random()-0.5)*2,
      vx: (Math.random()-0.5)*0.3,
      vy: (Math.random()-0.5)*0.3,
      life: 250, maxLife: 250,
      size, color, shrink: true,
    });
  }
  pickup(x, y, color='#fbbf24') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this._push({
        x, y,
        vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2 - 1,
        life: 500, maxLife: 500,
        size: 3, color, gravity: 0.06, shrink: true,
      });
    }
  }
  muzzle(x, y, angle, color='#fde68a') {
    for (let i = 0; i < 4; i++) {
      const spread = (Math.random()-0.5) * 0.5;
      const a = angle + spread;
      const s = 3 + Math.random() * 2;
      this._push({
        x, y,
        vx: Math.cos(a)*s, vy: Math.sin(a)*s,
        life: 100, maxLife: 100,
        size: 3, color, shrink: true,
      });
    }
  }
  heal(x, y) {
    for (let i = 0; i < 8; i++) {
      this._push({
        x: x + (Math.random()-0.5)*16,
        y: y + 10,
        vx: (Math.random()-0.5)*0.5,
        vy: -1 - Math.random()*1.5,
        life: 600, maxLife: 600,
        size: 3, color: '#4ade80', shrink: false, alphaOnly: true,
      });
    }
  }
  bossWarn() {
    for (let i = 0; i < 40; i++) {
      this._push({
        x: Math.random() * CONFIG.CANVAS_WIDTH,
        y: Math.random() * CONFIG.CANVAS_HEIGHT,
        vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6,
        life: 1200, maxLife: 1200,
        size: 4 + Math.random()*4, color: '#ef4444', shrink: true,
      });
    }
  }
  lava(x, y) {
    this._push({
      x: x + (Math.random()-0.5)*10,
      y: y + (Math.random()-0.5)*10,
      vx: (Math.random()-0.5)*0.5,
      vy: -0.5 - Math.random(),
      life: 800, maxLife: 800,
      size: 3 + Math.random()*3, color: '#ea580c', shrink: true, gravity: 0.02,
    });
  }

  update(dt) {
    if (!this.enabled) return;
    for (const p of this.list) {
      p.life -= dt;
      p.x += (p.vx || 0);
      p.y += (p.vy || 0);
      if (p.gravity) p.vy += p.gravity;
      if (p.shrink) p.size *= 0.97;
    }
    this.list = this.list.filter(p => p.life > 0 && p.size > 0.3);
  }

  draw(ctx) {
    if (!this.enabled) return;
    for (const p of this.list) {
      const t = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------- 音效（Web Audio 合成） ----------
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this._noiseBuf = null;
  }
  _ensureCtx() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) { return false; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  _getNoise() {
    if (this._noiseBuf) return this._noiseBuf;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * 1, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * 0.6;
    this._noiseBuf = buf;
    return buf;
  }
  setEnabled(v) { this.enabled = v; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); }

  shoot() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(780, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.09);
    g.gain.setValueAtTime(0.15 * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.1);
  }
  enemyShoot() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
    g.gain.setValueAtTime(0.08 * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.13);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.14);
  }
  explosion(big=false) {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(big ? 900 : 1800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + (big?0.8:0.35));
    const g = this.ctx.createGain();
    const vol = big ? 0.4 : 0.22;
    g.gain.setValueAtTime(vol * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big?0.9:0.4));
    src.connect(filter); filter.connect(g); g.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + (big?1:0.5));
  }
  hit() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.06);
    g.gain.setValueAtTime(0.12 * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.1);
  }
  pickup() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const notes = [660, 880, 1175];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + i*0.06);
      g.gain.setValueAtTime(0, t + i*0.06);
      g.gain.linearRampToValueAtTime(0.12 * this.volume, t + i*0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.06 + 0.12);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + i*0.06); o.stop(t + i*0.06 + 0.15);
    });
  }
  playerHurt() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.2);
    g.gain.setValueAtTime(0.22 * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.26);
  }
  bossWarn() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(160, t + i*0.25);
      g.gain.setValueAtTime(0, t + i*0.25);
      g.gain.linearRampToValueAtTime(0.18 * this.volume, t + i*0.25 + 0.02);
      g.gain.linearRampToValueAtTime(0, t + i*0.25 + 0.22);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + i*0.25); o.stop(t + i*0.25 + 0.24);
    }
  }
  victory() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + i*0.12);
      g.gain.setValueAtTime(0, t + i*0.12);
      g.gain.linearRampToValueAtTime(0.15 * this.volume, t + i*0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.12 + 0.3);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + i*0.12); o.stop(t + i*0.12 + 0.32);
    });
  }
  gameover() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const notes = [440, 349, 277, 196];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t + i*0.18);
      g.gain.setValueAtTime(0.15 * this.volume, t + i*0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.18 + 0.35);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + i*0.18); o.stop(t + i*0.18 + 0.36);
    });
  }
  buff() {
    if (!this.enabled || !this._ensureCtx()) return;
    const t = this.ctx.currentTime;
    const notes = [784, 988, 1319];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + i*0.05);
      g.gain.setValueAtTime(0, t + i*0.05);
      g.gain.linearRampToValueAtTime(0.13 * this.volume, t + i*0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.05 + 0.25);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + i*0.05); o.stop(t + i*0.05 + 0.27);
    });
  }
}

// ---------- 工具函数 ----------
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b-a)*t; }
export function rand(a, b) { return a + Math.random()*(b-a); }
export function randInt(a, b) { return Math.floor(rand(a, b+1)); }
export function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
export function dist2(x1,y1,x2,y2) { const dx=x1-x2, dy=y1-y2; return dx*dx+dy*dy; }
export function formatTime(ms) {
  const s = Math.floor(ms/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${mm}:${ss}`;
}
