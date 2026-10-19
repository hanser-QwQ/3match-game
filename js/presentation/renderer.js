/**
 * M12 渲染器 Renderer（表现层）
 *
 * Canvas 2D 绘制棋盘，逻辑坐标与渲染坐标分离：
 * 逻辑层是 0 基行列索引，渲染层负责映射为像素并在动画期间独立维护插值。
 *
 * 动画时间线由 requestAnimationFrame 驱动，每一步结算序列对应一组动画片段
 * （消除淡出 → 落位 → 补充）。当平均帧率连续低于 45 FPS 时自动降低粒子数量
 * 并简化动画时长，但绝不改变判定结果（FR-11 / NFR-02）。
 */

import { ELEMENTS, SPECIAL } from '../core/constants.js';
import { EVENTS } from '../core/events.js';

const PAD_RATIO = 0.012;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawShape(ctx, shape, cx, cy, size, color, strokeColor = null, lineWidth = 0) {
  const r = size / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72);
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - r * 1.08);
      ctx.lineTo(cx + r * 0.98, cy + r * 0.78);
      ctx.lineTo(cx - r * 0.98, cy + r * 0.78);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r * 1.12);
      ctx.lineTo(cx + r * 0.86, cy);
      ctx.lineTo(cx, cy + r * 1.12);
      ctx.lineTo(cx - r * 0.86, cy);
      ctx.closePath();
      break;
    case 'star': {
      const spikes = 5;
      const outer = r * 1.16;
      const inner = r * 0.5;
      for (let i = 0; i < spikes * 2; i += 1) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'hexagon':
    default:
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
  }
  ctx.fill();
  if (strokeColor && lineWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

export class Renderer {
  constructor(canvas, { bus = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bus = bus;
    this.board = null;
    this.view = null;
    this.cell = 40;
    this.pad = 8;
    this.fx = new Map();
    this.tweens = [];
    this.particles = [];
    this.settings = {
      reducedMotion: false,
      showGrid: true,
      colorBlindEnhanced: false,
      showCursor: true,
    };
    this.hint = null;
    this.selected = null;
    this.cursor = null;
    this.armed = null;
    this.inputLocked = false;
    this.quality = 'high';
    this._fpsSamples = [];
    this._lowStreak = 0;
    this._running = true;
    this._t0 = performance.now();

    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._onResize());
      if (canvas.parentElement) this._ro.observe(canvas.parentElement);
    }
    this._onResize();
    requestAnimationFrame(this._loop);
  }

  destroy() {
    this._running = false;
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (this.settings.reducedMotion) this.particles = [];
  }

  setBoard(board) {
    this.board = board;
    this.view = board ? board.clone() : null;
    this.fx.clear();
    this.particles = [];
    this.hint = null;
    this.selected = null;
    this.cursor = board ? { r: 0, c: 0 } : null;
    this.cursorVisible = false;
    this._onResize();
  }

  setInputLocked(value) {
    this.inputLocked = value;
  }

  setHint(move) {
    this.hint = move;
  }

  setSelected(cell) {
    this.selected = cell;
  }

  setCursor(cell, show = true) {
    this.cursor = cell;
    if (show) this.cursorVisible = true;
  }

  hideCursor() {
    this.cursorVisible = false;
  }

  setArmedTarget(id) {
    this.armed = id;
    this.canvas.style.cursor = id ? 'crosshair' : 'pointer';
  }

  /** 位置与尺寸：以父容器的可用宽度为准，保持正方形 */
  _onResize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const avail = Math.max(0, Math.min(rect.width, rect.height || rect.width));
    if (avail < 20) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssSize = avail;
    this.canvas.style.width = `${avail}px`;
    this.canvas.style.height = `${avail}px`;
    this.canvas.width = Math.round(avail * dpr);
    this.canvas.height = Math.round(avail * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pad = avail * PAD_RATIO;
    this.cell = (avail - this.pad * 2) / 8;
  }

  _fx(r, c) {
    const k = `${r},${c}`;
    let f = this.fx.get(k);
    if (!f) {
      f = { scale: 1, alpha: 1, dx: 0, dy: 0 };
      this.fx.set(k, f);
    }
    return f;
  }

  _resetFx() {
    this.fx.clear();
  }

  /** 通用补间：在渲染循环中推进，返回 Promise 便于应用层串联动画 */
  _animate(duration, onUpdate) {
    if (this.settings.reducedMotion) duration = Math.min(duration, 60);
    return new Promise((resolve) => {
      this.tweens.push({ t0: performance.now(), duration: Math.max(1, duration), onUpdate, resolve });
    });
  }

  _loop(now) {
    if (!this._running) return;
    try {
      // 推进补间
      if (this.tweens.length) {
        const remain = [];
        for (const tw of this.tweens) {
          const t = Math.min(1, (now - tw.t0) / tw.duration);
          tw.onUpdate(t);
          if (t < 1) remain.push(tw);
          else tw.resolve();
        }
        this.tweens = remain;
      }
      // 帧率采样（每 30 帧一次）
      this._fpsSamples.push(now);
      if (this._fpsSamples.length > 30) this._fpsSamples.shift();
      if (this._fpsSamples.length === 30) {
        const span = this._fpsSamples[29] - this._fpsSamples[0];
        const fps = span > 0 ? (29 * 1000) / span : 60;
        this._evaluateFps(fps);
      }
      this._updateParticles(now);
      this._draw(now);
    } catch (err) {
      // 单帧异常不能打断渲染循环：一旦循环停掉，等待中的补间永远不会 resolve，
      // 输入层就会一直处于锁定状态。
      this._errorCount = (this._errorCount || 0) + 1;
      if (this._errorCount <= 3) console.error('[renderer] 帧渲染异常', err);
      for (const tw of this.tweens) {
        try {
          tw.resolve();
        } catch {
          /* ignore */
        }
      }
      this.tweens = [];
    }
    requestAnimationFrame(this._loop);
  }

  _evaluateFps(fps) {
    if (fps < 45) {
      this._lowStreak += 1;
      if (this._lowStreak >= 2 && this.quality !== 'low') {
        this.quality = 'low';
        this.bus?.emit(EVENTS.FRAME_DROP, { fps: Math.round(fps) });
        this.bus?.emit(EVENTS.TOAST, { type: 'info', text: '已自动降低动画精度以保持流畅' });
      }
    } else {
      this._lowStreak = 0;
      if (fps > 55 && this.quality === 'low') this.quality = 'high';
    }
  }

  // ------------------------------------------------------------------ 动画接口

  async playSwap(a, b, boardAfter) {
    this.view = boardAfter.clone();
    const dc = b.c - a.c;
    const dr = b.r - a.r;
    const dist = this.cell;
    await this._animate(150, (t) => {
      this._resetFx();
      const e = easeOutCubic(t);
      const fa = this._fx(a.r, a.c);
      fa.dx = dc * dist * (1 - e);
      fa.dy = dr * dist * (1 - e);
      const fb = this._fx(b.r, b.c);
      fb.dx = -dc * dist * (1 - e);
      fb.dy = -dr * dist * (1 - e);
    });
    this._resetFx();
  }

  async playSpecialSwap(a, b, combo) {
    await this._animate(320, (t) => {
      this._resetFx();
      const pulse = 1 + Math.sin(t * Math.PI) * 0.22;
      const fa = this._fx(a.r, a.c);
      const fb = this._fx(b.r, b.c);
      fa.scale = pulse;
      fb.scale = pulse;
      fa.alpha = 1 - t * 0.7;
      fb.alpha = 1 - t * 0.7;
    });
    this._resetFx();
    if (combo) this._burst(b.c, b.r, ELEMENTS[0].color, 12);
  }

  /** 播放一段结算：消除淡出 → 落位 → 补充 */
  async playStep(step) {
    const cleared = step.cleared;
    if (cleared.length) {
      for (const cell of cleared) {
        if (!this.settings.reducedMotion && this.quality !== 'low' && Math.random() < 0.5) {
          this._spawnParticles(cell.c, cell.r, ELEMENTS[cell.type]?.color || '#fff', 2);
        }
      }
      await this._animate(170, (t) => {
        this._resetFx();
        for (const cell of cleared) {
          const f = this._fx(cell.r, cell.c);
          f.scale = 1 - easeOutCubic(t) * 0.85;
          f.alpha = 1 - t;
        }
      });
    }

    // 出现空洞后重新计算下落映射
    this.view = step.boardAfterClear.clone();
    this._resetFx();
    const fallMap = this._buildFallMap(step.boardAfterClear, step.boardAfter);
    this.view = step.boardAfter.clone();

    await this._animate(190, (t) => {
      const e = easeOutCubic(t);
      for (const [, info] of fallMap) {
        const f = this._fx(info.toRow, info.c);
        f.dy = (info.fromRow - info.toRow) * this.cell * (1 - e);
        if (info.isNew && this.settings.reducedMotion) f.alpha = 0.6 + 0.4 * t;
      }
    });
    this._resetFx();

    if (step.triggered?.length) {
      for (const k of step.triggered) {
        const [r, c] = k.split(',').map(Number);
        this._burst(c, r, '#ffe9a8', 10);
      }
    }
  }

  async playReshuffle(board) {
    await this._animate(180, (t) => {
      this._resetFx();
      if (!this.view) return;
      for (let r = 0; r < this.view.rows; r += 1) {
        for (let c = 0; c < this.view.cols; c += 1) {
          const f = this._fx(r, c);
          f.scale = 1 - 0.6 * t;
          f.alpha = 1 - 0.8 * t;
        }
      }
    });
    this.view = board.clone();
    this._resetFx();
    await this._animate(220, (t) => {
      const e = easeOutCubic(t);
      for (let r = 0; r < this.view.rows; r += 1) {
        for (let c = 0; c < this.view.cols; c += 1) {
          const f = this._fx(r, c);
          f.scale = 0.4 + 0.6 * e;
          f.alpha = e;
        }
      }
    });
    this._resetFx();
  }

  /** 下落映射：每个新格子的元素从哪一行落下；新补充的元素从段外进入 */
  _buildFallMap(holes, after) {
    const map = new Map();
    const { rows, cols } = after;
    for (let c = 0; c < cols; c += 1) {
      let r = 0;
      while (r < rows) {
        if (!holes.isFree(r, c)) {
          r += 1;
          continue;
        }
        let top = r;
        let bottom = r;
        while (bottom + 1 < rows && holes.isFree(bottom + 1, c)) bottom += 1;

        const survivors = [];
        for (let rr = top; rr <= bottom; rr += 1) {
          if (holes.typeAt(rr, c) >= 0) survivors.push(rr);
        }
        const count = survivors.length;
        const newTop = bottom - count + 1;
        survivors.forEach((oldRow, i) => {
          map.set(`${newTop + i},${c}`, { c, fromRow: oldRow, toRow: newTop + i, isNew: false });
        });
        for (let rr = top; rr < newTop; rr += 1) {
          map.set(`${rr},${c}`, { c, fromRow: top - (newTop - rr), toRow: rr, isNew: true });
        }
        r = bottom + 1;
      }
    }
    return map;
  }

  // ------------------------------------------------------------------ 粒子

  _spawnParticles(col, row, color, count) {
    if (this.settings.reducedMotion) return;
    const limit = this.quality === 'low' ? 12 : 70;
    if (this.particles.length > limit) return;
    const cx = this._x(col) + this.cell / 2;
    const cy = this._y(row) + this.cell / 2;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 380 + Math.random() * 160,
        born: performance.now(),
        color,
        size: this.cell * (0.05 + Math.random() * 0.05),
      });
    }
  }

  _burst(col, row, color, count) {
    this._spawnParticles(col, row, color, count);
  }

  _updateParticles(now) {
    if (!this.particles.length) return;
    const dt = 1 / 60;
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
    }
  }

  // ------------------------------------------------------------------ 绘制

  _x(c) {
    return this.pad + c * this.cell;
  }

  _y(r) {
    return this.pad + r * this.cell;
  }

  _draw(now) {
    const ctx = this.ctx;
    const size = this.cssSize || this.canvas.width;
    ctx.clearRect(0, 0, size, size);
    if (!this.view) return;

    // 棋盘底板
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#f7f1e6');
    bg.addColorStop(1, '#efe6d7');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, size, size, this.cell * 0.28);
    ctx.fill();

    // 网格
    if (this.settings.showGrid) {
      ctx.strokeStyle = 'rgba(90, 74, 55, 0.10)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i += 1) {
        const p = this.pad + i * this.cell;
        ctx.beginPath();
        ctx.moveTo(p, this.pad);
        ctx.lineTo(p, size - this.pad);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.pad, p);
        ctx.lineTo(size - this.pad, p);
        ctx.stroke();
      }
    }

    // 提示（新手引导第一步）
    if (this.hint) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      for (const cell of [this.hint.a, this.hint.b]) {
        ctx.save();
        ctx.strokeStyle = `rgba(216, 122, 44, ${0.45 + pulse * 0.5})`;
        ctx.lineWidth = 3 + pulse * 2;
        roundRect(ctx, this._x(cell.c) + 3, this._y(cell.r) + 3, this.cell - 6, this.cell - 6, this.cell * 0.24);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 棋子
    for (let r = 0; r < this.view.rows; r += 1) {
      for (let c = 0; c < this.view.cols; c += 1) {
        if (this.view.isBlocked(r, c)) {
          this._drawBlocked(r, c);
          continue;
        }
        const type = this.view.typeAt(r, c);
        if (type < 0) continue;
        this._drawTile(r, c, type, this.view.specialAt(r, c), this.view.iceAt(r, c), now);
      }
    }

    // 粒子上层
    for (const p of this.particles) {
      const a = 1 - (now - p.born) / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 选中框与键盘光标
    if (this.selected) this._drawRing(this.selected, 'rgba(255,255,255,0.95)', 4);
    if (this.settings.showCursor && this.cursor && this.cursorVisible) this._drawCursor(this.cursor, now);
  }

  _drawBlocked(r, c) {
    const ctx = this.ctx;
    const x = this._x(c);
    const y = this._y(r);
    ctx.fillStyle = 'rgba(120, 104, 86, 0.10)';
    roundRect(ctx, x + 4, y + 4, this.cell - 8, this.cell - 8, this.cell * 0.2);
    ctx.fill();
  }

  _tileBox(r, c) {
    const f = this._fx(r, c);
    const cx = this._x(c) + this.cell / 2 + f.dx;
    const cy = this._y(r) + this.cell / 2 + f.dy;
    const s = this.cell * 0.86 * f.scale;
    return { cx, cy, s, alpha: f.alpha, f };
  }

  _drawTile(r, c, type, special, ice, now) {
    const ctx = this.ctx;
    const el = ELEMENTS[type] || ELEMENTS[0];
    const { cx, cy, s, alpha } = this._tileBox(r, c);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const x = cx - s / 2;
    const y = cy - s / 2;
    const radius = s * 0.26;

    // 投影
    ctx.fillStyle = 'rgba(90, 68, 46, 0.16)';
    roundRect(ctx, x, y + s * 0.05, s, s, radius);
    ctx.fill();

    if (special === SPECIAL.RAINBOW) {
      const g = ctx.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.6);
      g.addColorStop(0, '#fffdf6');
      g.addColorStop(1, '#ffe9c9');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, s, s, radius);
      ctx.fill();
      ctx.strokeStyle = '#b98a3f';
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.stroke();
      // 六色环
      for (let i = 0; i < 6; i += 1) {
        const a0 = (Math.PI / 3) * i - Math.PI / 2 + now / 2600;
        ctx.beginPath();
        ctx.strokeStyle = ELEMENTS[i].color;
        ctx.lineWidth = Math.max(2, s * 0.09);
        ctx.arc(cx, cy, s * 0.34, a0, a0 + Math.PI / 4.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff8e7';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
    } else if (special === SPECIAL.BOMB) {
      const g = ctx.createLinearGradient(x, y, x + s, y + s);
      g.addColorStop(0, '#4a4652');
      g.addColorStop(1, '#25222c');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, s, s, radius);
      ctx.fill();
      ctx.strokeStyle = '#15131a';
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.stroke();
      ctx.strokeStyle = '#f0a63c';
      ctx.lineWidth = Math.max(2, s * 0.055);
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f6c463';
      drawShape(ctx, 'star', cx, cy, s * 0.36, '#f6c463');
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.18, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.34, cy - s * 0.42);
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, this._lighten(el.color, 0.16));
      g.addColorStop(1, el.color);
      ctx.fillStyle = g;
      roundRect(ctx, x, y, s, s, radius);
      ctx.fill();
      ctx.strokeStyle = el.dark;
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.stroke();

      // 顶部高光
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(ctx, x + s * 0.1, y + s * 0.08, s * 0.8, s * 0.26, s * 0.14);
      ctx.fill();

      // 条纹元素：先铺半透明条纹，再把形状标识画在最上层。
      // 顺序很关键——条纹若盖住形状，色觉玩家就分不出这块元素是什么颜色
      // （条纹元素仍然按颜色参与匹配，这一点必须可读）。
      if (special === SPECIAL.STRIPE_H || special === SPECIAL.STRIPE_V) {
        ctx.save();
        ctx.globalAlpha = 0.58;
        ctx.strokeStyle = '#fffdf5';
        ctx.lineWidth = Math.max(1.8, s * 0.06);
        ctx.lineCap = 'round';
        const n = 3;
        for (let i = 1; i <= n; i += 1) {
          const p = x + (s * i) / (n + 1);
          ctx.beginPath();
          if (special === SPECIAL.STRIPE_V) {
            ctx.moveTo(p, y + s * 0.14);
            ctx.lineTo(p, y + s * 0.86);
          } else {
            ctx.moveTo(x + s * 0.14, p);
            ctx.lineTo(x + s * 0.86, p);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // 形状标识：默认显示，是色觉障碍玩家区分元素的唯一依据
      const glyph = this.settings.colorBlindEnhanced ? s * 0.56 : s * 0.42;
      ctx.save();
      if (this.settings.colorBlindEnhanced) {
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 3;
      }
      drawShape(ctx, el.shape, cx, cy, glyph, 'rgba(255,255,255,0.96)', el.dark, Math.max(1.2, s * 0.028));
      ctx.restore();
    }

    // 冰块覆盖层
    if (ice > 0) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#cfe8f6';
      roundRect(ctx, x - s * 0.04, y - s * 0.04, s * 1.08, s * 1.08, radius * 1.15);
      ctx.fill();

      // 霜边与裂纹
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = 'rgba(255,255,255,0.98)';
      ctx.lineWidth = Math.max(2, s * 0.05);
      roundRect(ctx, x + s * 0.01, y + s * 0.01, s * 0.98, s * 0.98, radius);
      ctx.stroke();

      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1.6, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.14, y + s * 0.18);
      ctx.lineTo(x + s * 0.4, y + s * 0.44);
      ctx.lineTo(x + s * 0.26, y + s * 0.7);
      ctx.moveTo(x + s * 0.4, y + s * 0.44);
      ctx.lineTo(x + s * 0.66, y + s * 0.3);
      ctx.stroke();
      ctx.restore();

      // 冰层之上重绘形状标识：冰不能削弱元素的可辨识度（NFR-10）
      drawShape(
        ctx,
        el.shape,
        cx,
        cy,
        this.settings.colorBlindEnhanced ? s * 0.5 : s * 0.4,
        'rgba(255,255,255,0.96)',
        'rgba(28,60,80,0.62)',
        Math.max(1.6, s * 0.035)
      );

      if (ice > 1) {
        ctx.save();
        ctx.fillStyle = '#16465e';
        ctx.font = `800 ${Math.round(s * 0.3)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ice), cx + s * 0.26, cy - s * 0.26);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  _drawRing(cell, color, width) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    roundRect(ctx, this._x(cell.c) + 2, this._y(cell.r) + 2, this.cell - 4, this.cell - 4, this.cell * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  _drawCursor(cell, now) {
    const ctx = this.ctx;
    const pulse = 0.55 + 0.45 * Math.sin(now / 300);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = `rgba(43, 92, 78, ${0.55 + pulse * 0.4})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, this._x(cell.c) + 4, this._y(cell.r) + 4, this.cell - 8, this.cell - 8, this.cell * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  _lighten(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amount));
    const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amount));
    const b = Math.min(255, (n & 255) + Math.round(255 * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** 依据像素坐标反查棋盘格，供输入控制器使用 */
  cellFromPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = Math.floor((x - this.pad) / this.cell);
    const row = Math.floor((y - this.pad) / this.cell);
    if (row < 0 || col < 0 || row >= 8 || col >= 8) return null;
    return { r: row, c: col };
  }
}
