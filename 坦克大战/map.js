// ============================================================
//  map.js - 关卡地图数据 + GameMap 类
//  图例: . 空地  B 砖墙  S 钢墙  G 草地  W 水域  I 冰面  X 基地  E 敌出生点
// ============================================================
import { CONFIG } from './config.js';
import { clamp, rand, randInt } from './systems.js';

const T = CONFIG.TILE;
const TS = CONFIG.TILE_SIZE;

// 关卡地图（每关 20 行 × 30 列 = 640×960px）
export const LEVEL_MAPS = [
  // ---- Level 1 新手关：简单对称 + 中央基地通道 ----
  [
    "..............................",
    "..BBB....BBBB....BBBB....BBB..",
    "..BBB....BBBB....BBBB....BBB..",
    "..............................",
    "..E....SS..GG..BB..GG..SS..E..",
    ".......SS..GG..BB..GG..SS.....",
    "..............................",
    "..BBBB......WWWW......BBBB....",
    "..BBBB......WWWW......BBBB....",
    "............WWWW..............",
    "..GGGG..............GGGG......",
    "..GGGG..BBBB..BBBB..GGGG......",
    ".........BBB....BBB...........",
    ".........B.BX B.B.............",
    "...........BBBB...............",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 2 砖墙迷宫 + 散点敌 ----
  [
    "..............................",
    ".BBBBB.BBBBBB.BBBBBB.BBBBBB...",
    ".BBBBB.BBBBBB.BBBBBB.BBBBBB..E",
    "..............................",
    "..B..GG.BB.SS.BB.SS.BB.GG.B...",
    "..B..GG.BB.SS.BB.SS.BB.GG.B...",
    "..............................",
    ".E..B.WWW.BBBBBBBB.WWW.B....E.",
    "....B.WWW.BBBBBBBB.WWW.B......",
    "..............................",
    "..B.IIII..............IIII.B..",
    "..B.IIII..BB......BB..IIII.B..",
    "..............................",
    "..B..BBB..BB..BB..BB..BBB..B..",
    "..B..BBB..BB.BXBB.BB..BBB..B..",
    "...........BB.BBBBB...........",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 3 第一个 Boss 前置关 ----
  [
    "..............................",
    ".SSSS.SSSS.SSSS.SSSS.SSSS.SSSS",
    ".SSSS.SSSS.SSSS.SSSS.SSSS.SSSS",
    "..............................",
    ".E.BBB.GGGG.BBBB.GGGG.BBBB..E.",
    "...BBB.GGGG.BBBB.GGGG.BBBB....",
    "..............................",
    ".WWWW..BB..SS..BB..SS..BB.WWWW",
    ".WWWW..BB..SS..BB..SS..BB.WWWW",
    "..............................",
    ".GG.BBBBBB.II.II.II.BBBBBB.GG.",
    ".GG.BBBBBB.II.II.II.BBBBBB.GG.",
    "..............................",
    "...SS..B..BBBBBBBB..B..SS.....",
    "...SS..B..BBBX BBB..B..SS.....",
    ".........BB.BBBBBB............",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 4 双水域 + 大量草地 ----
  [
    "..............................",
    "..GGGGGGGG..BBBB..GGGGGGGGG...",
    "..GGGGGGGG..BBBB..GGGGGGGGG..E",
    "..............................",
    ".B.WWWWW.BB.SSSS.BB.WWWWWW.B..",
    ".B.WWWWW.BB.SSSS.BB.WWWWWW.B..",
    "..............................",
    ".E..BB..GG.IIII.IIII.GG.BB...E",
    "....BB..GG.IIII.IIII.GG.BB....",
    "..............................",
    "..BBBB..B.GGGGGGGGGG.B.BBBB...",
    "..BBBB..B.GGGGGGGGGG.B.BBBB...",
    "..............................",
    ".SS..BB..BB..BB..BB..BB..BB.SS",
    ".SS..BB..BB..BXBB.BB..BB..BB.SS",
    ".........BB..BBBBBB.BB........",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 5 冰面迷宫 + Boss ----
  [
    "..............................",
    ".BB.IIIIIIII.SSSS.IIIIIIII.BB.",
    ".BB.IIIIIIII.SSSS.IIIIIIII.BBE",
    "..............................",
    ".E..BB.GGGG.BBBB.BBBB.GGGG.BB.",
    "....BB.GGGG.BBBB.BBBB.GGGG.BB.",
    "..............................",
    ".WWWWW.BB.SSSS.SSSS.SSSS.WWWWW",
    ".WWWWW.BB.SSSS.SSSS.SSSS.WWWWW",
    "..............................",
    ".GG.IIII..BBBB..BBBB..IIII.GG.",
    ".GG.IIII..BBBB..BBBB..IIII.GGE",
    "..............................",
    ".BB..B.BB.BBBBBBBBBB.BB.B..BB.",
    ".BB..B.BB.BBBXBB BBBB.BB.B..BB",
    ".........BBBBBBBBBBB..........",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 6 ----
  [
    "..............................",
    ".SSSS..BBBBBB..GGGG..BBBBBB.E.",
    ".SSSS..BBBBBB..GGGG..BBBBBB...",
    "..............................",
    ".B.WWW.BB.SS.BBBB.SS.BB.WWW.B.",
    ".B.WWW.BB.SS.BBBB.SS.BB.WWW.BE",
    "..............................",
    ".E..GG.II..BBBBBB..II.GG.....E",
    "....GG.II..BBBBBB..II.GG......",
    "..............................",
    "..BBBB..B.WWWWWWWW.B..BBBB....",
    "..BBBB..B.WWWWWWWW.B..BBBB....",
    "..............................",
    ".SS..BB.GG..BBBB..GG.BB..SS...",
    ".SS..BB.GG..BXB B..GG.BB..SS..",
    "...........BBBBBB.............",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 7 Boss Lava 前置 ----
  [
    "..............................",
    ".BB.GGGGG.SSSS.SSSS.GGGGG.BB.E",
    ".BB.GGGGG.SSSS.SSSS.GGGGG.BB..",
    "..............................",
    ".WWWW.BB.IIII.IIII.IIII.BB.WWW",
    ".WWWW.BB.IIII.IIII.IIII.BB.WWW",
    "E............................E",
    "..BB.SS..GGGGGGGGGG..SS.BB....",
    "..BB.SS..GGGGGGGGGG..SS.BB....",
    "..............................",
    ".GGGG..WWWWW.BBBB.WWWWW..GGGG.",
    ".GGGG..WWWWW.BBBB.WWWWW..GGGG.",
    "..............................",
    "..BB..B.SS.BBBBBBBB.SS.B..BB..",
    "..BB..B.SS.BBXB BBB.SS.B..BB..",
    ".........BBBBBBBBBB...........",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 8 ----
  [
    "..............................",
    ".SSSS.IIIIII.BBBB.IIIIII.SSSSE",
    ".SSSS.IIIIII.BBBB.IIIIII.SSSS.",
    "..............................",
    "..B.WWWW.GG.SSSS.SSSS.GG.WWWW.B",
    "E.B.WWWW.GG.SSSS.SSSS.GG.WWWW.B",
    "..............................",
    "..BBBB..II..BBBBBB..II..BBBB..",
    "E.BBBB..II..BBBBBB..II..BBBB..E",
    "..............................",
    ".GGGGG.WWWW.BBBB.WWWW.GGGGG...",
    ".GGGGG.WWWW.BBBB.WWWW.GGGGG..E",
    "..............................",
    ".B..BB.GG.SS.BBBBB.SS.GG.BB..B",
    ".B..BB.GG.SS.BBXBBB.SS.GG.BB.B",
    "............BBBBBBB...........",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 9 Boss Ghost 前置 ----
  [
    "..............................",
    ".BB.SSSS.GGGG.BBBB.GGGG.SSSS.BE",
    ".BB.SSSS.GGGG.BBBB.GGGG.SSSS.B.",
    "..............................",
    ".WWWW.IIII.BB.SS.BB.IIII.WWWWW",
    ".WWWW.IIII.BB.SS.BB.IIII.WWWWWE",
    "..............................",
    "..GG.BB.WWW.BBBBBB.WWW.BB.GG..",
    "E.GG.BB.WWW.BBBBBB.WWW.BB.GG..E",
    "..............................",
    "..IIII.SSS.GGGGGGG.SSS.IIII...",
    "..IIII.SSS.GGGGGGG.SSS.IIII..E",
    "..............................",
    "SS.BB.GG..BBBBBBBBB..GG.BB.SS.",
    "SS.BB.GG..BBBBXBBBB..GG.BB.SS.",
    "...........BBBBBBB............",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
  // ---- Level 10 最终 Boss 天启 ----
  [
    "..............................",
    ".SSSSS.SSSSS.BBBBB.SSSSS.SSSSS",
    ".SSSSS.SSSSS.BBBBB.SSSSS.SSSSSE",
    "..............................",
    ".B.GGGG.WWWW.IIII.WWWW.GGGG.B.",
    ".B.GGGG.WWWW.IIII.WWWW.GGGG.BE",
    "..............................",
    ".WW.BB.SSSS.BBBBBB.SSSS.BB.WWW",
    "EWW.BB.SSSS.BBBBBB.SSSS.BB.WWWE",
    "..............................",
    ".GG.IIII.WWWW.BBBB.WWWW.IIII.G",
    ".GG.IIII.WWWW.BBBB.WWWW.IIII.GE",
    "..............................",
    ".BB.SS.GG..BBBBBBBB..GG.SS.BB.",
    "EBB.SS.GG..BBBBXBBB..GG.SS.BB.E",
    "............BBBBBBB............",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
  ],
];

// 字符 → 瓦片类型
function charToTile(c) {
  switch (c) {
    case 'B': return T.BRICK;
    case 'S': return T.STEEL;
    case 'G': return T.GRASS;
    case 'W': return T.WATER;
    case 'I': return T.ICE;
    case 'X': return T.BASE;
    default:  return T.EMPTY;
  }
}

export class GameMap {
  constructor() {
    this.cols = 30;
    this.rows = 20;
    this.grid = [];        // grid[row][col]
    this.enemySpawns = []; // [{x,y}]
    this.basePos = null;   // {x,y,col,row}
    this.baseDestroyed = false;
    // 预渲染的静态层
    this._bottomCanvas = document.createElement('canvas');
    this._bottomCanvas.width = this.cols * TS;
    this._bottomCanvas.height = this.rows * TS;
    this._topCanvas = document.createElement('canvas');
    this._topCanvas.width = this.cols * TS;
    this._topCanvas.height = this.rows * TS;
    this._dirtyBottom = true;
    this._dirtyTop = true;
  }

  loadLevel(index) {
    const map = LEVEL_MAPS[Math.min(index, LEVEL_MAPS.length - 1)] || LEVEL_MAPS[0];
    this.grid = [];
    this.enemySpawns = [];
    this.baseDestroyed = false;
    this.basePos = null;

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const line = map[r] || '.'.repeat(this.cols);
      for (let c = 0; c < this.cols; c++) {
        const ch = line[c] || '.';
        if (ch === 'E') {
          this.enemySpawns.push({
            x: c * TS + TS/2,
            y: r * TS + TS/2,
          });
          row.push(T.EMPTY);
        } else if (ch === 'X') {
          this.basePos = { col:c, row:r, x:c*TS+TS/2, y:r*TS+TS/2 };
          row.push(T.BASE);
        } else {
          row.push(charToTile(ch));
        }
      }
      this.grid.push(row);
    }
    // 若地图没标敌出生点，默认加顶部3个
    if (this.enemySpawns.length === 0) {
      this.enemySpawns.push({ x: TS*2, y: TS*1.5 });
      this.enemySpawns.push({ x: this.cols*TS - TS*2, y: TS*1.5 });
      this.enemySpawns.push({ x: (this.cols/2)*TS, y: TS*1.5 });
    }
    this._dirtyBottom = true;
    this._dirtyTop = true;
  }

  // Roguelike 模式：程序化生成简单房间地图
  generateRoguelikeRoom(roomType='battle') {
    this.grid = [];
    this.enemySpawns = [];
    this.baseDestroyed = false;
    this.basePos = null;
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        // 外围框
        if (r === 0 || r === this.rows-1 || c === 0 || c === this.cols-1) {
          row.push(Math.random() < 0.7 ? T.STEEL : T.BRICK);
        } else {
          // 随机地形块
          const rand = Math.random();
          if (rand < 0.08) row.push(T.BRICK);
          else if (rand < 0.10) row.push(T.STEEL);
          else if (rand < 0.14) row.push(T.GRASS);
          else if (rand < 0.16) row.push(T.WATER);
          else if (rand < 0.18) row.push(T.ICE);
          else row.push(T.EMPTY);
        }
      }
      this.grid.push(row);
    }
    // 底部玩家出生区清空 + 中心区清空
    this.clearRect(this.cols/2-2, this.rows-4, 4, 3);
    this.clearRect(this.cols/2-3, this.rows/2-2, 6, 4);

    // 敌军出生点（顶部3个）
    this.enemySpawns.push({ x: TS*2, y: TS*2 });
    this.enemySpawns.push({ x: (this.cols-2)*TS, y: TS*2 });
    this.enemySpawns.push({ x: (this.cols/2)*TS, y: TS*2 });
    this._dirtyBottom = true;
    this._dirtyTop = true;
  }

  clearRect(col, row, w, h) {
    col = Math.floor(col); row = Math.floor(row);
    for (let r = row; r < row+h && r < this.rows; r++) {
      for (let c = col; c < col+w && c < this.cols; c++) {
        if (r>=0 && c>=0) this.grid[r][c] = T.EMPTY;
      }
    }
  }

  getTile(col, row) {
    if (col<0||col>=this.cols||row<0||row>=this.rows) return T.STEEL;
    return this.grid[row][col];
  }
  setTile(col, row, v) {
    if (col<0||col>=this.cols||row<0||row>=this.rows) return;
    if (this.grid[row][col] === T.BASE && v !== T.BASE) {
      this.baseDestroyed = true;
    }
    this.grid[row][col] = v;
    this._dirtyBottom = true;
    this._dirtyTop = true;
  }
  getTileAt(px, py) {
    const col = Math.floor(px / TS);
    const row = Math.floor(py / TS);
    return this.getTile(col, row);
  }
  setTileAt(px, py, v) {
    const col = Math.floor(px / TS);
    const row = Math.floor(py / TS);
    this.setTile(col, row, v);
  }

  // 检查某 AABB 矩形是否与不可通行瓦片重叠
  isBlocked(rect) {
    const c1 = Math.max(0, Math.floor(rect.x / TS));
    const c2 = Math.min(this.cols-1, Math.floor((rect.x+rect.w-1) / TS));
    const r1 = Math.max(0, Math.floor(rect.y / TS));
    const r2 = Math.min(this.rows-1, Math.floor((rect.y+rect.h-1) / TS));
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const t = this.grid[r][c];
        if (t === T.BRICK || t === T.STEEL || t === T.WATER || t === T.BASE) return true;
      }
    }
    return false;
  }

  // 冰面检测（打滑用）
  isOnIce(px, py) {
    return this.getTileAt(px, py) === T.ICE;
  }

  // ---------- 绘制 ----------
  _renderBottom() {
    const ctx = this._bottomCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._bottomCanvas.width, this._bottomCanvas.height);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c];
        const x = c * TS, y = r * TS;
        if (t === T.BRICK) this._drawBrick(ctx, x, y);
        else if (t === T.STEEL) this._drawSteel(ctx, x, y);
        else if (t === T.WATER) this._drawWater(ctx, x, y);
        else if (t === T.ICE) this._drawIce(ctx, x, y);
        else if (t === T.BASE) this._drawBase(ctx, x, y);
      }
    }
    this._dirtyBottom = false;
  }

  _renderTop() {
    const ctx = this._topCanvas.getContext('2d');
    ctx.clearRect(0, 0, this._topCanvas.width, this._topCanvas.height);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === T.GRASS) {
          this._drawGrass(ctx, c * TS, r * TS);
        }
      }
    }
    this._dirtyTop = false;
  }

  _drawBrick(ctx, x, y) {
    const s = TS;
    ctx.fillStyle = CONFIG.COLORS.BRICK2;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = CONFIG.COLORS.BRICK;
    // 2×3 砖块排列
    const w = s/2, h = s/3;
    for (let j = 0; j < 3; j++) {
      const offset = (j % 2 === 0) ? 0 : w/2;
      for (let i = -1; i < 3; i++) {
        const bx = x + i*w + offset;
        const by = y + j*h;
        if (bx + w - 1 > x && bx < x + s) {
          ctx.fillRect(bx + 1, by + 1, w - 2, h - 2);
        }
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  _drawSteel(ctx, x, y) {
    const s = TS;
    ctx.fillStyle = CONFIG.COLORS.STEEL2;
    ctx.fillRect(x, y, s, s);
    // 渐变 + 十字纹
    const grad = ctx.createLinearGradient(x, y, x+s, y+s);
    grad.addColorStop(0, CONFIG.COLORS.STEEL);
    grad.addColorStop(0.5, '#94a3b8');
    grad.addColorStop(1, CONFIG.COLORS.STEEL2);
    ctx.fillStyle = grad;
    ctx.fillRect(x+1, y+1, s-2, s-2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + s/2, y+2); ctx.lineTo(x + s/2, y+s-2);
    ctx.moveTo(x+2, y + s/2); ctx.lineTo(x+s-2, y + s/2);
    ctx.stroke();
    // 四个铆钉
    ctx.fillStyle = '#cbd5e1';
    [[2,2],[s-3,2],[2,s-3],[s-3,s-3]].forEach(([dx,dy]) => {
      ctx.fillRect(x+dx, y+dy, 2, 2);
    });
  }

  _drawGrass(ctx, x, y) {
    const s = TS;
    ctx.fillStyle = CONFIG.COLORS.GRASS;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#15803d';
    for (let i = 0; i < 18; i++) {
      const gx = x + Math.random() * s;
      const gy = y + Math.random() * s;
      ctx.fillRect(gx, gy, 1.5, 4 + Math.random()*3);
    }
    ctx.fillStyle = '#22c55e';
    for (let i = 0; i < 10; i++) {
      const gx = x + Math.random() * s;
      const gy = y + Math.random() * s;
      ctx.fillRect(gx, gy, 1, 3);
    }
  }

  _drawWater(ctx, x, y) {
    const s = TS;
    const t = (Date.now() / 1000);
    ctx.fillStyle = CONFIG.COLORS.WATER;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const yy = y + 8 + i * 10 + Math.sin(t*2 + x*0.1 + i) * 2;
      ctx.moveTo(x + 3, yy);
      ctx.bezierCurveTo(x + s*0.3, yy-3, x + s*0.7, yy+3, x + s-3, yy);
      ctx.stroke();
    }
  }

  _drawIce(ctx, x, y) {
    const s = TS;
    const grad = ctx.createLinearGradient(x, y, x, y+s);
    grad.addColorStop(0, '#e0f2fe');
    grad.addColorStop(1, CONFIG.COLORS.ICE);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    // 裂纹
    ctx.beginPath();
    ctx.moveTo(x + s*0.3, y + 4);
    ctx.lineTo(x + s*0.4, y + s*0.5);
    ctx.lineTo(x + s*0.2, y + s - 6);
    ctx.moveTo(x + s*0.6, y + 6);
    ctx.lineTo(x + s*0.7, y + s*0.6);
    ctx.lineTo(x + s*0.85, y + s - 8);
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 4, y + 4, 6, 2);
    ctx.fillRect(x + s - 12, y + s - 10, 4, 2);
  }

  _drawBase(ctx, x, y) {
    const s = TS;
    if (this.baseDestroyed) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x+4, y+4); ctx.lineTo(x+s-4, y+s-4);
      ctx.moveTo(x+s-4, y+4); ctx.lineTo(x+4, y+s-4);
      ctx.stroke();
      return;
    }
    // 外框
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x+1, y+1, s-2, s-2);
    // 鹰形图标（用几何图形简化）
    ctx.fillStyle = CONFIG.COLORS.BASE;
    ctx.shadowColor = CONFIG.COLORS.BASE;
    ctx.shadowBlur = 8;
    // 底座
    ctx.fillRect(x + 6, y + s - 9, s - 12, 4);
    // 身体
    ctx.beginPath();
    ctx.moveTo(x + s/2, y + 4);
    ctx.lineTo(x + s - 8, y + s - 10);
    ctx.lineTo(x + s/2, y + s - 14);
    ctx.lineTo(x + 8, y + s - 10);
    ctx.closePath();
    ctx.fill();
    // 眼睛
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(x + s/2, y + s/2, 1.8, 0, Math.PI*2); ctx.fill();
  }

  // 是否需要重绘水（每帧动画）
  drawBottom(ctx) {
    if (this._dirtyBottom) this._renderBottom();
    ctx.drawImage(this._bottomCanvas, 0, 0);
    // 水单独重绘（动画）
    const now = Date.now();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === T.WATER) {
          this._drawWater(ctx, c*TS, r*TS);
        }
        if (this.grid[r][c] === T.BASE) {
          this._drawBase(ctx, c*TS, r*TS);
        }
      }
    }
  }
  drawTop(ctx) {
    if (this._dirtyTop) this._renderTop();
    ctx.drawImage(this._topCanvas, 0, 0);
  }
  draw(ctx) {
    this.drawBottom(ctx);
    this.drawTop(ctx);
  }

  // 获取一个随机敌出生点
  getRandomSpawn() {
    if (this.enemySpawns.length === 0) {
      return { x: rand(TS*2, CONFIG.CANVAS_WIDTH - TS*2), y: TS*2 };
    }
    return this.enemySpawns[randInt(0, this.enemySpawns.length - 1)];
  }

  // 玩家出生点
  getPlayerSpawn() {
    return { x: CONFIG.CANVAS_WIDTH / 2, y: CONFIG.CANVAS_HEIGHT - TS*2 };
  }
}
