// ============================================================
//  config.js - 游戏全部数值配置（调平衡只改这里）
// ============================================================
export const CONFIG = {
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 640,
  TILE_SIZE: 32,

  PLAYER_TYPES: {
    light:   { name:'猎鹰(轻)',  hp:80,  speed:3.6, damage:14, fireRate:320, bs:9,  size:26, color:'#22d3ee' },
    medium:  { name:'暴风(中)',  hp:120, speed:3.0, damage:20, fireRate:450, bs:8,  size:28, color:'#a855f7' },
    heavy:   { name:'堡垒(重)',  hp:200, speed:2.0, damage:35, fireRate:700, bs:7,  size:32, color:'#ef4444' },
    artil:   { name:'雷霆(火)',  hp:100, speed:2.2, damage:45, fireRate:900, bs:6,  size:30, color:'#fbbf24', splash:60 },
  },

  TILE: {
    EMPTY: 0, BRICK: 1, STEEL: 2, GRASS: 3,
    WATER: 4, ICE:   5, BASE:  6,
  },

  COLORS: {
    BG:      '#0a0e27',
    GRID:    '#1a1f4a',
    CYAN:    '#00f0ff',
    PURPLE:  '#a855f7',
    RED:     '#ef4444',
    YELLOW:  '#fbbf24',
    GREEN:   '#22c55e',
    BRICK:   '#b45309',
    BRICK2:  '#78350f',
    STEEL:   '#64748b',
    STEEL2:  '#334155',
    GRASS:   '#166534',
    WATER:   '#1e40af',
    ICE:     '#bae6fd',
    BASE:    '#fde047',
  },

  ENEMY_TYPES: {
    scout:   { name:'侦察', hp:40,  speed:2.6, dmg:10, fireRate:900, bs:5, size:26, color:'#f87171', score:50, ai:'chase' },
    assault: { name:'突击', hp:70,  speed:1.8, dmg:15, fireRate:700, bs:6, size:28, color:'#fb923c', score:80, ai:'chase' },
    sniper:  { name:'狙击', hp:50,  speed:1.2, dmg:25, fireRate:1500,bs:10,size:28, color:'#eab308', score:120, ai:'sniper' },
    bomber:  { name:'爆破', hp:60,  speed:1.5, dmg:20, fireRate:800, bs:5, size:28, color:'#dc2626', score:100, ai:'chase', explodeOnDeath:true, explodeRadius:70, explodeDmg:40 },
    shield:  { name:'护盾', hp:120, speed:1.4, dmg:15, fireRate:800, bs:6, size:30, color:'#38bdf8', score:150, ai:'chase', shield:80 },
    healer:  { name:'治疗', hp:50,  speed:1.5, dmg:8,  fireRate:1000,bs:5, size:28, color:'#4ade80', score:180, ai:'healer', healAmount:3, healRange:160, healRate:500 },
  },

  SPAWN: {
    CLASSIC_PER_WAVE: 4,
    CLASSIC_MAX_ON_SCREEN: 6,
    SURVIVE_INTERVAL: 4500,
  },

  BOSSES: {
    crab:    { name:'钢铁巨蟹', hp:2000, speed:1.2, dmg:18, size:96, color:'#78716c', levels:[3] },
    magneto: { name:'磁暴机甲', hp:2600, speed:1.4, dmg:22, size:92, color:'#c026d3', levels:[5] },
    lava:    { name:'熔岩巨兽', hp:3400, speed:0.9, dmg:28, size:108,color:'#ea580c', levels:[7] },
    ghost:   { name:'量子幽灵', hp:2900, speed:1.9, dmg:20, size:86, color:'#6366f1', levels:[9] },
    apoc:    { name:'天启坦克', hp:10000,speed:0.9, dmg:40, size:140,color:'#991b1b', levels:[10] },
  },

  PICKUPS: {
    hp:     { color:'#22c55e', icon:'+', weight:30, value:50 },
    shield: { color:'#38bdf8', icon:'◇', weight:15, value:1 },
    coin:   { color:'#fbbf24', icon:'$', weight:40, value:10 },
    speed:  { color:'#0ea5e9', icon:'»', weight:10, duration:10000 },
    power:  { color:'#f43f5e', icon:'★', weight:15, duration:15000 },
    gem:    { color:'#a855f7', icon:'◆', weight:8,  value:1 },
  },

  // Buff 池（三选一升级）
  BUFFS: [
    { id:'firerate', name:'疾速射击', desc:'射速 +25%', icon:'⚡', apply:(p)=>p.fireRateMul *= 0.8 },
    { id:'damage',   name:'强化弹头', desc:'伤害 +30%', icon:'💥', apply:(p)=>p.damageMul *= 1.3 },
    { id:'spread',   name:'三向散射', desc:'子弹 1→3', icon:'◈',  apply:(p)=>p.buffSpread = Math.max(p.buffSpread||1, 3) },
    { id:'pierce',   name:'穿甲强化', desc:'穿透 +2',  icon:'↯',  apply:(p)=>p.buffPierce += 2 },
    { id:'bounce',   name:'弹射弹头', desc:'弹射 +2',  icon:'↺',  apply:(p)=>p.buffBounce += 2 },
    { id:'fire',     name:'燃烧弹',   desc:'命中附加燃烧 5s', icon:'🔥', apply:(p)=>p.buffFire = true },
    { id:'ice',      name:'冰冻弹',   desc:'命中减速 50%', icon:'❄', apply:(p)=>p.buffIce = true },
    { id:'crit',     name:'暴击核心', desc:'暴击率 +20%, 暴伤 x2', icon:'✦', apply:(p)=>{p.critChance += 0.2; p.critDmgMul += 1;} },
    { id:'hp',       name:'装甲强化', desc:'血量上限 +60', icon:'♥', apply:(p)=>{p.maxHp += 60; p.hp += 60;} },
    { id:'shield',   name:'能量护盾', desc:'获得 +2 层护盾', icon:'🛡', apply:(p)=>p.shieldCount += 2 },
    { id:'speed',    name:'推进器',   desc:'移速 +20%', icon:'»»', apply:(p)=>p.speedMul *= 1.2 },
    { id:'heal',     name:'纳米修复', desc:'立即回满 HP', icon:'✚', apply:(p)=>p.hp = p.maxHp },
    { id:'multi',    name:'多重射击', desc:'额外连射 +1', icon:'❘❘❘', apply:(p)=>p.buffMulti += 1 },
    { id:'bspeed',   name:'弹道加速', desc:'弹速 +30%',  icon:'➤➤', apply:(p)=>p.bspeedMul *= 1.3 },
    { id:'splash',   name:'爆破扩展', desc:'爆炸范围 +40%', icon:'◉', apply:(p)=>p.splashMul *= 1.4 },
  ],
};
