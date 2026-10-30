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

  /**
   * 有新版本时由界面触发。
   *
   * 不能直接 location.reload()：旧 Service Worker 可能仍在控制页面，
   * 缓存优先策略会继续返回旧脚本。这里先等待新 Worker 安装/激活，
   * 再带查询参数重新进入，绕开 HTML 的 HTTP 缓存。
   */
  async applyUpdate() {
    if (typeof location === 'undefined') return;

    const hardReload = () => {
      try {
        const url = new URL(location.href);
        url.searchParams.set('_r', Date.now().toString(36));
        location.replace(url.toString());
      } catch {
        location.reload();
      }
    };

    if (!this.supported) {
      hardReload();
      return;
    }

    let reg = this.registration;
    if (!reg) {
      try {
        reg = await navigator.serviceWorker.getRegistration();
      } catch {
        reg = null;
      }
    }
    if (!reg) {
      hardReload();
      return;
    }

    const waitForController = (ms) => new Promise((resolve) => {
      if (!navigator.serviceWorker.controller) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve(value);
      };
      const onChange = () => finish(true);
      const timer = setTimeout(() => finish(false), ms);
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
    });

    const askWaitingToActivate = () => {
      if (!reg.waiting) return false;
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    };

    let sawUpdate = askWaitingToActivate();

    if (!sawUpdate) {
      try {
        await reg.update();
      } catch {
        /* 离线或更新检查失败时走下面的兜底 */
      }
      sawUpdate = askWaitingToActivate();

      if (!sawUpdate && reg.installing) {
        sawUpdate = true;
        await new Promise((resolve) => {
          const worker = reg.installing;
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.removeEventListener('statechange', onChange);
            resolve();
          };
          const onChange = () => {
            if (worker.state === 'installed' || worker.state === 'redundant') finish();
          };
          const timer = setTimeout(finish, 5000);
          worker.addEventListener('statechange', onChange);
          onChange();
        });
        askWaitingToActivate();
      }
    }

    // 新 Worker 可能已经 skipWaiting 并激活；等 controllerchange 后再刷新
    if (sawUpdate) await waitForController(2500);

    hardReload();
  }

  get isOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }
}
