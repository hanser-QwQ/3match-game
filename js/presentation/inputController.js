/**
 * M13 输入控制器 InputController（表现层）
 *
 * 把触控、鼠标、键盘事件归一化为语义动作（选择格、交换请求、暂停、使用道具），
 * 不直接改棋盘，也不判断规则是否成立。
 *
 * 触控：点选 + 点相邻格交换，或直接拖动到相邻格。
 * 键盘：方向键移动光标，空格或回车确认，Esc 暂停（NFR-11 / AC-17）。
 */

export class InputController {
  constructor({ canvas, renderer, controller, bus = null }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.controller = controller;
    this.bus = bus;
    this.selected = null;
    this.drag = null;
    this._down = this._onPointerDown.bind(this);
    this._move = this._onPointerMove.bind(this);
    this._up = this._onPointerUp.bind(this);
    this._key = this._onKeyDown.bind(this);
  }

  attach() {
    this.canvas.addEventListener('pointerdown', this._down);
    this.canvas.addEventListener('pointermove', this._move);
    this.canvas.addEventListener('pointerup', this._up);
    this.canvas.addEventListener('pointercancel', this._up);
    window.addEventListener('keydown', this._key);
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this._down);
    this.canvas.removeEventListener('pointermove', this._move);
    this.canvas.removeEventListener('pointerup', this._up);
    this.canvas.removeEventListener('pointercancel', this._up);
    window.removeEventListener('keydown', this._key);
  }

  get locked() {
    const s = this.controller.session;
    return this.controller.busy || this.controller.introOpen || !s || s.state !== 'in_progress';
  }

  clearSelection() {
    this.selected = null;
    this.renderer.setSelected(null);
  }

  _onPointerDown(event) {
    const cell = this.renderer.cellFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });

    const session = this.controller.session;
    if (!session || session.state !== 'in_progress') return;
    // EX 追加机制弹窗打开时，弹窗会挡住画布；这里再兜底一次
    if (this.controller.introOpen) return;

    /*
     * 连锁结算动画期间只更新选中格，不消费这次点击。
     * 之前在这里直接 return，玩家的下一次点击会被静默丢弃，
     * 看起来就像"棋盘不动了"。
     */
    if (this.controller.busy) {
      this.selected = cell;
      this.renderer.setSelected(cell);
      return;
    }

    // 需要选目标的道具：点哪里用哪里
    if (this.controller.boosterArmed) {
      this.controller.dispatch({
        type: 'USE_BOOSTER',
        boosterId: this.controller.boosterArmed,
        target: cell,
      });
      return;
    }

    if (this.selected) {
      const same = this.selected.r === cell.r && this.selected.c === cell.c;
      if (same) {
        this.clearSelection();
        return;
      }
      const adjacent = Math.abs(this.selected.r - cell.r) + Math.abs(this.selected.c - cell.c) === 1;
      if (adjacent) {
        const from = this.selected;
        this.clearSelection();
        this.controller.dispatch({ type: 'SWAP', from, to: cell });
        return;
      }
    }

    this.selected = cell;
    this.renderer.setSelected(cell);
    this.renderer.setCursor(cell, false);
    this.drag = { cell, x: event.clientX, y: event.clientY, fired: false };
  }

  _onPointerMove(event) {
    if (!this.drag || this.locked) return;
    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    const threshold = Math.max(12, this.renderer.cell * 0.42);
    if (Math.hypot(dx, dy) < threshold) return;

    const from = this.drag.cell;
    const to = Math.abs(dx) > Math.abs(dy)
      ? { r: from.r, c: from.c + (dx > 0 ? 1 : -1) }
      : { r: from.r + (dy > 0 ? 1 : -1), c: from.c };

    if (to.r < 0 || to.c < 0 || to.r > 7 || to.c > 7) {
      this.drag = null;
      return;
    }
    this.drag = null;
    this.clearSelection();
    this.controller.dispatch({ type: 'SWAP', from, to });
  }

  _onPointerUp() {
    this.drag = null;
  }

  _onKeyDown(event) {
    const scene = document.querySelector('[data-scene="game"].active');
    if (!scene) return;
    // 结算页会保留棋盘作为背景，但键盘操作应交给结算页处理
    if (document.querySelector('[data-scene="result"].active')) return;
    const s = this.controller.session;
    if (!s) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      // 关卡说明打开时，Esc 先收起说明，不要直接暂停到说明背后
      if (this.controller.introOpen) {
        this.bus?.emit('ui:intro-close', {});
        return;
      }
      if (s.state === 'paused') this.bus?.emit('ui:resume-request', {});
      else this.bus?.emit('ui:pause-request', {});
      return;
    }

    if (s.state !== 'in_progress' || this.controller.busy || this.controller.introOpen) return;

    const cursor = this.renderer.cursor || { r: 0, c: 0 };
    const moves = {
      ArrowUp: { r: -1, c: 0 },
      ArrowDown: { r: 1, c: 0 },
      ArrowLeft: { r: 0, c: -1 },
      ArrowRight: { r: 0, c: 1 },
    };

    if (moves[event.key]) {
      event.preventDefault();
      const next = {
        r: Math.min(7, Math.max(0, cursor.r + moves[event.key].r)),
        c: Math.min(7, Math.max(0, cursor.c + moves[event.key].c)),
      };
      this.renderer.setCursor(next, true);
      return;
    }

    if (this.controller.boosterArmed) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        const target = this.renderer.cursor;
        if (target) {
          this.controller.dispatch({
            type: 'USE_BOOSTER',
            boosterId: this.controller.boosterArmed,
            target: { ...target },
          });
        }
      }
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const target = this.renderer.cursor;
      if (!target) return;
      if (!this.selected) {
        this.selected = { ...target };
        this.renderer.setSelected(this.selected);
        this.controller.audio.play('select');
        return;
      }
      const adjacent = Math.abs(this.selected.r - target.r) + Math.abs(this.selected.c - target.c) === 1;
      if (adjacent) {
        const from = this.selected;
        this.clearSelection();
        this.controller.dispatch({ type: 'SWAP', from, to: { ...target } });
      } else {
        this.selected = { ...target };
        this.renderer.setSelected(this.selected);
      }
    }
  }
}
