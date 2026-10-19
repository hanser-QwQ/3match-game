/**
 * M11 音频服务 AudioService（基础设施层）
 *
 * 全部音效在运行时用 Web Audio 合成，不使用任何外部音频文件：
 * 既满足"素材自制、无版权争议"的约束（NFR-21），也把首屏体积控制到零。
 *
 * 浏览器自动播放策略要求首次用户交互后才能播放，未解锁前只记录待播意图，
 * 不抛错、不阻塞流程（FM-09 / 调用限制第 3 条）。
 */

import { EVENTS } from '../core/events.js';

export class AudioService {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.enabled = true;
    this.volume = 0.5;
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.pendingIntent = null;
    this._lastPlay = 0;
  }

  /** 首次用户交互时调用，创建或恢复 AudioContext */
  unlock() {
    if (this.unlocked && this.ctx?.state === 'running') return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? this.volume : 0;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.unlocked = true;
      if (this.pendingIntent) {
        const intent = this.pendingIntent;
        this.pendingIntent = null;
        this.play(intent.name, intent.options);
      }
    } catch {
      this.bus?.emit(EVENTS.AUDIO_BLOCKED, {});
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this._applyGain();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    this._applyGain();
  }

  _applyGain() {
    if (!this.master || !this.ctx) return;
    const target = this.enabled ? this.volume : 0;
    try {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
    } catch {
      this.master.gain.value = target;
    }
  }

  _tone({ freq, to = null, type = 'sine', start = 0, dur = 0.12, gain = 0.3 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /**
   * @param name select | swap | invalid | clear | special | booster | win | lose | button
   * @param options.chainIndex 连锁序号，用于逐段升高音高
   */
  play(name, options = {}) {
    if (!this.enabled || this.volume <= 0) return;
    if (!this.ctx || !this.unlocked) {
      this.pendingIntent = { name, options };
      return;
    }
    // 简单节流：同一帧内大量消除音只保留前若干个
    const now = performance.now();
    if (name === 'clear' && now - this._lastPlay < 35) return;
    this._lastPlay = now;

    try {
      switch (name) {
        case 'select':
          this._tone({ freq: 720, type: 'sine', dur: 0.05, gain: 0.12 });
          break;
        case 'swap':
          this._tone({ freq: 380, to: 560, type: 'triangle', dur: 0.1, gain: 0.16 });
          break;
        case 'invalid':
          this._tone({ freq: 180, to: 120, type: 'square', dur: 0.12, gain: 0.10 });
          break;
        case 'dud':
          // 交换成立但没有形成消除：轻而短的低音，不打断节奏也不带惩罚意味
          this._tone({ freq: 210, to: 170, type: 'sine', dur: 0.1, gain: 0.07 });
          break;
        case 'clear': {
          const idx = Math.min(options.chainIndex || 1, 6);
          const freq = 440 * Math.pow(2, (idx - 1) / 6);
          this._tone({ freq, to: freq * 1.5, type: 'sine', dur: 0.16, gain: 0.18 });
          this._tone({ freq: freq * 2, type: 'triangle', start: 0.02, dur: 0.1, gain: 0.07 });
          break;
        }
        case 'special':
          this._tone({ freq: 660, to: 1320, type: 'triangle', dur: 0.18, gain: 0.16 });
          this._tone({ freq: 990, type: 'sine', start: 0.05, dur: 0.2, gain: 0.1 });
          break;
        case 'booster':
          this._tone({ freq: 520, to: 900, type: 'sawtooth', dur: 0.16, gain: 0.12 });
          break;
        case 'win': {
          const notes = [523, 659, 784, 1047];
          notes.forEach((freq, i) => this._tone({ freq, type: 'sine', start: i * 0.09, dur: 0.26, gain: 0.18 }));
          break;
        }
        case 'lose':
          this._tone({ freq: 420, to: 220, type: 'triangle', dur: 0.5, gain: 0.16 });
          break;
        case 'button':
        default:
          this._tone({ freq: 620, type: 'sine', dur: 0.04, gain: 0.1 });
          break;
      }
    } catch {
      /* 音频异常不得影响游戏流程 */
    }
  }
}
