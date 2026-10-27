/**
 * M14 无障碍服务 A11yService（表现层）
 *
 * 视觉：形状标识由渲染器默认绘制，本服务负责把"色觉增强"映射为文档类名；
 * 操作：键盘光标由输入控制器实现，本服务维护 aria-live 播报；
 * 动效：把"动效减弱"映射为文档类名，渲染器同时据此缩短动画时长；
 * 主题：把主题模式、背景色相与纯色背景映射为文档属性 / CSS 变量。
 */

import { resolveTheme } from '../core/theme.js';

export class A11yService {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.lastAnnounce = 0;
    this.live = document.createElement('div');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
    document.body.appendChild(this.live);
  }

  applySettings(settings) {
    const root = document.documentElement;
    root.classList.toggle('a11y-enhanced', Boolean(settings.colorBlindEnhanced));
    root.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    root.style.setProperty('--a11y-glyph', settings.colorBlindEnhanced ? '1.34' : '1');

    // 主题：auto 跟随系统，light / dark 手动指定
    const prefersDark =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
    root.dataset.theme = resolveTheme(settings.themeMode || 'auto', prefersDark);

    // 背景色相限制在 0~360，饱和度和明度由主题 CSS 统一控制，保证文字对比度
    const hue = Number(settings.bgHue);
    root.style.setProperty('--bg-hue', String(Number.isFinite(hue) ? Math.max(0, Math.min(360, hue)) : 36));
    document.body.classList.toggle('plain-bg', Boolean(settings.plainBg));
  }

  /** 关键状态变化播报，节流 1.2 秒，避免频繁打断读屏 */
  announce(text, force = false) {
    const now = performance.now();
    if (!force && now - this.lastAnnounce < 1200) return;
    this.lastAnnounce = now;
    this.live.textContent = text;
  }

  focusGame() {
    const canvas = document.getElementById('board');
    if (canvas) canvas.focus({ preventScroll: true });
  }
}
