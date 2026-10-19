/**
 * 应用装配入口。
 *
 * 装配顺序即依赖方向：基础设施 → 应用 → 表现。
 * 表现层不直接访问领域逻辑，应用层不直接操作 DOM，二者只通过视图模型与事件通信。
 */

import { EventBus, EVENTS } from './core/events.js';
import { RandomSource } from './core/random.js';
import { SCENE } from './core/constants.js';
import { LevelRepository } from './infrastructure/levelRepository.js';
import { StorageService } from './infrastructure/storageService.js';
import { AudioService } from './infrastructure/audioService.js';
import { OfflineService } from './infrastructure/offlineService.js';
import { GameController } from './application/gameController.js';
import { TutorialService } from './application/tutorialService.js';
import { Renderer } from './presentation/renderer.js';
import { InputController } from './presentation/inputController.js';
import { A11yService } from './presentation/a11yService.js';
import { SceneManager } from './presentation/sceneManager.js';

async function boot() {
  const bus = new EventBus();
  const rng = new RandomSource();
  const canvas = document.getElementById('board');

  const storage = new StorageService({ bus });
  const levels = new LevelRepository({ bus });
  const audio = new AudioService({ bus });
  const renderer = new Renderer(canvas, { bus });
  const a11y = new A11yService({ bus });
  const tutorial = new TutorialService({ bus });

  let scenes = null;
  const controller = new GameController({
    bus,
    storage,
    levels,
    audio,
    renderer,
    tutorial,
    rng,
    a11y,
    navigate: (scene, payload) => {
      if (!scenes) return;
      scenes.goto(scene);
      if (scene === SCENE.RESULT && payload) scenes.renderResult(payload);
    },
    toast: (text, type) => scenes?.toast(text, type),
  });

  scenes = new SceneManager({ bus, controller, renderer, audio, a11y });
  scenes.init();

  await controller.boot();
  scenes.refreshHome();

  // 引导完成标记落盘，只影响下次是否重播
  bus.on(EVENTS.TUTORIAL_DONE, () => {
    controller.save.tutorialDone = true;
    storage.write(controller.save);
  });

  // 音频解锁：浏览器要求首次用户交互后才能播放
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // 切到后台自动暂停并落盘（FM-10 / FR-09）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && controller.session?.state === 'in_progress') controller.pause();
  });
  window.addEventListener('pagehide', () => {
    if (controller.session?.state === 'in_progress') {
      controller.save.interruptedSession = controller.session.snapshot();
      storage.write(controller.save);
    }
  });

  new InputController({ canvas, renderer, controller, bus }).attach();

  // 离线能力：仅在 https 或 localhost 下注册，file:// 打开时跳过
  if (!window.__M3_STANDALONE__) {
    const offline = new OfflineService({ bus });
    offline.register();
  }

  if (controller.levels.playable().length === 0) {
    scenes.toast('关卡数据加载失败，请刷新页面重试', 'warn');
    scenes.goto(SCENE.HOME);
    return;
  }

  const route = controller.firstRoute();
  if (route.scene === SCENE.GAME) {
    const ok = controller.startLevel(route.levelId, { resume: Boolean(route.resume) });
    if (!ok) scenes.goto(SCENE.HOME);
    else if (route.tutorial) tutorial.begin();
  } else {
    scenes.goto(SCENE.HOME);
  }

  if (storage.lastReadState === 'corrupt') {
    scenes.toast('存档读取失败，已保留原始副本并以新进度开始', 'warn');
  }
  if (!storage.available) {
    scenes.toast('浏览器本地存储不可用，本次进度可能不会被保存', 'warn');
    document.getElementById('save-note')?.classList.remove('hidden');
  }

  // 调试入口：便于手工排查与端到端验证，不参与任何业务逻辑
  window.__M3__ = { controller, scenes, renderer, audio, storage, levels, bus };
}

const start = () => {
  boot().catch((err) => {
    console.error('[boot] 启动失败', err);
    const box = document.createElement('div');
    box.className = 'noscript';
    box.textContent = `游戏启动失败：${err?.message || err}。请刷新页面，或更换浏览器后重试。`;
    document.body.appendChild(box);
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
