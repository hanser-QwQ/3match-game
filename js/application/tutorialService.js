/**
 * M15 引导服务 TutorialService（应用层）
 *
 * 首关四步引导：交换 → 消除 → 目标 → 步数。
 * 每一步只提示一个操作，不出现大段文字（FR-08 / G2 / AC-12）。
 * 第一步等待玩家真正完成一次交换，其余步骤按节奏自动推进，也可点击立即跳过。
 */

import { EVENTS } from '../core/events.js';

export const TUTORIAL_STEPS = [
  { id: 'swap', anchor: 'board', text: '交换相邻的两个元素' },
  { id: 'clear', anchor: 'board', text: '三个同色连成一线就会消除' },
  { id: 'goal', anchor: 'goal', text: '这里是本关的目标' },
  { id: 'moves', anchor: 'moves', text: '每一步都会消耗一次机会' },
];

const AUTO_ADVANCE_MS = [0, 2600, 3200, 3200];

export class TutorialService {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.active = false;
    this.index = -1;
    this.timer = null;
  }

  begin() {
    if (this.active) return;
    this.active = true;
    this._go(0);
  }

  _clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  _go(index) {
    this._clearTimer();
    if (index >= TUTORIAL_STEPS.length) {
      this.finish();
      return;
    }
    this.index = index;
    const step = TUTORIAL_STEPS[index];
    this.bus?.emit(EVENTS.TUTORIAL_STEP, {
      index,
      total: TUTORIAL_STEPS.length,
      id: step.id,
      anchor: step.anchor,
      text: step.text,
    });
    const delay = AUTO_ADVANCE_MS[index];
    if (delay > 0) {
      this.timer = setTimeout(() => this.next(), delay);
    }
  }

  /** 玩家完成一次消除：第一步等待的就是这个动作 */
  notifyCascade() {
    if (!this.active) return;
    if (this.index <= 1) this._go(2);
  }

  next() {
    if (!this.active) return;
    this._go(this.index + 1);
  }

  finish() {
    this._clearTimer();
    this.active = false;
    this.index = -1;
    this.bus?.emit(EVENTS.TUTORIAL_STEP, { index: -1, done: true });
    this.bus?.emit(EVENTS.TUTORIAL_DONE, {});
  }

  stop() {
    this._clearTimer();
    this.active = false;
    this.index = -1;
    this.bus?.emit(EVENTS.TUTORIAL_STEP, { index: -1, done: true });
  }

  /** 暂停时不推进，恢复后按剩余节奏继续 */
  pause() {
    this._clearTimer();
  }

  resume() {
    if (!this.active || this.index < 0) return;
    const delay = AUTO_ADVANCE_MS[this.index];
    if (delay > 0) {
      this._clearTimer();
      this.timer = setTimeout(() => this.next(), delay);
    }
  }
}
