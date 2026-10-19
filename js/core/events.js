/**
 * 极简事件总线（架构依赖规则第 4 条）。
 *
 * 存档失败、帧率下降、音效被拦截等通知类事件走总线，
 * 避免应用层与表现层相互持有引用。
 */
export class EventBus {
  constructor() {
    this._map = new Map();
  }

  on(type, handler) {
    if (!this._map.has(type)) this._map.set(type, new Set());
    this._map.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const set = this._map.get(type);
    if (set) set.delete(handler);
  }

  emit(type, payload) {
    const set = this._map.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        // 单个订阅者出错不应中断其他订阅者
        console.error(`[EventBus] handler error on "${type}"`, err);
      }
    }
  }
}

export const EVENTS = {
  SAVE_FAILED: 'save:failed',
  STORAGE_DEGRADED: 'storage:degraded',
  FRAME_DROP: 'perf:frame-drop',
  AUDIO_BLOCKED: 'audio:blocked',
  TOAST: 'ui:toast',
  LEVEL_DATA_INVALID: 'level:invalid',
  STATE_CHANGED: 'game:state',
  SESSION_UPDATED: 'game:session',
  CASCADE_START: 'game:cascade-start',
  CASCADE_STEP: 'game:cascade-step',
  CASCADE_END: 'game:cascade-end',
  LEVEL_CLEARED: 'game:level-cleared',
  LEVEL_FAILED: 'game:level-failed',
  TUTORIAL_STEP: 'tutorial:step',
  TUTORIAL_DONE: 'tutorial:done',
  BOOSTER_USED: 'game:booster-used',
  INPUT_LOCK: 'input:lock',
};
