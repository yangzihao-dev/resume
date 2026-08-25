// ============================================================
//  weapons.js - Boss 弹幕 / 特殊子弹生成工具
// ============================================================
import { CONFIG } from './config.js';
import { Bullet } from './entities.js';

// 基础敌弹工厂
export function enemyBullet(x, y, angle, speed, dmg, opts={}) {
  return new Bullet({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage: dmg,
    fromPlayer: false,
    color: opts.color || CONFIG.COLORS.RED,
    trailColor: opts.trailColor || opts.color || CONFIG.COLORS.RED,
    size: opts.size || 6,
    life: opts.life || 4000,
    splash: opts.splash || 0,
    pierce: opts.pierce || 0,
    bounce: opts.bounce || 0,
    homing: opts.homing || 0, // 0~1 追踪强度
  });
}

// 环形弹幕（返回 n 发子弹）
export function ringBullets(x, y, count, speed, dmg, opts={}) {
  const out = [];
  const startAngle = opts.startAngle || 0;
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i / count) * Math.PI * 2;
    out.push(enemyBullet(x, y, a, speed, dmg, opts));
  }
  return out;
}

// 扇形弹幕
export function fanBullets(x, y, baseAngle, count, spreadAngle, speed, dmg, opts={}) {
  const out = [];
  const step = count > 1 ? spreadAngle / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const a = count > 1
      ? baseAngle - spreadAngle/2 + i * step
      : baseAngle;
    out.push(enemyBullet(x, y, a, speed, dmg, opts));
  }
  return out;
}

// 螺旋弹幕（每次调用发 angleOffset 偏移的 N 发）
export function spiralBullets(x, y, angleOffset, arms, speed, dmg, opts={}) {
  const out = [];
  for (let i = 0; i < arms; i++) {
    const a = angleOffset + (i / arms) * Math.PI * 2;
    out.push(enemyBullet(x, y, a, speed, dmg, opts));
  }
  return out;
}

// 追踪弹（朝玩家发射，带轻微追踪）
export function homingBullet(x, y, tx, ty, speed, dmg, opts={}) {
  const a = Math.atan2(ty - y, tx - x);
  return enemyBullet(x, y, a, speed, dmg, {
    ...opts,
    homing: opts.homing == null ? 0.02 : opts.homing,
    color: opts.color || '#f97316',
  });
}

// 散射追踪连发
export function homingBurst(x, y, tx, ty, count, speed, dmg, opts={}) {
  const out = [];
  const base = Math.atan2(ty - y, tx - x);
  const spread = count > 1 ? 0.6 : 0;
  for (let i = 0; i < count; i++) {
    const a = count > 1 ? base - spread/2 + i * (spread/(count-1)) : base;
    out.push(enemyBullet(x, y, a, speed * (0.8 + Math.random()*0.4), dmg, {
      ...opts,
      homing: 0.015,
      color: '#fb923c',
    }));
  }
  return out;
}

// 爆破弹（大 splash）
export function explosiveBullet(x, y, angle, speed, dmg, radius=70) {
  return enemyBullet(x, y, angle, speed, dmg, {
    splash: radius,
    color: '#fbbf24',
    size: 9,
    life: 3000,
  });
}

// 激光（实体化：一系列密集子弹排成线）
export function laserBullets(x1, y1, x2, y2, dmg) {
  const out = [];
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy);
  const step = 6;
  const count = Math.ceil(len / step);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    out.push(new Bullet({
      x: x1 + dx * t, y: y1 + dy * t,
      vx: 0, vy: 0,
      damage: dmg * 0.25,
      fromPlayer: false,
      color: '#a855f7',
      size: 4,
      life: 300,
      pierce: 99,
    }));
  }
  return out;
}

// 预定义 Boss 弹幕模板
export const BossPatterns = {
  // 基础环形
  ringSlow(x, y, dmg=15) { return ringBullets(x, y, 16, 2.5, dmg, { color:'#f472b6' }); },
  ringFast(x, y, dmg=18) { return ringBullets(x, y, 24, 4.2, dmg, { color:'#f97316' }); },
  // 双环
  doubleRing(x, y, dmg=12) {
    const a = ringBullets(x, y, 14, 2.2, dmg, { color:'#c084fc' });
    const b = ringBullets(x, y, 14, 3.4, dmg, { color:'#ef4444', startAngle: Math.PI/14 });
    return a.concat(b);
  },
  // 旋转螺旋（连续调用角度偏移产生螺旋）
  spiral(x, y, angle, dmg=14) {
    return spiralBullets(x, y, angle, 3, 3.0, dmg, { color:'#60a5fa', size:7 });
  },
  // 追踪齐射
  homing(x, y, px, py, n=5, dmg=16) {
    return homingBurst(x, y, px, py, n, 3.0, dmg);
  },
  // 大扇形朝玩家
  fanToPlayer(x, y, px, py, n=9, spread=Math.PI*0.7, dmg=14, spd=3.8) {
    const base = Math.atan2(py - y, px - x);
    return fanBullets(x, y, base, n, spread, spd, dmg, { color:'#22d3ee' });
  },
};
