/**
 * M17 离线服务 OfflineService（基础设施层）
 *
 * 注册 Service Worker，对页面、脚本、样式、关卡 JSON 采用
 * "缓存优先、网络回源更新"策略，使已访问过的玩家在断网后可正常游玩（FR-17 / AC-18）。
 * 首次访问即断网时由页面的离线提示页兜底，不出现空白页。
 */

export class OfflineService {
  constructor({ bus = null, swPath = 'sw.js' } = {}) {
    this.bus = bus;
    this.swPath = swPath;
    this.ready = false;
    this.supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  }

  async register() {
    if (!this.supported) return { ok: false, reason: 'UNSUPPORTED' };
    try {
      // 相对路径 + 默认作用域：站点部署在子路径（如 GitHub Pages 的 /repo/）时同样成立
      const reg = await navigator.serviceWorker.register(this.swPath);
      this.ready = true;
      this.registration = reg;

      // 已经处于等待状态的新版本（上一次访问装好但没刷新）
      if (reg.waiting && navigator.serviceWorker.controller) {
        this.bus?.emit('offline:update', {});
      }

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // 首次安装时 controller 为空，不应提示"有新版本"
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            this.bus?.emit('offline:update', {});
          }
        });
      });

      return { ok: true, scope: reg.scope };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  }

  /** 有新版本时由界面触发：重新加载即可拿到新缓存 */
  applyUpdate() {
    if (typeof location === 'undefined') return;
    location.reload();
  }

  get isOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }
}
