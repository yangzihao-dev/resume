// ============================================================
//  game.js - 游戏主引擎 + 主循环 + DOM UI + 模式 + Boss AI
// ============================================================
import { CONFIG } from './config.js';
import {
  Input, Collision, ParticleSystem, SoundManager,
  clamp, rand, randInt, pick, dist2, formatTime,
} from './systems.js';
import { GameMap } from './map.js';
import { Player, Enemy, EliteEnemy, Bullet, Pickup, Boss } from './entities.js';
import {
  BossPatterns, ringBullets, fanBullets, spiralBullets,
  homingBurst, explosiveBullet, laserBullets, enemyBullet,
} from './weapons.js';

// ---------- 游戏主类 ----------
class Game {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.input = new Input(this.canvas);
    this.sound = new SoundManager();
    this.particles = new ParticleSystem();

    this.state = 'menu'; // menu / playing / paused / gameover / victory / buff-select
    this.mode = 'classic'; // classic / survive / roguelike / bossrush
    this.selectedTank = 'medium';

    this.player = null;
    this.map = new GameMap();
    this.bullets = [];
    this.enemies = [];
    this.pickups = [];
    this.boss = null;
    this.level = 1;
    this.wave = 1;
    this.maxWave = 5;
    this.score = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.lastTime = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.pendingBuffChoices = null;

    // 刷敌计时
    this.enemySpawnCD = 0;
    this.enemiesLeftToSpawn = 0;
    this.surviveSpawnCD = CONFIG.SPAWN.SURVIVE_INTERVAL;
    this.bossSpawned = false;
    this.bossSpawnSchedule = 0;

    // Boss 行为
    this.bossTimer = 0;
    this.bossBulletCD = 0;
    this.bossSpecialCD = 0;
    this.bossSpiralAngle = 0;

    // 暂停锁（ESC 防抖）
    this._lastPausePress = 0;

    this._settings = this._loadSettings();
    this._applySettings();

    this._bindUI();
    this._renderTankCards();
    this._refreshHighScores();
    this.start();
  }

  // ============ 主循环 ============
  start() {
    requestAnimationFrame(t => this.loop(t));
  }
  loop(t) {
    const dt = Math.min(50, t - this.lastTime || 16);
    this.lastTime = t;
    // 全局暂停键
    const input = this.input.getState();
    if (input.pause && (this.state === 'playing' || this.state === 'paused')) {
      const now = Date.now();
      if (now - this._lastPausePress > 350) {
        this._lastPausePress = now;
        this.togglePause();
      }
    }
    if (this.state === 'playing') this.update(dt);
    this.render();
    requestAnimationFrame(nt => this.loop(nt));
  }

  // ============ 启动游戏 ============
  startGame(mode, tankKey) {
    this.mode = mode;
    this.level = 1;
    this.score = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.selectedTank = tankKey || this.selectedTank;
    this.bullets = []; this.enemies = []; this.pickups = []; this.boss = null;
    this.bossSpawned = false;
    this._switchScreen('game');
    this._initLevel();
    this.state = 'playing';
  }

  _initLevel() {
    // 地图
    if (this.mode === 'roguelike') {
      const types = ['battle','battle','elite','treasure'];
      const t = pick(types);
      this.map.generateRoguelikeRoom(t);
      this._roguelikeRoomType = t;
    } else if (this.mode === 'bossrush') {
      this.map.generateRoguelikeRoom('battle');
      this._bossRushIndex = (this._bossRushIndex ?? -1) + 1;
    } else {
      this.map.loadLevel(this.level - 1);
    }
    // 玩家位置
    const ps = this.map.getPlayerSpawn();
    // 保留上一关玩家属性（除血量回满）
    if (!this.player || this.level === 1) {
      this.player = new Player(ps.x, ps.y, this.selectedTank);
    } else {
      this.player.x = ps.x; this.player.y = ps.y;
      this.player.heal(this.player.maxHp * 0.4);
      this.player.pendingBulletBurst = [];
    }
    this.bullets = []; this.enemies = []; this.pickups = []; this.boss = null;
    this.bossSpawned = false;
    this.bossTimer = 0; this.bossBulletCD = 0; this.bossSpecialCD = 0;
    this.bossSpiralAngle = 0;
    this.wave = 1;

    if (this.mode === 'classic') {
      this.maxWave = 5;
      this.enemiesLeftToSpawn = 18 + this.level * 3;
      this.enemySpawnCD = 800;
    } else if (this.mode === 'survive') {
      this.maxWave = Infinity;
      this.enemiesLeftToSpawn = Infinity;
      this.surviveSpawnCD = 2500;
    } else if (this.mode === 'roguelike') {
      this._setupRoguelikeRoom();
    } else if (this.mode === 'bossrush') {
      this._scheduleBossForBossRush();
    }
    this._updateHUD();
    this._hideBossBar();
  }

  _setupRoguelikeRoom() {
    this.enemiesLeftToSpawn = 0;
    const t = this._roguelikeRoomType;
    if (t === 'battle') {
      const n = 4 + randInt(0, 4);
      for (let i = 0; i < n; i++) this._spawnRandomEnemy();
      this.maxWave = 1;
    } else if (t === 'elite') {
      const types = Object.keys(CONFIG.ENEMY_TYPES);
      const tk = pick(types.filter(k => k !== 'healer'));
      const sp = this.map.getRandomSpawn();
      this.enemies.push(new EliteEnemy(sp.x, sp.y, tk, this.level));
      this._spawnRandomEnemy(2);
      this.maxWave = 1;
    } else if (t === 'treasure') {
      // 宝箱房：无敌人，直接掉一堆道具 + Buff
      this._spawnPickupCluster(this.map.cols/2*32, this.map.rows/2*32, 5, { treasure:true });
      setTimeout(() => this._showBuffSelect('宝箱！选择一项强化'), 400);
      this.maxWave = 1;
    }
  }

  _scheduleBossForBossRush() {
    const order = ['crab','magneto','lava','ghost','apoc'];
    const bid = order[this._bossRushIndex % order.length];
    setTimeout(() => this._spawnBoss(bid), 1200);
  }

  // ============ 更新主函数 ============
  update(dt) {
    this.elapsed += dt;
    const input = this.input.getState();

    // 玩家
    this.player.update(dt, input, this.map, this.particles);
    if (input.fire) {
      const bs = this.player.tryFire(dt);
      if (bs && bs.length) {
        this.bullets.push(...bs);
        this.sound.shoot();
        for (const b of bs) {
          this.particles.muzzle(b.x - b.vx, b.y - b.vy, this.player.angle, '#fde68a');
        }
      }
    } else {
      this.player.tryFire(dt); // 让 CD 继续流
    }

    // 刷敌
    this._updateEnemySpawning(dt);

    // 敌军
    for (const e of this.enemies) {
      e.update(dt, this.player, this.map, this.particles, this.enemies);
      const bs = e.tryFire();
      if (bs && bs.length) {
        this.bullets.push(...bs);
        this.sound.enemyShoot();
      }
    }

    // Boss
    if (this.boss) this._updateBoss(dt);

    // 子弹
    for (const b of this.bullets) b.update(dt, this.map);

    // 碰撞
    this._resolveCollisions();

    // 道具
    for (const p of this.pickups) p.update(dt);

    // 粒子
    this.particles.update(dt);

    // 震动衰减
    if (this.shakeTime > 0) this.shakeTime -= dt;

    // 游戏状态推进
    this._checkLevelProgress();

    // HUD
    this._updateHUD();
  }

  _updateEnemySpawning(dt) {
    if (this.boss) return; // Boss 关不刷杂兵
    if (this.mode === 'classic') {
      if (this.enemiesLeftToSpawn > 0 && this.enemies.length < CONFIG.SPAWN.CLASSIC_MAX_ON_SCREEN) {
        this.enemySpawnCD -= dt;
        if (this.enemySpawnCD <= 0) {
          this.enemySpawnCD = 700 + Math.random()*700;
          this._spawnRandomEnemy();
          this.enemiesLeftToSpawn--;
        }
      }
    } else if (this.mode === 'survive') {
      this.surviveSpawnCD -= dt;
      if (this.surviveSpawnCD <= 0) {
        this.surviveSpawnCD = Math.max(1000, CONFIG.SPAWN.SURVIVE_INTERVAL - Math.floor(this.elapsed/20000)*500);
        const n = 1 + Math.floor(this.elapsed / 30000);
        this._spawnRandomEnemy(n);
        // 每 6 波刷 Boss
        const waveIdx = Math.floor(this.elapsed / 45000);
        if (!this.bossSpawned && waveIdx > (this._lastSurviveBossWave || -1)) {
          this._lastSurviveBossWave = waveIdx;
          this.bossSpawned = true;
          const bossKeys = ['crab','magneto','lava','ghost'];
          this._spawnBoss(bossKeys[waveIdx % bossKeys.length]);
        }
      }
    }
  }

  _spawnRandomEnemy(n=1) {
    const types = Object.keys(CONFIG.ENEMY_TYPES);
    for (let i = 0; i < n; i++) {
      const weights = { scout:5, assault:4, sniper:2, bomber:2, shield:1.5, healer:1 };
      let total = 0;
      for (const k of types) total += weights[k] || 1;
      let r = Math.random() * total;
      let tk = 'scout';
      for (const k of types) { r -= weights[k] || 1; if (r <= 0) { tk = k; break; } }
      const sp = this.map.getRandomSpawn();
      this.enemies.push(new Enemy(sp.x, sp.y, tk, this.level));
    }
  }

  // ============ Boss 管理 ============
  _updateBoss(dt) {
    const b = this.boss;
    this.bossTimer += dt;
    this.bossBulletCD -= dt;
    this.bossSpecialCD -= dt;
    this.bossSpiralAngle += dt / 180;

    // 通用：向玩家开火频率随 phase 提高
    const baseCD = 1300 - b.phase * 200;
    if (this.bossBulletCD <= 0) {
      this.bossBulletCD = Math.max(400, baseCD + rand(-200, 150));
      const patt = this._getBossPattern(b.bossId, b.phase);
      for (const b2 of patt) this.bullets.push(b2);
      this.sound.enemyShoot();
    }
    // 特殊技能
    if (this.bossSpecialCD <= 0) {
      this.bossSpecialCD = this._bossSpecialInterval(b.bossId, b.phase);
      this._bossSpecial(b.bossId, b.phase);
    }
    // 磁暴脉冲
    if (b.bossId === 'magneto' && b.phase >= 2) {
      if (!this._magPulseTimer) this._magPulseTimer = 7000;
      this._magPulseTimer -= dt;
      if (this._magPulseTimer <= 0) {
        this._magPulseTimer = 7500;
        this._triggerMagnetoPulse();
      }
    }
    // 量子幽灵瞬移
    if (b.bossId === 'ghost') {
      if (!this._ghostTeleportTimer) this._ghostTeleportTimer = 3500;
      this._ghostTeleportTimer -= dt;
      if (this._ghostTeleportTimer <= 0) {
        this._ghostTeleportTimer = 3000 + Math.random()*2000;
        this._ghostTeleport();
      }
    }

    b.update(dt, this.player, this.map, this.particles);
    this._updateBossBar();
  }

  _bossSpecialInterval(id, phase) {
    switch (id) {
      case 'crab':    return phase === 1 ? 5500 : phase === 2 ? 4200 : 3200;
      case 'magneto': return 6000;
      case 'lava':    return 5000;
      case 'ghost':   return 4500;
      case 'apoc':    return [0, 6000, 5000, 5000, 4000][phase];
      default: return 6000;
    }
  }

  _getBossPattern(id, phase) {
    const b = this.boss, px = this.player.x, py = this.player.y;
    switch (id) {
      case 'crab': {
        if (phase === 1) {
          // 双炮交替扇形
          const base = Math.atan2(py - b.y, px - b.x);
          return fanBullets(b.x, b.y, base, 3, 0.35, 3.6, b.damage, { color:'#f87171', size:7 });
        } else if (phase === 2) {
          // 环形弹幕
          return ringBullets(b.x, b.y, 8 + phase*2, 2.6, Math.round(b.damage*0.9), { color:'#fb923c' });
        } else {
          // 狂暴：双环 + 追踪混合
          const a = BossPatterns.doubleRing(b.x, b.y, Math.round(b.damage*0.8));
          const h = homingBurst(b.x, b.y, px, py, 4, 3, Math.round(b.damage));
          return a.concat(h);
        }
      }
      case 'magneto': {
        // 闪电链扇形（快 + 穿透感）
        const base = Math.atan2(py - b.y, px - b.x);
        const n = phase >= 2 ? 11 : 7;
        return fanBullets(b.x, b.y, base, n, 0.9, 4.2, Math.round(b.damage*0.9), { color:'#e879f9', pierce:1 });
      }
      case 'lava': {
        // 爆破弹
        const base = Math.atan2(py - b.y, px - b.x);
        const out = [];
        out.push(explosiveBullet(b.x, b.y, base + rand(-0.3, 0.3), 3.4, b.damage, phase === 1 ? 60 : phase === 2 ? 80 : 100));
        // 碎石飞溅
        if (phase >= 2) {
          for (let i = 0; i < 5; i++) {
            out.push(enemyBullet(b.x + rand(-b.size/3, b.size/3),
                                 b.y + rand(-b.size/3, b.size/3),
                                 rand(-Math.PI, Math.PI), 2 + Math.random()*2,
                                 Math.round(b.damage*0.4), { color:'#fb923c', size:5 }));
          }
        }
        return out;
      }
      case 'ghost': {
        return spiralBullets(b.x, b.y, this.bossSpiralAngle, 4, 3.2, Math.round(b.damage*0.9), { color:'#818cf8' });
      }
      case 'apoc': {
        if (phase === 1) {
          return BossPatterns.fanToPlayer(b.x, b.y, px, py, 7, Math.PI*0.5, b.damage*0.8, 3.8);
        } else if (phase === 2) {
          // 追踪齐射
          return homingBurst(b.x, b.y, px, py, 10, 3.2, b.damage, { color:'#f97316' });
        } else if (phase === 3) {
          // 激光（朝玩家方向直线）
          const base = Math.atan2(py - b.y, px - b.x);
          const ex = b.x + Math.cos(base) * 2000;
          const ey = b.y + Math.sin(base) * 2000;
          const bs = laserBullets(b.x + Math.cos(base)*b.size*0.5,
                                  b.y + Math.sin(base)*b.size*0.5, ex, ey, b.damage*2);
          // 主激光视觉：一发大号弹
          const main = enemyBullet(b.x, b.y, base, 12, b.damage*1.5, {
            color:'#ef4444', size: 14, life: 350, pierce: 99,
          });
          return bs.concat([main]);
        } else {
          // 自爆：疯狂 360°
          const ring = ringBullets(b.x, b.y, 24, 3.6, b.damage*0.6, { color:'#dc2626' });
          const ring2 = ringBullets(b.x, b.y, 24, 5.0, b.damage*0.5, { color:'#f59e0b', startAngle: Math.PI/24 });
          const hom = homingBurst(b.x, b.y, px, py, 6, 3.5, b.damage*0.9);
          return ring.concat(ring2, hom);
        }
      }
    }
    return BossPatterns.ringSlow(b.x, b.y, b.damage*0.8);
  }

  _bossSpecial(id, phase) {
    const b = this.boss, px = this.player.x, py = this.player.y;
    switch (id) {
      case 'crab': {
        // 召唤小兵
        this._spawnRandomEnemy(phase);
        this.shake(6, 250);
        break;
      }
      case 'magneto': {
        // 地雷
        for (let i = 0; i < 2 + phase; i++) {
          const mx = rand(100, CONFIG.CANVAS_WIDTH-100);
          const my = rand(120, CONFIG.CANVAS_HEIGHT-150);
          setTimeout(() => {
            this.bullets.push(explosiveBullet(mx, my, -Math.PI/2, 0, b.damage*1.2, 80));
            this.particles.explosion(mx, my, '#c026d3', 20, 5);
            this.sound.explosion(false);
          }, 700 + i*300);
          // 画地雷标记（用道具样式模拟）
          this.pickups.push(new _MineMarker(mx, my));
        }
        break;
      }
      case 'lava': {
        // 跳跃砸地 → 震波碎石
        b.moveTarget = { x: px, y: Math.min(py, 240) };
        setTimeout(() => {
          this.shake(18, 600);
          this.particles.explosion(b.x, b.y, '#ea580c', 40, 6);
          this.sound.explosion(true);
          // 环形震波弹
          const bs = ringBullets(b.x, b.y, 16, 2.8, Math.round(b.damage*0.6), { color:'#f97316' });
          for (const bb of bs) this.bullets.push(bb);
        }, 600);
        break;
      }
      case 'ghost': {
        // 全息投影（生成 2 个假幽灵，1 枪就碎）
        this._ghostHolograms = this._ghostHolograms || [];
        for (const h of this._ghostHolograms) h.dead = true;
        this._ghostHolograms = [];
        for (let i = 0; i < 2; i++) {
          const hx = clamp(b.x + rand(-220, 220), 120, CONFIG.CANVAS_WIDTH-120);
          const hy = clamp(b.y + rand(-140, 140), 100, 300);
          const fake = new Enemy(hx, hy, 'scout', this.level);
          fake.hp = 1; fake.maxHp = 1; fake.size = b.size*0.8;
          fake.color = '#818cf8'; fake.isHologram = true;
          fake.update = function(dt, pl, mp) {
            this.angle = Math.atan2(pl.y - this.y, pl.x - this.x);
            this._fireCD -= dt;
            if (this._fireCD <= 0) {
              this._fireCD = 1200;
              this._pendingFire = true;
            }
            this.x += Math.sin(Date.now()/600 + i + this.x*0.01) * 0.8;
            this.y += Math.cos(Date.now()/700 + i) * 0.6;
          };
          fake.draw = function(ctx) {
            ctx.save();
            ctx.globalAlpha = 0.6 + 0.25*Math.sin(Date.now()/180 + i);
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle + Math.PI/2);
            ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2;
            ctx.shadowBlur = 16; ctx.shadowColor = '#6366f1';
            ctx.beginPath(); ctx.arc(0, 0, this.size*0.55, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
          };
          this._ghostHolograms.push(fake);
          this.enemies.push(fake);
        }
        break;
      }
      case 'apoc': {
        if (phase === 1) {
          this._spawnRandomEnemy(3);
        } else if (phase === 2) {
          this.sound.bossWarn();
          setTimeout(() => {
            const burst = homingBurst(b.x, b.y, px, py, 14, 3.5, b.damage, { color:'#f97316' });
            for (const bu of burst) this.bullets.push(bu);
          }, 800);
        } else if (phase === 3) {
          // 激光充能
          this.shake(14, 800);
        } else {
          // 最终阶段：全屏弹幕警告
          this.sound.bossWarn();
        }
        break;
      }
    }
  }

  _triggerMagnetoPulse() {
    this.sound.bossWarn();
    this.shake(10, 450);
    this._magPulseEffect = { start: Date.now(), dur: 800 };
    this.player._magLockedUntil = Date.now() + 1500;
    // 绕一圈紫色电磁环子弹
    const bs = ringBullets(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, 40, 0, 0, { color:'#c026d3' });
    // 实际用粒子
    this.particles.bossWarn();
  }

  _ghostTeleport() {
    const b = this.boss;
    this.particles.explosion(b.x, b.y, '#818cf8', 25, 4);
    this.sound.bossWarn();
    const angle = Math.atan2(this.player.y - b.y, this.player.x - b.x) + Math.PI + rand(-0.6, 0.6);
    const dist = rand(220, 360);
    b.x = clamp(this.player.x + Math.cos(angle)*dist, 150, CONFIG.CANVAS_WIDTH - 150);
    b.y = clamp(this.player.y + Math.sin(angle)*dist, 80, 320);
    b.moveTarget = { x: b.x, y: b.y };
    this.particles.explosion(b.x, b.y, '#a855f7', 25, 4);
  }

  _spawnBoss(bossId) {
    this.bossSpawned = true;
    const conf = CONFIG.BOSSES[bossId];
    const b = new Boss(CONFIG.CANVAS_WIDTH/2, -conf.size, bossId);
    this.boss = b;
    this.sound.bossWarn();
    this.particles.bossWarn();
    this.shake(16, 500);
    this._showBossBar(b);
  }

  // ============ 碰撞 ============
  _resolveCollisions() {
    // 子弹 vs 地图
    for (const bu of this.bullets) {
      if (bu.dead) continue;
      const hit = Collision.bulletVsMap(bu, this.map);
      if (hit) {
        if (hit.hit) {
          if (hit.tileType === CONFIG.TILE.BASE) {
            this.map.baseDestroyed = true;
            this.shake(22, 900);
            this.particles.explosion(this.map.basePos.x, this.map.basePos.y, '#ef4444', 40, 6);
            this.sound.explosion(true);
          } else if (hit.tileType === CONFIG.TILE.BRICK || hit.tileType === CONFIG.TILE.STEEL) {
            this.particles.hit(bu.x, bu.y, '#cbd5e1');
            if (bu.bounce > 0) {
              // 简单弹射：根据速度主次翻转
              if (Math.abs(bu.vx) > Math.abs(bu.vy)) bu.vx = -bu.vx;
              else bu.vy = -bu.vy;
              bu.bounce--;
              continue;
            }
          }
          // 爆破弹爆炸
          if (bu.splash > 0) this._doExplosion(bu.x, bu.y, bu.splash, bu.damage, bu.fromPlayer);
          bu.dead = true;
        } else {
          this.particles.hit(bu.x, bu.y, '#e5e7eb');
        }
      }
    }
    // 子弹 vs 实体
    for (const bu of this.bullets) {
      if (bu.dead) continue;
      const br = { x:bu.x-bu.size*0.7, y:bu.y-bu.size*0.7, w:bu.size*1.4, h:bu.size*1.4 };
      if (bu.fromPlayer) {
        // 打敌人
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (bu.hitEntities.has(e)) continue;
          if (Collision.rect(br, e.rect)) {
            bu.hitEntities.add(e);
            const killed = e.takeDamage(bu.damage, { fire: bu.fire, ice: bu.ice });
            this.particles.hit(bu.x, bu.y, e.color);
            this.sound.hit();
            if (bu.splash > 0) this._doExplosion(bu.x, bu.y, bu.splash, bu.damage, true);
            if (killed) this._onEnemyKilled(e);
            if (bu.pierce > 0) { bu.pierce--; }
            else { bu.dead = true; break; }
          }
        }
        // 打 Boss
        if (!bu.dead && this.boss && !this.boss.dead) {
          if (Collision.circleRect(bu.x, bu.y, bu.size, this.boss.rect)) {
            if (!bu.hitEntities.has(this.boss)) {
              bu.hitEntities.add(this.boss);
              const res = this.boss.takeDamage(bu.damage, bu.x, bu.y);
              this.particles.hit(bu.x, bu.y, res.weakHit ? '#fca5a5' : this.boss.color);
              this.sound.hit();
              if (res.weakHit) { this.shake(4, 120); this._popupDamage(bu.x, bu.y, res.dmg, true); }
              else this._popupDamage(bu.x, bu.y, res.dmg, false);
              if (bu.pierce > 0) bu.pierce--;
              else bu.dead = true;
              if (res.killed) this._onBossKilled();
            }
          }
        }
      } else {
        // 敌弹打玩家
        if (!this.player._invincibleUntil || Date.now() > this.player._invincibleUntil) {
          // 磁暴锁射击：跳过伤害时的视觉
          if (Collision.circleRect(bu.x, bu.y, bu.size, this.player.rect)) {
            if (bu.splash > 0) this._doExplosion(bu.x, bu.y, bu.splash, bu.damage, false);
            else {
              const res = this.player.takeDamage(bu.damage);
              if (res) {
                this.particles.hit(this.player.x, this.player.y, res === 'shield' ? '#38bdf8' : '#ef4444');
                this.sound.playerHurt();
                this.shake(res === 'hp' ? 8 : 5, res === 'hp' ? 300 : 150);
              }
            }
            bu.dead = true;
          }
        }
      }
    }
    // 清理死亡子弹
    this.bullets = this.bullets.filter(b => !b.dead);
    // 玩家 vs 道具
    for (const p of this.pickups) {
      if (p.dead) continue;
      if (Collision.rect(this.player.rect, p.rect)) {
        const res = p.apply(this.player);
        if (res.score) this.score += res.score;
        this.sound.pickup();
        this.particles.pickup(p.x, p.y, p.color);
        p.dead = true;
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead);
    // 清理死亡敌人
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.hp <= 0) this._onEnemyKilled(e);
    }
    this.enemies = this.enemies.filter(e => !e.dead);

    // 玩家 vs 敌人 碰撞伤害
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Collision.circleRect(e.x, e.y, e.size*0.4, this.player.rect)) {
        const r = this.player.takeDamage(Math.round(e.damage*0.4));
        if (r) {
          this.sound.playerHurt();
          this.shake(5, 200);
          // 推开
          const dx = this.player.x - e.x, dy = this.player.y - e.y;
          const d = Math.sqrt(dx*dx+dy*dy)||1;
          this.player.x += dx/d * 8; this.player.y += dy/d * 8;
        }
      }
    }
    // 玩家死亡 / 基地
    if (this.player.hp <= 0) this._gameOver(false, '坦克被击毁');
    if (this.mode === 'classic' && this.map.baseDestroyed) this._gameOver(false, '基地被摧毁');
  }

  _popupDamage(x, y, dmg, weak) {
    if (!this._damagePops) this._damagePops = [];
    this._damagePops.push({ x, y: y - 12, text: '-' + Math.round(dmg), life: 700, maxLife: 700, color: weak ? '#fca5a5' : '#fef3c7' });
  }

  _doExplosion(x, y, radius, damage, fromPlayer) {
    this.particles.explosion(x, y, '#fbbf24', 22, 5);
    this.sound.explosion(false);
    this.shake(6, 200);
    const rr = radius * radius;
    if (fromPlayer) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(x, y, e.x, e.y) <= rr) {
          const k = e.takeDamage(damage);
          if (k) this._onEnemyKilled(e);
        }
      }
      if (this.boss && !this.boss.dead && dist2(x, y, this.boss.x, this.boss.y) <= (radius + this.boss.size/2) ** 2) {
        const res = this.boss.takeDamage(damage * 0.7, x, y);
        if (res.killed) this._onBossKilled();
      }
    } else {
      if (dist2(x, y, this.player.x, this.player.y) <= rr) {
        const r = this.player.takeDamage(damage);
        if (r) { this.sound.playerHurt(); this.shake(10, 300); }
      }
    }
  }

  // ============ 事件回调 ============
  _onEnemyKilled(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.score += e.score;
    this.particles.explosion(e.x, e.y, e.color, e.isElite() ? 30 : 18, 4);
    this.sound.explosion(false);
    if (e.explodeOnDeath) {
      this._doExplosion(e.x, e.y, e.explodeRadius, e.explodeDmg, false);
    }
    // 掉落
    const dropChance = e.isElite() ? 1 : 0.35;
    if (Math.random() < dropChance) {
      this._spawnRandomPickup(e.x, e.y, e.isElite());
    }
    // 全息投影清理
    if (this._ghostHolograms) {
      this._ghostHolograms = this._ghostHolograms.filter(h => h !== e);
    }
  }

  _onBossKilled() {
    if (!this.boss) return;
    const b = this.boss;
    b.dead = true;
    this.boss = null;
    this.kills++;
    this.score += 3000 + this.level * 1500;
    this.shake(28, 900);
    this.sound.explosion(true);
    this._hideBossBar();
    // 多次爆炸
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.particles.explosion(
          b.x + rand(-b.size/2, b.size/2),
          b.y + rand(-b.size/2, b.size/2),
          i === 5 ? '#ef4444' : ['#fbbf24','#f97316','#ef4444','#c026d3','#a855f7'][i],
          32, 6
        );
        this.sound.explosion(i===5);
      }, i * 180);
    }
    // 掉落大量道具
    setTimeout(() => {
      this._spawnPickupCluster(b.x, b.y, 7 + Math.floor(this.level/2));
      if (this.mode === 'classic' || this.mode === 'bossrush' || this.mode === 'roguelike') {
        this._showBuffSelect('击败 BOSS！选择强力强化');
      }
    }, 900);
    this.bossSpawned = false;
    if (this.mode === 'survive') {
      // 无尽模式：解锁下一波 Boss
    }
  }

  _spawnRandomPickup(x, y, elite=false) {
    const entries = Object.entries(CONFIG.PICKUPS);
    let total = 0;
    for (const [k,v] of entries) total += v.weight * (k === 'gem' && elite ? 3 : 1);
    let r = Math.random() * total;
    let key = 'coin';
    for (const [k,v] of entries) {
      r -= v.weight * (k === 'gem' && elite ? 3 : 1);
      if (r <= 0) { key = k; break; }
    }
    this.pickups.push(new Pickup(x + rand(-12, 12), y + rand(-12, 12), key));
  }
  _spawnPickupCluster(x, y, n=5, opts={}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 20 + (opts.treasure ? 10 : 30);
      this._spawnRandomPickup(x + Math.cos(a)*r, y + Math.sin(a)*r, opts.treasure || i === 0);
    }
  }

  // ============ 关卡推进 ============
  _checkLevelProgress() {
    // Roguelike 战斗房：清完怪给 Buff
    if (this.mode === 'roguelike' && this._roguelikeRoomType === 'battle' || this._roguelikeRoomType === 'elite') {
      if (!this._roomCleared && this.enemies.length === 0 && !this.boss && this.enemiesLeftToSpawn === 0) {
        this._roomCleared = true;
        this._showBuffSelect(this._roguelikeRoomType === 'elite' ? '精英清剿完成！' : '战斗完成！选择强化');
      }
    }
    // 经典模式：怪清空 + 无 Boss
    if (this.mode === 'classic') {
      if (this.enemies.length === 0 && !this.boss && this.enemiesLeftToSpawn === 0) {
        // 本关是否 Boss 关？
        const bossLevels = [3,5,7,9,10];
        if (bossLevels.includes(this.level) && !this.bossSpawned) {
          const idx = bossLevels.indexOf(this.level);
          const keys = ['crab','magneto','lava','ghost','apoc'];
          setTimeout(() => this._spawnBoss(keys[idx]), 1200);
          this.bossSpawned = true;
        } else if (!bossLevels.includes(this.level)) {
          // 过关 Buff
          this._showBuffSelect(`第 ${this.level} 关通过！`);
        } else {
          // Boss 关：Boss 击杀回调里给 Buff
          if (!this.boss) {
            this._nextLevel();
          }
        }
      }
    }
    if (this.mode === 'bossrush') {
      if (!this.boss && this.bossSpawned === false && this.enemies.length === 0) {
        // 刚打完 → 等 _onBossKilled 里的 buff-select，之后推进
      }
    }
  }

  _nextLevel() {
    this.level++;
    if (this.mode === 'classic' && this.level > 10) {
      // 通关
      this._gameOver(true, '全关卡通关！');
      return;
    }
    if (this.mode === 'bossrush' && (this._bossRushIndex ?? 0) >= 4) {
      this._gameOver(true, '全部 BOSS 讨伐成功！');
      return;
    }
    this._roomCleared = false;
    this._initLevel();
    this.state = 'playing';
  }

  // ============ Buff 三选一 ============
  _showBuffSelect(title='关卡完成！选择强化') {
    this.state = 'buff-select';
    // 抽 3 个
    const pool = [...CONFIG.BUFFS];
    const picks = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = randInt(0, pool.length - 1);
      picks.push(pool.splice(idx, 1)[0]);
    }
    this.pendingBuffChoices = picks;
    const el = document.getElementById('buff-select');
    const sub = document.getElementById('buff-subtitle');
    const list = document.getElementById('buff-cards');
    sub.textContent = title;
    list.innerHTML = '';
    picks.forEach((b, i) => {
      const card = document.createElement('div');
      card.className = 'buff-card';
      card.innerHTML = `
        <div class="bc-icon">${b.icon}</div>
        <div class="bc-name">${b.name}</div>
        <div class="bc-desc">${b.desc}</div>
      `;
      card.addEventListener('click', () => {
        if (this.state !== 'buff-select') return;
        b.apply(this.player);
        this.sound.buff();
        this.particles.bossWarn = this.particles.bossWarn; // no-op
        for (let i = 0; i < 3; i++) {
          this.particles.pickup(this.player.x, this.player.y, '#fbbf24');
        }
        el.classList.add('hidden');
        this.pendingBuffChoices = null;
        this._afterBuffSelected();
      });
      list.appendChild(card);
    });
    el.classList.remove('hidden');
  }
  _afterBuffSelected() {
    if (this.mode === 'classic' || this.mode === 'bossrush') this._nextLevel();
    else if (this.mode === 'roguelike') this._nextLevel();
    else this.state = 'playing';
  }

  // ============ 渲染 ============
  render() {
    const ctx = this.ctx;
    // 背景
    ctx.fillStyle = CONFIG.COLORS.BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawGrid();

    // 震动
    ctx.save();
    if (this.shakeTime > 0) {
      const s = this.shakeIntensity;
      ctx.translate((Math.random()-0.5)*s, (Math.random()-0.5)*s);
    }

    // 菜单下也要画点动画背景
    if (this.state === 'menu') {
      ctx.restore();
      return;
    }

    // 图层
    this.map.drawBottom(ctx);

    // 道具（在坦克下面）
    for (const p of this.pickups) p.draw(ctx);

    // 敌人 + Boss
    for (const e of this.enemies) e.draw(ctx);
    if (this.boss) this.boss.draw(ctx);

    // 玩家
    if (this.player) this.player.draw(ctx);

    // 子弹
    for (const b of this.bullets) b.draw(ctx);

    // 地图上层（草地遮挡）
    this.map.drawTop(ctx);

    // 粒子
    this.particles.draw(ctx);

    // 伤害数字
    this._drawDamagePops();

    // 磁暴全屏脉冲
    if (this._magPulseEffect) {
      const t = (Date.now() - this._magPulseEffect.start) / this._magPulseEffect.dur;
      if (t >= 1) this._magPulseEffect = null;
      else {
        ctx.save();
        ctx.globalAlpha = 0.5 * (1 - t);
        ctx.fillStyle = '#c026d3';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = CONFIG.COLORS.GRID;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    const s = CONFIG.TILE_SIZE;
    for (let x = 0; x <= this.canvas.width; x += s) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= this.canvas.height; y += s) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawDamagePops() {
    if (!this._damagePops) return;
    const ctx = this.ctx;
    const dt = 16;
    const out = [];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    for (const p of this._damagePops) {
      p.life -= dt;
      p.y -= 0.5;
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 6; ctx.shadowColor = p.color;
      ctx.fillText(p.text, p.x, p.y);
      out.push(p);
    }
    ctx.restore();
    this._damagePops = out;
  }

  // ============ 屏幕震动 ============
  shake(intensity, duration) {
    if (!this._settings.shake) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  // ============ HUD ============
  _updateHUD() {
    if (!this.player) return;
    const hpFill = document.getElementById('hp-fill');
    const hpTxt = document.getElementById('hp-text');
    const shFill = document.getElementById('shield-fill');
    const shTxt = document.getElementById('shield-text');
    const wave = document.getElementById('wave');
    const waveMax = document.getElementById('wave-max');
    const kills = document.getElementById('kills');
    const coins = document.getElementById('coins');
    const time = document.getElementById('time');
    const score = document.getElementById('score');
    const levelInfo = document.getElementById('level-info');
    const wname = document.getElementById('weapon-name');

    const hpr = this.player.hp / this.player.maxHp;
    hpFill.style.transform = `scaleX(${Math.max(0, hpr)})`;
    hpTxt.textContent = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}`;
    const shr = this.player.shieldCount / this.player.maxShield;
    shFill.style.transform = `scaleX(${clamp(shr,0,1)})`;
    shTxt.textContent = `护盾 ${this.player.shieldCount} / ${this.player.maxShield}`;
    wave.textContent = this.wave;
    waveMax.textContent = this.maxWave === Infinity ? '∞' : this.maxWave;
    kills.textContent = this.kills;
    coins.textContent = this.player.coins;
    time.textContent = formatTime(this.elapsed);
    score.textContent = this.score.toLocaleString();

    // 武器名叠加
    const parts = [];
    if (this.player.buffSpread>1) parts.push(`×${this.player.buffSpread}`);
    if (this.player.buffPierce>0) parts.push(`穿${this.player.buffPierce}`);
    if (this.player.buffBounce>0) parts.push(`弹${this.player.buffBounce}`);
    if (this.player.buffFire) parts.push('🔥');
    if (this.player.buffIce) parts.push('❄');
    const now = Date.now();
    if (now < this.player.tempPowerUntil) parts.push('⚡强化');
    if (now < this.player.tempSpeedUntil) parts.push('»加速');
    wname.textContent = (parts.length ? parts.join(' · ') : '标准炮');

    const modeNames = { classic:'经典闯关', survive:'无尽生存', roguelike:'Roguelike地牢', bossrush:'Boss Rush' };
    if (this.mode === 'classic' || this.mode === 'bossrush') {
      levelInfo.textContent = `第 ${this.level} 关 · ${modeNames[this.mode]}`;
    } else {
      levelInfo.textContent = `${modeNames[this.mode]}`;
    }
  }
  _showBossBar(b) {
    const bar = document.getElementById('boss-bar');
    const name = document.getElementById('boss-name');
    const phase = document.getElementById('boss-phase');
    const fill = document.getElementById('boss-fill');
    name.textContent = `◈ ${b.name} ◈`;
    phase.textContent = `阶段 1 / ${b.maxPhase}`;
    fill.style.transform = 'scaleX(1)';
    bar.classList.remove('hidden');
  }
  _updateBossBar() {
    if (!this.boss) return;
    const fill = document.getElementById('boss-fill');
    const phase = document.getElementById('boss-phase');
    fill.style.transform = `scaleX(${Math.max(0, this.boss.hpRatio())})`;
    phase.textContent = `阶段 ${this.boss.phase} / ${this.boss.maxPhase}`;
  }
  _hideBossBar() {
    document.getElementById('boss-bar').classList.add('hidden');
  }

  // ============ 暂停 / 结算 ============
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pause').classList.remove('hidden');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pause').classList.add('hidden');
    }
  }

  _gameOver(win, reason) {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = win ? 'victory' : 'gameover';
    const el = document.getElementById('gameover');
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    title.textContent = win ? '▸ 胜 利 凯 旋 ◂' : '▸ 任 务 失 败 ◂';
    title.className = win ? 'glow-green' : 'glow-red';
    detail.innerHTML = `
      <div>${win ? '🎖️ 任务完成！' : '💥 ' + reason}</div>
      <div>模式: <b>${ {classic:'经典',survive:'无尽',roguelike:'地牢',bossrush:'BossRush'}[this.mode] }</b></div>
      <div>关卡: <b>第 ${this.level} 关</b></div>
      <div>击杀: <b>${this.kills}</b></div>
      <div>金币: <b>${this.player ? this.player.coins : 0}</b></div>
      <div>分数: <b>${this.score.toLocaleString()}</b></div>
      <div>用时: <b>${formatTime(this.elapsed)}</b></div>
    `;
    el.classList.remove('hidden');
    if (win) this.sound.victory(); else this.sound.gameover();
    this._saveScore(win);
    this._refreshHighScores();
  }

  // ============ 排行榜 / 设置 ============
  _saveScore(win) {
    const mode = this.mode;
    const key = `tankbattle_${mode}_scores`;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({
      score: this.score,
      level: this.level,
      kills: this.kills,
      win: !!win,
      tank: this.selectedTank,
      date: new Date().toISOString().slice(0,16).replace('T',' '),
    });
    list.sort((a,b) => b.score - a.score);
    list.splice(10);
    localStorage.setItem(key, JSON.stringify(list));
    // 历史累计
    const totalKills = Number(localStorage.getItem('tankbattle_total_kills') || 0);
    localStorage.setItem('tankbattle_total_kills', String(totalKills + this.kills));
    // 最高分 / 最高关
    const best = Number(localStorage.getItem(`tankbattle_${mode}_highscore`) || 0);
    if (this.score > best) localStorage.setItem(`tankbattle_${mode}_highscore`, String(this.score));
    const bestLv = Number(localStorage.getItem(`tankbattle_${mode}_bestlevel`) || 0);
    if (this.level > bestLv) localStorage.setItem(`tankbattle_${mode}_bestlevel`, String(this.level));
  }

  _refreshHighScores() {
    const mode = 'classic';
    const score = Number(localStorage.getItem(`tankbattle_${mode}_highscore`) || 0);
    const level = Number(localStorage.getItem(`tankbattle_${mode}_bestlevel`) || 0);
    const kills = Number(localStorage.getItem('tankbattle_total_kills') || 0);
    const hs = document.getElementById('hs-score');
    const hl = document.getElementById('hs-level');
    const hk = document.getElementById('hs-kills');
    if (hs) hs.textContent = score.toLocaleString();
    if (hl) hl.textContent = level;
    if (hk) hk.textContent = kills.toLocaleString();
  }

  _loadSettings() {
    try {
      return Object.assign({
        sound: true,
        volume: 70,
        quality: 'high',
        shake: true,
        joystick: 'auto',
      }, JSON.parse(localStorage.getItem('tankbattle_settings') || '{}'));
    } catch (e) {
      return { sound:true, volume:70, quality:'high', shake:true, joystick:'auto' };
    }
  }
  _saveSettings() {
    localStorage.setItem('tankbattle_settings', JSON.stringify(this._settings));
  }
  _applySettings() {
    this.sound.setEnabled(this._settings.sound);
    this.sound.setVolume(this._settings.volume / 100);
    this.particles.setEnabled(this._settings.quality === 'high');
    const tc = document.getElementById('touch-controls');
    if (tc) {
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      let show = false;
      if (this._settings.joystick === 'on') show = true;
      else if (this._settings.joystick === 'off') show = false;
      else show = isTouch;
      tc.classList.toggle('hidden', !show);
    }
  }

  // ============ UI 绑定 ============
  _bindUI() {
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      // 用户首次交互激活 AudioContext
      if (this.sound && this.sound.ctx) this.sound.ctx.resume?.();
      else this.sound._ensureCtx?.();
      this._onAction(a, btn);
    });
    // 设置面板初始化
    const st = document.getElementById('sound-toggle');
    const vol = document.getElementById('volume');
    const ql = document.getElementById('quality');
    const sh = document.getElementById('shake-toggle');
    const js = document.getElementById('joystick-toggle');
    if (st) st.checked = this._settings.sound;
    if (vol) vol.value = this._settings.volume;
    if (ql) ql.value = this._settings.quality;
    if (sh) sh.checked = this._settings.shake;
    if (js) js.value = this._settings.joystick;

    // 排行榜 tab
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderLeaderboard(tab.dataset.mode);
      });
    });
    this._renderLeaderboard('classic');
  }

  _onAction(action, btn) {
    switch (action) {
      case 'tankselect': this._switchScreen('tank-select'); break;
      case 'back-menu': this._switchScreen('menu'); break;
      case 'confirm-tank':
        this.startGame('classic', this.selectedTank);
        break;
      case 'start-survive': this.startGame('survive', this.selectedTank); break;
      case 'start-roguelike': this.startGame('roguelike', this.selectedTank); break;
      case 'start-bossrush': this._bossRushIndex = -1; this.startGame('bossrush', this.selectedTank); break;
      case 'settings': this._switchScreen('settings'); break;
      case 'leaderboard': this._switchScreen('leaderboard'); this._renderLeaderboard('classic'); break;
      case 'save-settings':
        this._settings.sound = document.getElementById('sound-toggle').checked;
        this._settings.volume = Number(document.getElementById('volume').value);
        this._settings.quality = document.getElementById('quality').value;
        this._settings.shake = document.getElementById('shake-toggle').checked;
        this._settings.joystick = document.getElementById('joystick-toggle').value;
        this._saveSettings(); this._applySettings();
        this._switchScreen('menu'); break;
      case 'resume': this.togglePause(); break;
      case 'restart':
        document.getElementById('pause').classList.add('hidden');
        this.startGame(this.mode, this.selectedTank);
        break;
      case 'quit':
        document.getElementById('pause').classList.add('hidden');
        document.getElementById('gameover').classList.add('hidden');
        document.getElementById('buff-select').classList.add('hidden');
        this.state = 'menu'; this._bossRushIndex = undefined;
        this._switchScreen('menu'); break;
      case 'retry':
        document.getElementById('gameover').classList.add('hidden');
        this.startGame(this.mode, this.selectedTank);
        break;
      case 'skip-buff':
        if (this.player) this.player.coins += 100;
        document.getElementById('buff-select').classList.add('hidden');
        this._afterBuffSelected();
        break;
    }
  }

  _switchScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const id = { menu:'menu', 'tank-select':'tank-select', game:'game', settings:'settings', leaderboard:'leaderboard' }[name];
    if (id) document.getElementById(id).classList.add('active');
  }

  _renderTankCards() {
    const wrap = document.getElementById('tank-cards');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const [key, conf] of Object.entries(CONFIG.PLAYER_TYPES)) {
      const card = document.createElement('div');
      card.className = 'tank-card' + (this.selectedTank === key ? ' selected' : '');
      const cvs = document.createElement('canvas');
      cvs.width = 160; cvs.height = 80;
      this._drawTankPreview(cvs, conf.color, 28);
      const tc = document.createElement('div');
      tc.className = 'tc-preview'; tc.appendChild(cvs);
      const nm = document.createElement('div');
      nm.className = 'tc-name'; nm.style.color = conf.color; nm.textContent = conf.name;
      const st = document.createElement('div');
      st.className = 'tc-stats';
      const stars = (n,max=5) => {
        const s = Math.round(n/max*5);
        return '★'.repeat(s) + '☆'.repeat(5-s);
      };
      st.innerHTML = `
        <div class="tc-stat-row"><span>血量</span><b>${conf.hp}</b></div>
        <div class="tc-stat-row"><span>移速</span><b>${stars(conf.speed*1.2)}</b></div>
        <div class="tc-stat-row"><span>伤害</span><b>${conf.damage}</b></div>
        <div class="tc-stat-row"><span>射速</span><b>${stars(1000/conf.fireRate)}</b></div>
        <div class="tc-stat-row"><span>弹速</span><b>${stars(conf.bs)}</b></div>
      `;
      card.append(tc, nm, st);
      card.addEventListener('click', () => {
        this.selectedTank = key;
        document.querySelectorAll('.tank-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('btn-confirm-tank').disabled = false;
      });
      wrap.appendChild(card);
    }
    document.getElementById('btn-confirm-tank').disabled = !this.selectedTank;
  }

  _drawTankPreview(canvas, color, size) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tempPlayer = {
      color, size, angle: -Math.PI/2, shieldCount: 0,
      _invincibleUntil: 0, _drawTankBody: null,
    };
    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    // 复用 Player 的绘制辅助：直接构造一个临时 Player
    const p = new Player(0, 0, 'medium');
    p.color = color; p.size = size; p.maxHp = 100; p.hp = 100; p.shieldCount = 0;
    p.draw(ctx);
    ctx.restore();
  }

  _renderLeaderboard(mode) {
    const list = document.getElementById('lb-list');
    if (!list) return;
    const key = `tankbattle_${mode}_scores`;
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    if (arr.length === 0) {
      list.innerHTML = '<div class="lb-empty">暂无记录，快去挑战吧！</div>';
      return;
    }
    list.innerHTML = '';
    arr.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (i < 3 ? ` rank-${i+1}` : '');
      const rk = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i+1);
      const tname = (CONFIG.PLAYER_TYPES[it.tank] || CONFIG.PLAYER_TYPES.medium).name;
      row.innerHTML = `
        <div class="lb-rank">${rk}</div>
        <div class="lb-name">${tname} · 第${it.level}关 ${it.win ? '🏆' : ''}</div>
        <div class="lb-score">${Number(it.score).toLocaleString()}</div>
        <div class="lb-date">${(it.date||'').slice(5)}</div>
      `;
      list.appendChild(row);
    });
  }
}

// ---------- 地雷标记（临时道具式显示，1秒后自删） ----------
class _MineMarker extends Pickup {
  constructor(x, y) { super(x, y, 'hp'); this.color = '#c026d3'; this.icon = '✸'; this.life = 750; this.size = 14; }
  apply() { return {}; }
}

// ---------- 启动 ----------
window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
