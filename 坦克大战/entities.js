// ============================================================
//  entities.js - 所有实体：Player / Enemy / Bullet / Pickup / Boss
// ============================================================
import { CONFIG } from './config.js';
import { clamp, rand, randInt, dist2 } from './systems.js';

const TS = CONFIG.TILE_SIZE;

// ---------------- 基础实体 ----------------
export class Entity {
  constructor(x, y, size) {
    this.x = x; this.y = y;
    this.size = size;
    this.vx = 0; this.vy = 0;
    this.dead = false;
    this.hp = 1; this.maxHp = 1;
    this.angle = -Math.PI/2; // 朝上
    this.facing = 0; // 0上 1右 2下 3左
  }
  get rect() {
    const s = this.size * 0.85; // 碰撞箱稍小
    return { x: this.x - s/2, y: this.y - s/2, w: s, h: s };
  }
  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
  }
  draw(ctx) {}
}

// ---------------- 子弹 ----------------
export class Bullet extends Entity {
  constructor(opts) {
    super(opts.x, opts.y, opts.size || 6);
    this.vx = opts.vx; this.vy = opts.vy;
    this.damage = opts.damage || 10;
    this.pierce = opts.pierce || 0;
    this.bounce = opts.bounce || 0;
    this.fromPlayer = !!opts.fromPlayer;
    this.color = opts.color || (this.fromPlayer ? CONFIG.COLORS.CYAN : CONFIG.COLORS.RED);
    this.trailColor = opts.trailColor || this.color;
    this.fire = !!opts.fire;
    this.ice = !!opts.ice;
    this.splash = opts.splash || 0;
    this.life = opts.life || 2000; // ms
    this.hitEntities = new Set();
    this.canBreakSteel = opts.canBreakSteel || this.pierce >= 3;
    this.isCrit = !!opts.isCrit;
    this.critDmgMul = opts.critDmgMul || 1;
    if (this.isCrit) this.damage = Math.floor(this.damage * this.critDmgMul);
  }
  update(dt, map) {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    // 边界
    if (this.x < 0 || this.x > CONFIG.CANVAS_WIDTH ||
        this.y < 0 || this.y > CONFIG.CANVAS_HEIGHT) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    // 尾焰
    ctx.strokeStyle = this.trailColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = this.size * 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 2.5, this.y - this.vy * 2.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 弹头
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.6, 0, Math.PI*2);
    ctx.fill();
    if (this.isCrit) {
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------------- 玩家坦克 ----------------
export class Player extends Entity {
  constructor(x, y, typeKey='medium') {
    const conf = CONFIG.PLAYER_TYPES[typeKey] || CONFIG.PLAYER_TYPES.medium;
    super(x, y, conf.size);
    this.typeKey = typeKey;
    this.typeName = conf.name;
    this.color = conf.color;
    this.maxHp = conf.hp; this.hp = conf.hp;
    this._baseSpeed = conf.speed;
    this._baseDamage = conf.damage;
    this._baseFireRate = conf.fireRate;
    this._baseBSpeed = conf.bs;
    this._baseSplash = conf.splash || 0;
    this.shieldCount = 0;
    this.maxShield = 3;

    // Buff 叠加器
    this.fireRateMul = 1;
    this.damageMul = 1;
    this.speedMul = 1;
    this.bspeedMul = 1;
    this.splashMul = 1;
    this.buffSpread = 1;
    this.buffPierce = 0;
    this.buffBounce = 0;
    this.buffFire = false;
    this.buffIce = false;
    this.buffMulti = 0;
    this.critChance = 0.05;
    this.critDmgMul = 1.5;

    // 临时 Buff（道具时间型）
    this.tempPowerUntil = 0;  // 火力强化
    this.tempSpeedUntil = 0;  // 加速

    // 射击冷却
    this._fireCD = 0;
    this._multiIndex = 0;
    this._multiTimer = 0;
    this.pendingBulletBurst = []; // 多重射击用

    // 冰面
    this._iceVX = 0; this._iceVY = 0;
    this._invincibleUntil = 0;

    // 统计
    this.coins = 0;
  }

  get damage() {
    let d = this._baseDamage * this.damageMul;
    if (Date.now() < this.tempPowerUntil) d *= 1.3;
    return Math.round(d);
  }
  get speed() {
    let s = this._baseSpeed * this.speedMul;
    if (Date.now() < this.tempSpeedUntil) s *= 1.5;
    return s;
  }
  get fireRate() {
    let r = this._baseFireRate * this.fireRateMul;
    if (Date.now() < this.tempPowerUntil) r *= 0.6;
    return r;
  }
  get bspeed() {
    let s = this._baseBSpeed * this.bspeedMul;
    if (Date.now() < this.tempPowerUntil) s *= 1.15;
    return s;
  }
  get splash() {
    return this._baseSplash * this.splashMul;
  }

  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }
  addShield(n=1) { this.shieldCount = Math.min(this.maxShield, this.shieldCount + n); }
  takeDamage(dmg) {
    if (Date.now() < this._invincibleUntil) return false;
    if (this.shieldCount > 0) {
      this.shieldCount--;
      this._invincibleUntil = Date.now() + 600;
      return 'shield';
    }
    this.hp = Math.max(0, this.hp - dmg);
    this._invincibleUntil = Date.now() + 400;
    return 'hp';
  }

  // 尝试开火，返回子弹数组（每帧调用，内部管理 CD）
  tryFire(dt) {
    // 多重射击连发
    if (this.pendingBulletBurst.length > 0) {
      this._multiTimer -= dt;
      if (this._multiTimer <= 0) {
        this._multiTimer = 40;
        const b = this.pendingBulletBurst.shift();
        return [this._makeBullet(b.angleOffset || 0, b.extra || {})];
      }
      return [];
    }
    this._fireCD -= dt;
    if (this._fireCD > 0) return [];
    this._fireCD = this.fireRate;
    // 散射：生成多个带角度偏移的子弹
    const spread = this.buffSpread || 1;
    const bullets = [];
    const totalAngle = Math.PI / 6;
    const step = spread > 1 ? totalAngle / (spread - 1) : 0;
    for (let i = 0; i < spread; i++) {
      const offset = spread > 1 ? -totalAngle/2 + i*step : 0;
      bullets.push({ angleOffset: offset });
    }
    // 多重射击：连发处理
    const multi = 1 + this.buffMulti;
    if (multi > 1 && bullets.length === 1) {
      // 单发情况：把 multi 发排入 pending 队列
      const extras = [];
      for (let m = 1; m < multi; m++) extras.push(m);
      this.pendingBulletBurst = bullets.concat(extras.map(() => ({})));
    }
    // 立即生成首组
    const out = [];
    for (const b of bullets.slice(0, multi > 1 ? 1 : bullets.length)) {
      out.push(this._makeBullet(b.angleOffset || 0));
    }
    // 若散射 + 多重同时存在：直接全部打出去（不连发）
    if (spread > 1 && multi > 1) {
      out.length = 0;
      for (let m = 0; m < multi; m++) {
        for (let i = 0; i < spread; i++) {
          const offset = spread > 1 ? -totalAngle/2 + i*step : 0;
          out.push(this._makeBullet(offset, { muzzleOffset: m*6 }));
        }
      }
    }
    return out;
  }

  _makeBullet(angleOffset=0, extra={}) {
    // 暴击判定
    const isCrit = Math.random() < this.critChance;
    const a = this.angle + angleOffset;
    const mozOff = extra.muzzleOffset || 0;
    const mx = this.x + Math.cos(this.angle) * (this.size*0.6 + mozOff);
    const my = this.y + Math.sin(this.angle) * (this.size*0.6 + mozOff);
    return new Bullet({
      x: mx, y: my,
      vx: Math.cos(a) * this.bspeed,
      vy: Math.sin(a) * this.bspeed,
      damage: this.damage,
      pierce: this.buffPierce,
      bounce: this.buffBounce,
      splash: this.splash,
      fromPlayer: true,
      fire: this.buffFire,
      ice: this.buffIce,
      isCrit,
      critDmgMul: this.critDmgMul,
      color: isCrit ? '#fef9c3' : CONFIG.COLORS.CYAN,
      size: this.splash > 0 ? 9 : 6,
      canBreakSteel: true,
    });
  }

  update(dt, input, map, particles) {
    // 移动输入
    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    // 对角线归一化
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    // 朝向更新
    if (dx || dy) {
      this.angle = Math.atan2(dy, dx);
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 1 : 3;
      else this.facing = dy > 0 ? 2 : 0;
    }
    // 冰面打滑
    const onIce = map.isOnIce(this.x, this.y);
    let moveX = dx * this.speed;
    let moveY = dy * this.speed;
    if (onIce) {
      this._iceVX = this._iceVX * 0.88 + moveX * 0.12;
      this._iceVY = this._iceVY * 0.88 + moveY * 0.12;
      moveX = this._iceVX; moveY = this._iceVY;
    } else {
      this._iceVX *= 0.6; this._iceVY *= 0.6;
    }
    // X 方向分轴碰撞
    const nx = this.x + moveX;
    const tx = { x: nx - this.size/2, y: this.y - this.size/2, w: this.size, h: this.size };
    if (!map.isBlocked(tx) && nx - this.size/2 > 2 && nx + this.size/2 < CONFIG.CANVAS_WIDTH - 2) {
      this.x = nx;
    }
    const ny = this.y + moveY;
    const ty = { x: this.x - this.size/2, y: ny - this.size/2, w: this.size, h: this.size };
    if (!map.isBlocked(ty) && ny - this.size/2 > 2 && ny + this.size/2 < CONFIG.CANVAS_HEIGHT - 2) {
      this.y = ny;
    }
    // 尾焰粒子（移动时）
    if (particles && (Math.abs(moveX) + Math.abs(moveY) > 0.6)) {
      const bx = this.x - Math.cos(this.angle) * this.size*0.4;
      const by = this.y - Math.sin(this.angle) * this.size*0.4;
      particles.trail(bx, by, this.color, 2.5);
    }
    super.update(dt);
  }

  draw(ctx) {
    const s = this.size;
    ctx.save();
    ctx.translate(this.x, this.y);
    // 无敌闪烁
    if (Date.now() < this._invincibleUntil && Math.floor(Date.now()/60) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    // 护盾
    if (this.shieldCount > 0) {
      ctx.save();
      ctx.rotate(Date.now() / 1000);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 18; ctx.shadowColor = '#38bdf8';
      const sr = s * 0.82;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * sr, py = Math.sin(a) * sr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      ctx.fillStyle = 'rgba(56,189,248,0.08)';
      ctx.fill();
      ctx.restore();
    }
    ctx.rotate(this.angle + Math.PI/2);
    this._drawTankBody(ctx, s, this.color);
    ctx.restore();
  }

  _drawTankBody(ctx, s, color) {
    // 履带
    const tW = s * 0.2, tH = s * 0.95;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-s*0.48, -tH/2, tW, tH);
    ctx.fillRect( s*0.48 - tW, -tH/2, tW, tH);
    // 履带节纹
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const y = i * (tH/9);
      ctx.beginPath();
      ctx.moveTo(-s*0.48, y); ctx.lineTo(-s*0.48 + tW, y);
      ctx.moveTo( s*0.48 - tW, y); ctx.lineTo( s*0.48, y);
      ctx.stroke();
    }
    // 车身
    ctx.fillStyle = '#0f172a';
    const bw = s * 0.58, bh = s * 0.82;
    this._roundRect(ctx, -bw/2, -bh/2, bw, bh, 4);
    ctx.fill();
    // 车身渐变+发光描边
    const grad = ctx.createLinearGradient(0, -bh/2, 0, bh/2);
    grad.addColorStop(0, this._lighten(color, 0.25));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, this._darken(color, 0.3));
    ctx.fillStyle = grad;
    this._roundRect(ctx, -bw/2+2, -bh/2+2, bw-4, bh-4, 3);
    ctx.fill();
    ctx.shadowBlur = 10; ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    this._roundRect(ctx, -bw/2+2, -bh/2+2, bw-4, bh-4, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 炮塔（圆形六边形）
    const tr = s * 0.32;
    ctx.fillStyle = this._darken(color, 0.15);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const px = Math.cos(a) * tr, py = Math.sin(a) * tr;
      if (i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this._lighten(color, 0.3);
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8; ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 炮管（朝上）
    const bl = s * 0.65, bW = s * 0.14;
    ctx.fillStyle = '#334155';
    ctx.fillRect(-bW/2, -bl - tr*0.3, bW, bl);
    ctx.fillStyle = this._lighten(color, 0.15);
    ctx.fillRect(-bW/2+1, -bl - tr*0.3, bW-2, bl);
    // 炮口
    ctx.fillStyle = '#020617';
    ctx.fillRect(-bW*0.7, -bl - tr*0.3 - 2, bW*1.4, 3);
    // 顶部装饰（小圆）
    ctx.fillStyle = CONFIG.COLORS.CYAN;
    ctx.shadowBlur = 6; ctx.shadowColor = CONFIG.COLORS.CYAN;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI*2);
    ctx.fill();
  }
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  _hexToRgb(hex) {
    const m = hex.replace('#','');
    return {
      r: parseInt(m.substring(0,2),16),
      g: parseInt(m.substring(2,4),16),
      b: parseInt(m.substring(4,6),16),
    };
  }
  _rgbToHex(r,g,b) {
    return '#' + [r,g,b].map(x => clamp(Math.round(x),0,255).toString(16).padStart(2,'0')).join('');
  }
  _lighten(hex, amt) {
    const c = this._hexToRgb(hex);
    return this._rgbToHex(c.r + (255-c.r)*amt, c.g + (255-c.g)*amt, c.b + (255-c.b)*amt);
  }
  _darken(hex, amt) {
    const c = this._hexToRgb(hex);
    return this._rgbToHex(c.r * (1-amt), c.g * (1-amt), c.b * (1-amt));
  }
}

// ---------------- 敌方坦克 ----------------
export class Enemy extends Entity {
  constructor(x, y, typeKey='scout', level=1) {
    const c = CONFIG.ENEMY_TYPES[typeKey];
    super(x, y, c.size);
    this.typeKey = typeKey;
    this.name = c.name;
    this.color = c.color;
    const lvMul = 1 + (level - 1) * 0.18;
    this.maxHp = Math.round(c.hp * lvMul);
    this.hp = this.maxHp;
    this.speed = c.speed * (0.9 + Math.random()*0.2);
    this.damage = Math.round(c.dmg * lvMul);
    this.fireRate = c.fireRate;
    this.bspeed = c.bs;
    this.score = Math.round(c.score * lvMul);
    this.aiType = c.ai;
    this.shield = c.shield || 0; this.maxShield = this.shield;
    this.explodeOnDeath = !!c.explodeOnDeath;
    this.explodeRadius = c.explodeRadius || 60;
    this.explodeDmg = c.explodeDmg || 30;
    this.healAmount = c.healAmount || 0;
    this.healRange = c.healRange || 0;
    this.healRate = c.healRate || 800;

    this._fireCD = rand(300, 900);
    this._healCD = 0;
    this._sniperCD = 0;
    this._sniperAiming = false;
    this._sniperAimTime = 0;
    this._roamDir = { dx: (Math.random()-0.5)*2, dy: (Math.random()-0.5)*2 };
    this._roamTimer = rand(800, 1800);
    this._effects = { fire: 0, ice: 0 }; // ms 剩余
  }

  isElite() { return false; }

  takeDamage(dmg, effects={}) {
    // 先扣护盾
    if (this.shield > 0) {
      const absorb = Math.min(this.shield, dmg);
      this.shield -= absorb;
      dmg -= absorb;
    }
    this.hp = Math.max(0, this.hp - dmg);
    if (effects.fire) this._effects.fire = Math.max(this._effects.fire, 5000);
    if (effects.ice) this._effects.ice = Math.max(this._effects.ice, 3000);
    return this.hp <= 0;
  }

  update(dt, player, map, particles, enemies) {
    // 燃烧/冰冻效果
    if (this._effects.fire > 0) {
      this._effects.fire -= dt;
      if (Math.random() < 0.25 && particles) {
        particles.trail(this.x + rand(-this.size/3, this.size/3), this.y - this.size/3, '#f97316', 2.5);
      }
      this.hp = Math.max(0, this.hp - (5 * dt / 1000));
    }
    if (this._effects.ice > 0) this._effects.ice -= dt;
    const slowMul = this._effects.ice > 0 ? 0.5 : 1;

    // AI 决策
    const toP = { x: player.x - this.x, y: player.y - this.y };
    const distP = Math.sqrt(toP.x*toP.x + toP.y*toP.y) || 1;
    let dx = 0, dy = 0;

    switch (this.aiType) {
      case 'chase': {
        dx = toP.x / distP; dy = toP.y / distP;
        if (this.explodeOnDeath && distP < 60) { /* 近身就爆 */ }
        // 偶尔绕一下
        this._roamTimer -= dt;
        if (this._roamTimer <= 0) {
          this._roamTimer = rand(1200, 2500);
          this._roamDir = { dx: (Math.random()-0.5), dy: (Math.random()-0.5) };
        }
        if (Math.random() < 0.35) {
          dx = dx * 0.7 + this._roamDir.dx * 0.3;
          dy = dy * 0.7 + this._roamDir.dy * 0.3;
        }
        this.angle = Math.atan2(toP.y, toP.x);
        break;
      }
      case 'sniper': {
        // 保持远距离，停下瞄准
        const ideal = 380;
        if (distP < ideal - 50) { dx = -toP.x/distP; dy = -toP.y/distP; }
        else if (distP > ideal + 80) { dx = toP.x/distP; dy = toP.y/distP; }
        else { dx = -toP.y/distP * 0.5; dy = toP.x/distP * 0.5; } // 绕圈
        this.angle = Math.atan2(toP.y, toP.x);
        break;
      }
      case 'healer': {
        // 远离玩家，靠近受伤友军
        let target = null, best = Infinity;
        if (enemies) {
          for (const e of enemies) {
            if (e === this || e.dead) continue;
            const hpR = e.hp / e.maxHp;
            if (hpR < 0.85) {
              const d = dist2(this.x,this.y,e.x,e.y);
              if (d < best) { best = d; target = e; }
            }
          }
        }
        if (target && distP < 250) {
          const dtx = target.x - this.x, dty = target.y - this.y;
          const dt = Math.sqrt(dtx*dtx+dty*dty) || 1;
          dx = dtx/dt; dy = dty/dt;
          this.angle = Math.atan2(dty, dtx);
          // 治疗
          this._healCD -= dt;
          if (this._healCD <= 0 && dt < this.healRange) {
            this._healCD = this.healRate;
            target.hp = Math.min(target.maxHp, target.hp + this.healAmount * 8);
            if (particles) particles.heal(target.x, target.y - target.size/2);
          }
        } else {
          // 躲玩家
          dx = -toP.x/distP * 0.8; dy = -toP.y/distP * 0.8;
          this.angle = Math.atan2(-toP.y, -toP.x);
        }
        break;
      }
      default: {
        dx = toP.x/distP; dy = toP.y/distP;
        this.angle = Math.atan2(dy, dx);
      }
    }

    // 应用速度 + 冰缓
    const sp = this.speed * slowMul;
    const moveX = dx * sp;
    const moveY = dy * sp;
    const nx = this.x + moveX;
    const tx = { x: nx-this.size/2, y: this.y-this.size/2, w: this.size, h: this.size };
    if (!map.isBlocked(tx) && nx > this.size && nx < CONFIG.CANVAS_WIDTH - this.size) this.x = nx;
    const ny = this.y + moveY;
    const ty = { x: this.x-this.size/2, y: ny-this.size/2, w: this.size, h: this.size };
    if (!map.isBlocked(ty) && ny > this.size && ny < CONFIG.CANVAS_HEIGHT - this.size) this.y = ny;
    else {
      // 撞墙就换漫游方向
      this._roamTimer = 0;
    }

    // 射击
    this._fireCD -= dt;
    if (this._fireCD <= 0 && distP < 600) {
      if (this.aiType === 'sniper') {
        if (!this._sniperAiming) {
          this._sniperAiming = true;
          this._sniperAimTime = 900;
          this._fireCD = 900;
        }
      } else {
        this._fireCD = this.fireRate + rand(-100, 200);
        this._pendingFire = true;
      }
    }
    if (this._sniperAiming) {
      this._sniperAimTime -= dt;
      if (this._sniperAimTime <= 0) {
        this._sniperAiming = false;
        this._fireCD = this.fireRate + rand(0, 400);
        this._pendingFire = true;
        this._pendingFireSniper = true;
      }
    }
    super.update(dt);
  }

  tryFire() {
    if (!this._pendingFire) return [];
    this._pendingFire = false;
    const a = this.angle;
    const spd = this.bspeed;
    const dmg = this.damage;
    const out = [];
    if (this._pendingFireSniper) {
      this._pendingFireSniper = false;
      out.push(new Bullet({
        x: this.x + Math.cos(a) * this.size*0.6,
        y: this.y + Math.sin(a) * this.size*0.6,
        vx: Math.cos(a)*spd*1.4, vy: Math.sin(a)*spd*1.4,
        damage: dmg*1.5, fromPlayer:false, color:'#facc15',
        size: 9, life: 3500,
      }));
      return out;
    }
    out.push(new Bullet({
      x: this.x + Math.cos(a)*this.size*0.6,
      y: this.y + Math.sin(a)*this.size*0.6,
      vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
      damage: dmg, fromPlayer:false, color: this.color,
      life: 2500,
    }));
    // 爆破兵发射间隔弹 - 单弹即可
    return out;
  }

  draw(ctx) {
    const s = this.size;
    ctx.save();
    ctx.translate(this.x, this.y);
    // 冰冻覆盖层
    if (this._effects.ice > 0) {
      ctx.save();
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8; ctx.shadowColor = '#7dd3fc';
      ctx.strokeRect(-s*0.55, -s*0.55, s*1.1, s*1.1);
      ctx.restore();
    }
    // 燃烧
    if (this._effects.fire > 0 && Math.random() < 0.4) {
      // 燃烧粒子由 update 发出
    }
    ctx.rotate(this.angle + Math.PI/2);
    // 护盾
    if (this.shield > 0) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * (this.shield / (this.maxShield || 1));
      ctx.shadowBlur = 12; ctx.shadowColor = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, 0, s*0.75, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
    this._drawEnemy(ctx, s);
    ctx.restore();
    // 血条
    if (this.hp < this.maxHp || this.shield > 0) {
      this._drawHpBar(ctx, s);
    }
    // 狙击预警线
    if (this._sniperAiming) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
      ctx.shadowBlur = 8; ctx.shadowColor = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(s*0.5, 0);
      ctx.lineTo(600, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawEnemy(ctx, s) {
    // 履带
    const tW = s*0.2, tH = s*0.95;
    ctx.fillStyle = '#111827';
    ctx.fillRect(-s*0.48, -tH/2, tW, tH);
    ctx.fillRect(s*0.48 - tW, -tH/2, tW, tH);
    ctx.strokeStyle = '#030712';
    for (let i = -4; i <= 4; i++) {
      const y = i*(tH/9);
      ctx.beginPath();
      ctx.moveTo(-s*0.48, y); ctx.lineTo(-s*0.48+tW, y);
      ctx.moveTo(s*0.48-tW, y); ctx.lineTo(s*0.48, y);
      ctx.stroke();
    }
    // 车身
    const bw = s*0.58, bh = s*0.82;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10; ctx.shadowColor = this.color;
    this._rr(ctx, -bw/2, -bh/2, bw, bh, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this._darken(this.color, 0.4);
    ctx.lineWidth = 1.5;
    this._rr(ctx, -bw/2, -bh/2, bw, bh, 3);
    ctx.stroke();
    // 装饰格子
    ctx.strokeStyle = this._darken(this.color, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -bh/2+3); ctx.lineTo(0, bh/2-3);
    ctx.moveTo(-bw/2+3, 0); ctx.lineTo(bw/2-3, 0);
    ctx.stroke();
    // 炮塔
    const tr = s * 0.3;
    ctx.fillStyle = this._darken(this.color, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, tr, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = this._lighten(this.color, 0.2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 炮管
    const bl = s*0.6, bW = s*0.13;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-bW/2, -bl - tr*0.3, bW, bl);
    ctx.fillStyle = this._lighten(this.color, 0.2);
    ctx.fillRect(-bW/2+1, -bl-tr*0.3, bW-2, bl);
    // 顶部识别灯（不同敌不同色）
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 6; ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI*2); ctx.fill();
  }

  _drawHpBar(ctx, s) {
    const w = s * 1.2, h = 4;
    const x = this.x - w/2, y = this.y - s/2 - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x-1, y-1, w+2, h+2);
    const r = this.hp / this.maxHp;
    const color = r > 0.5 ? CONFIG.COLORS.GREEN : r > 0.25 ? CONFIG.COLORS.YELLOW : CONFIG.COLORS.RED;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * r, h);
    if (this.maxShield > 0) {
      const sr = this.shield / this.maxShield;
      ctx.fillStyle = CONFIG.COLORS.CYAN;
      ctx.fillRect(x, y - 5, w * sr, 2.5);
    }
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  _hexToRgb(hex) {
    const m = hex.replace('#','');
    return { r: parseInt(m.substring(0,2),16), g: parseInt(m.substring(2,4),16), b: parseInt(m.substring(4,6),16) };
  }
  _rgbToHex(r,g,b) { return '#' + [r,g,b].map(x => clamp(Math.round(x),0,255).toString(16).padStart(2,'0')).join(''); }
  _lighten(hex, amt) { const c = this._hexToRgb(hex); return this._rgbToHex(c.r+(255-c.r)*amt, c.g+(255-c.g)*amt, c.b+(255-c.b)*amt); }
  _darken(hex, amt) { const c = this._hexToRgb(hex); return this._rgbToHex(c.r*(1-amt), c.g*(1-amt), c.b*(1-amt)); }
}

// ---------------- 精英怪（血量+光环） ----------------
export class EliteEnemy extends Enemy {
  constructor(x, y, typeKey, level) {
    super(x, y, typeKey, level);
    this.maxHp = Math.round(this.maxHp * 4.5);
    this.hp = this.maxHp;
    this.damage = Math.round(this.damage * 1.5);
    this.score = Math.round(this.score * 6);
    this.size = Math.round(this.size * 1.15);
  }
  isElite() { return true; }
  draw(ctx) {
    // 黄色光环
    ctx.save();
    ctx.translate(this.x, this.y);
    const t = Date.now() / 300;
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = `rgba(250, 204, 21, ${0.35 + 0.15*Math.sin(t+i)})`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10; ctx.shadowColor = '#facc15';
      ctx.beginPath();
      ctx.arc(0, 0, this.size*0.9 + 4 + i*3, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
    super.draw(ctx);
  }
}

// ---------------- 道具 ----------------
export class Pickup extends Entity {
  constructor(x, y, typeKey='coin') {
    const conf = CONFIG.PICKUPS[typeKey] || CONFIG.PICKUPS.coin;
    super(x, y, 18);
    this.type = typeKey;
    this.color = conf.color;
    this.icon = conf.icon;
    this.value = conf.value || 0;
    this.duration = conf.duration || 0;
    this._bob = Math.random() * Math.PI * 2;
    this.life = 15000; // 15秒消失
  }
  update(dt) {
    this._bob += dt / 300;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const bob = Math.sin(this._bob) * 3;
    const alpha = this.life < 3000 ? (Math.floor(this.life/150) % 2 ? 0.3 : 1) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y + bob);
    // 光环
    ctx.shadowBlur = 16; ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.size*0.9 + Math.sin(this._bob*1.2)*2, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    // 六边形容器
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i*Math.PI/3;
      const px = Math.cos(a)*this.size*0.75, py = Math.sin(a)*this.size*0.75;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 图标
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 12; ctx.shadowColor = this.color;
    ctx.font = 'bold 16px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.icon, 0, 1);
    ctx.restore();
  }
  apply(player) {
    switch (this.type) {
      case 'hp':    player.heal(this.value); break;
      case 'shield':player.addShield(this.value); break;
      case 'coin':  player.coins += this.value; return { score: this.value };
      case 'speed': player.tempSpeedUntil = Math.max(player.tempSpeedUntil, Date.now()+this.duration); break;
      case 'power': player.tempPowerUntil = Math.max(player.tempPowerUntil, Date.now()+this.duration); break;
      case 'gem':   player.damageMul *= 1.08; player.maxHp += 10; player.hp += 10; return { score: 200 };
    }
    return {};
  }
}

// ---------------- Boss 基类（具体行为在 game.js 中扩展或覆盖） ----------------
export class Boss extends Entity {
  constructor(x, y, bossId) {
    const conf = CONFIG.BOSSES[bossId] || CONFIG.BOSSES.crab;
    super(x, y, conf.size);
    this.bossId = bossId;
    this.name = conf.name;
    this.color = conf.color;
    this.maxHp = conf.hp; this.hp = conf.hp;
    this.speed = conf.speed;
    this.damage = conf.dmg;
    this.phase = 1;
    this.maxPhase = this._phaseCount();
    this.actionTimer = 0;
    this.actionCD = 1000;
    this.moveTarget = { x: CONFIG.CANVAS_WIDTH/2, y: 160 };
    this.weakPoint = { x: 0, y: 0, r: 14, angle: 0, visible: true };
    this.enterTime = Date.now();
    this.isBoss = true;
  }
  _phaseCount() {
    if (this.bossId === 'apoc') return 4;
    if (this.bossId === 'crab') return 3;
    return 3;
  }
  hpRatio() { return this.hp / this.maxHp; }
  updatePhase() {
    const r = this.hpRatio();
    let wantPhase = 1;
    if (this.maxPhase === 4) {
      if (r < 0.75) wantPhase = 2;
      if (r < 0.5) wantPhase = 3;
      if (r < 0.25) wantPhase = 4;
    } else if (this.maxPhase === 3) {
      if (r < 0.6) wantPhase = 2;
      if (r < 0.3) wantPhase = 3;
    }
    if (wantPhase !== this.phase) {
      this.phase = wantPhase;
      this._onPhaseEnter(wantPhase);
    }
  }
  _onPhaseEnter(p) {}
  takeDamage(dmg, hitX, hitY) {
    // 弱点 3倍
    let mul = 1;
    if (this.weakPoint.visible) {
      const wp = this.weakPoint;
      const wx = this.x + wp.x, wy = this.y + wp.y;
      if (dist2(hitX, hitY, wx, wy) <= (wp.r + 5) * (wp.r + 5)) mul = 3;
    }
    this.hp = Math.max(0, this.hp - dmg * mul);
    this.updatePhase();
    return { killed: this.hp <= 0, weakHit: mul > 1, dmg: dmg * mul };
  }
  update(dt, player, map, particles) {
    // 入场
    if (this.y < this.moveTarget.y) {
      this.y += 1.2;
    } else {
      // 左右巡游
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) {
        this.actionTimer = rand(1500, 3000);
        this.moveTarget.x = clamp(player.x + rand(-180, 180), 150, CONFIG.CANVAS_WIDTH - 150);
        this.moveTarget.y = clamp(player.y - rand(180, 320), 80, 260);
      }
    }
    const dx = this.moveTarget.x - this.x, dy = this.moveTarget.y - this.y;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;
    const spd = this.speed * (this.phase >= this.maxPhase ? 1.6 : 1);
    this.x += (dx/d) * spd;
    this.y += (dy/d) * spd;
    // 持续朝向玩家
    this.angle = Math.atan2(player.y - this.y, player.x - this.x);
    // 弱点旋转
    this.weakPoint.angle += dt / 1200;
    this.weakPoint.x = Math.cos(this.weakPoint.angle) * this.size*0.45;
    this.weakPoint.y = Math.sin(this.weakPoint.angle) * this.size*0.45;
  }
  draw(ctx) {
    const s = this.size;
    ctx.save();
    ctx.translate(this.x, this.y);
    // 外层
    ctx.shadowBlur = 30; ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, s*0.62, 0, Math.PI*2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 主体
    ctx.fillStyle = this._darken(this.color, 0.5);
    this._hex(ctx, 0, 0, s*0.55);
    ctx.fill();
    const grad = ctx.createRadialGradient(0, 0, s*0.1, 0, 0, s*0.55);
    grad.addColorStop(0, this._lighten(this.color, 0.2));
    grad.addColorStop(1, this._darken(this.color, 0.3));
    ctx.fillStyle = grad;
    this._hex(ctx, 0, 0, s*0.5);
    ctx.fill();
    ctx.strokeStyle = this._lighten(this.color, 0.4);
    ctx.lineWidth = 2;
    this._hex(ctx, 0, 0, s*0.5);
    ctx.stroke();
    // 炮管
    ctx.save();
    ctx.rotate(this.angle);
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(0, side * s*0.28);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, -5, s*0.55, 10);
      ctx.fillStyle = this._lighten(this.color, 0.3);
      ctx.fillRect(2, -3, s*0.55 - 4, 6);
      ctx.restore();
    }
    ctx.restore();
    // 核心
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(0, 0, s*0.15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 15; ctx.shadowColor = this.color;
    ctx.beginPath(); ctx.arc(0, 0, s*0.1, 0, Math.PI*2); ctx.fill();
    // 弱点
    if (this.weakPoint.visible) {
      ctx.save();
      ctx.translate(this.weakPoint.x, this.weakPoint.y);
      ctx.strokeStyle = '#ef4444';
      ctx.shadowBlur = 15; ctx.shadowColor = '#ef4444';
      ctx.lineWidth = 2;
      const p = 1 + 0.15 * Math.sin(Date.now()/100);
      ctx.beginPath();
      ctx.arc(0, 0, this.weakPoint.r*p, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(239,68,68,0.35)';
      ctx.fill();
      // 十字
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-this.weakPoint.r*0.6, 0); ctx.lineTo(this.weakPoint.r*0.6, 0);
      ctx.moveTo(0, -this.weakPoint.r*0.6); ctx.lineTo(0, this.weakPoint.r*0.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // Boss 名字
    ctx.save();
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 6; ctx.shadowColor = this.color;
    ctx.fillText(`[${this.name}]  阶段 ${this.phase}/${this.maxPhase}`, this.x, this.y - s*0.7);
    ctx.restore();
  }
  _hex(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI/3;
      const px = x + Math.cos(a)*r, py = y + Math.sin(a)*r;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }
  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  _hexToRgb(hex) {
    const m = hex.replace('#','');
    return { r: parseInt(m.substring(0,2),16), g: parseInt(m.substring(2,4),16), b: parseInt(m.substring(4,6),16) };
  }
  _rgbToHex(r,g,b) { return '#' + [r,g,b].map(x => clamp(Math.round(x),0,255).toString(16).padStart(2,'0')).join(''); }
  _lighten(hex, amt) { const c = this._hexToRgb(hex); return this._rgbToHex(c.r+(255-c.r)*amt, c.g+(255-c.g)*amt, c.b+(255-c.b)*amt); }
  _darken(hex, amt) { const c = this._hexToRgb(hex); return this._rgbToHex(c.r*(1-amt), c.g*(1-amt), c.b*(1-amt)); }
}
