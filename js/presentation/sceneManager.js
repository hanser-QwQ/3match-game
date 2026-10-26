/**
 * M16 场景与界面 SceneManager（表现层／应用层之间）
 *
 * 场景：首页、关卡列表、游戏、结算、设置、成绩、成就、规则、公告。
 * 只负责把应用层下发的视图模型渲染为 DOM 并转发用户意图，
 * 不判断规则是否成立，也不直接读写存档。
 */

import { EVENTS } from '../core/events.js';
import { SCENE } from '../core/constants.js';
import { goalSummary } from '../domain/goals.js';
import { drawShareCard, downloadShareCard, shareText } from './shareCard.js';
import { APP_VERSION, CHANGELOG, compareVersions } from '../data/changelog.js';
import { ACHIEVEMENT_TIER_LABEL } from '../data/achievements.js';
import { achievementIcon } from './achievementIcons.js';

const STAR = '★';

export class SceneManager {
  constructor({ bus, controller, renderer, audio, a11y }) {
    this.bus = bus;
    this.controller = controller;
    this.renderer = renderer;
    this.audio = audio;
    this.a11y = a11y;
    this.current = null;
    this.lastResult = null;
    this.lastScore = -1;
    // 记录已经弹过关卡开始信息的会话，避免同一局重复弹出
    this.introSessionId = null;
    // 结算页成就弹窗待标记已读的成就 id
    this.pendingAchievementIds = [];
    // 道具按钮复用，避免计时器每次刷新都重建 DOM 导致点击丢失
    this.boosterButtons = new Map();
    this.tutorialAnchor = 'board';
    this.tutorialStep = null;
    // 线上是否存在比当前构建更新的版本（决定首页红点与更新条）
    this.serverVersion = null;
    this.updateAvailable = false;
    this.el = {};
  }

  init() {
    this.cacheElements();
    this.bindStatic();
    this.bindBus();
    this.refreshHome();
    if (this.el.versionLine) this.el.versionLine.textContent = `三消小径 v${APP_VERSION}`;
    this.checkVersion();
    return this;
  }

  cacheElements() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      homeProgress: $('home-progress'),
      btnContinue: $('btn-continue'),
      levelGrid: $('level-grid'),
      levelsMeta: $('levels-meta'),
      levelName: $('game-level-name'),
      hint: $('game-hint'),
      movesLeft: $('moves-left'),
      movesChip: $('moves-chip'),
      score: $('score-value'),
      goalTasks: $('goal-tasks'),
      boosterBar: $('booster-bar'),
      settleBar: $('settle-bar'),
      settleBonus: $('settle-bonus'),
      moveTimer: $('move-timer'),
      moveTimerFill: $('move-timer-fill'),
      moveTimerText: $('move-timer-text'),
      saveNote: $('save-note'),
      badge: $('board-badge'),
      achievementDot: $('achievement-dot'),
      achievementsMeta: $('achievements-meta'),
      achievementsCount: $('achievements-count'),
      achievementsBar: $('achievements-bar'),
      achievementList: $('achievement-list'),
      achievementUnlock: $('achievement-unlock'),
      achievementUnlockList: $('achievement-unlock-list'),
      btnAchievementOk: $('btn-achievement-ok'),
      resultKicker: $('result-kicker'),
      resultTitle: $('result-title'),
      resultStars: $('result-stars'),
      resultScore: $('result-score'),
      resultBest: $('result-best'),
      resultDetail: $('result-detail'),
      resultNext: $('result-next'),
      resultRetry: $('result-retry'),
      resultShare: $('result-share'),
      resultLevels: $('result-levels'),
      resultHome: $('result-home'),
      resultRow: document.querySelector('.result-row'),
      resultCard: document.querySelector('.result-card'),
      pause: $('pause-overlay'),
      levelIntro: $('level-intro'),
      levelIntroKicker: $('level-intro-kicker'),
      levelIntroTitle: $('level-intro-title'),
      levelIntroGoal: $('level-intro-goal'),
      levelIntroMoves: $('level-intro-moves'),
      levelIntroStar1: $('level-intro-star1'),
      levelIntroStar2: $('level-intro-star2'),
      levelIntroStar3: $('level-intro-star3'),
      levelIntroMechanic: $('level-intro-mechanic'),
      levelIntroTimer: $('level-intro-timer'),
      btnLevelStart: $('btn-level-start'),
      share: $('share-overlay'),
      shareCanvas: $('share-canvas'),
      tutorial: $('tutorial-bubble'),
      tutorialStep: $('tutorial-step'),
      tutorialText: $('tutorial-text'),
      toastLayer: $('toast-layer'),
      updateBar: $('update-bar'),
      updateText: $('update-text'),
      noticeDot: $('notice-dot'),
      noticeList: $('notice-list'),
      noticeMeta: $('notice-meta'),
      noticeUpdatePanel: $('notice-update-panel'),
      noticeNewVersion: $('notice-new-version'),
      versionLine: $('version-line'),
      rankName: $('rank-name'),
      rankTotal: $('rank-total'),
      rankList: $('rank-list'),
      setSound: $('set-sound'),
      setVolume: $('set-volume'),
      setVolumeOut: $('set-volume-out'),
      setColorblind: $('set-colorblind'),
      setMotion: $('set-motion'),
      setGrid: $('set-grid'),
      setCursor: $('set-cursor'),
      setNickname: $('set-nickname'),
    };
  }

  bindStatic() {
    const c = this.controller;

    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.play('button');
        this.goto(btn.dataset.action);
      });
    });

    document.querySelectorAll('[data-back]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.play('button');
        this.goto(btn.dataset.back);
      });
    });

    this.el.btnContinue.addEventListener('click', () => {
      this.audio.play('button');
      // 与首页标签共用同一个入口，避免显示与点击进入的关卡不一致
      const entry = c.homeEntry();
      // 首页固定为入口后，新手引导在玩家点击开始时再播放
      if (c.startLevel(entry.levelId, { resume: entry.resume }) && !entry.resume && c.shouldStartTutorial(entry.levelId)) {
        c.tutorial?.begin();
      }
    });

    this.el.levelGrid.addEventListener('click', (event) => {
      const card = event.target.closest('.level-card');
      if (!card || card.disabled) return;
      this.audio.play('button');
      const id = Number(card.dataset.level);
      const snap = c.save.interruptedSession;
      const resume = Boolean(snap && Number(snap.levelId) === id);
      if (c.startLevel(id, { resume }) && !resume && c.shouldStartTutorial(id)) {
        c.tutorial?.begin();
      }
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      this.audio.play('button');
      c.pause();
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      this.audio.play('button');
      c.resume();
    });

    this.el.btnLevelStart?.addEventListener('click', () => {
      this.audio.play('button');
      this.hideLevelIntro();
      this.el.btnLevelStart.blur();
    });

    this.el.btnAchievementOk?.addEventListener('click', () => {
      this.audio.play('button');
      const ids = this.pendingAchievementIds || [];
      this.pendingAchievementIds = [];
      this.el.achievementUnlock?.classList.add('hidden');
      this.controller.markAchievementsSeen(ids);
      this.refreshHome();
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      this.audio.play('button');
      this.hidePause();
      c.restart();
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
      this.audio.play('button');
      this.hidePause();
      c.quit();
      this.goto(SCENE.LEVELS);
    });

    document.getElementById('btn-pause-home').addEventListener('click', () => {
      this.audio.play('button');
      this.hidePause();
      c.goHome();
    });

    this.el.boosterBar.addEventListener('click', (event) => {
      const btn = event.target.closest('.booster');
      if (!btn || btn.disabled) return;
      this.audio.play('button');
      c.armBooster(btn.dataset.booster);
    });

    document.getElementById('btn-settle')?.addEventListener('click', () => {
      this.audio.play('button');
      c.dispatch({ type: 'SETTLE' });
    });

    this.el.resultNext.addEventListener('click', () => {
      this.audio.play('button');
      const r = this.lastResult;
      if (!r) return;
      if (!r.cleared) {
        c.startLevel(r.levelId);
        return;
      }
      const nextLevel = c.levels.get(r.levelId + 1);
      if (nextLevel && nextLevel.valid && !nextLevel.hidden) {
        c.startLevel(r.levelId + 1);
      } else {
        this.goto(SCENE.LEVELS);
        this.toast(
          nextLevel ? '下一关暂未开放，可以重复挑战刷新记录' : '已经通关全部关卡，可以重复挑战刷新记录',
          'good'
        );
      }
    });

    this.el.resultRetry.addEventListener('click', () => {
      this.audio.play('button');
      if (this.lastResult) c.startLevel(this.lastResult.levelId);
    });

    this.el.resultLevels.addEventListener('click', () => {
      this.audio.play('button');
      this.goto(SCENE.LEVELS);
    });

    this.el.resultHome.addEventListener('click', () => {
      this.audio.play('button');
      c.goHome();
    });

    this.el.resultShare.addEventListener('click', () => {
      this.audio.play('button');
      this.openShare();
    });

    document.getElementById('btn-share-close').addEventListener('click', () => {
      this.el.share.classList.add('hidden');
    });

    document.getElementById('btn-share-download').addEventListener('click', async () => {
      if (!this.lastResult) return;
      const res = await downloadShareCard(this.el.shareCanvas, this.lastResult);
      if (res.ok) this.toast('图片已保存到下载目录', 'good');
      else {
        const text = shareText(this.lastResult);
        try {
          await navigator.clipboard.writeText(text);
          this.toast('当前浏览器不支持导出图片，成绩文本已复制', 'warn');
        } catch {
          this.toast('当前浏览器不支持导出图片', 'warn');
        }
      }
    });

    // 设置项
    this.el.setSound.addEventListener('change', (e) => {
      c.updateSettings({ soundEnabled: e.target.checked });
    });
    this.el.setVolume.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      this.el.setVolumeOut.textContent = `${v}%`;
      c.save.settings.volume = v;
      c.audio.setVolume(v / 100);
    });
    this.el.setVolume.addEventListener('change', (e) => {
      c.updateSettings({ volume: Number(e.target.value) });
    });
    this.el.setColorblind.addEventListener('change', (e) => {
      c.updateSettings({ colorBlindEnhanced: e.target.checked });
    });
    this.el.setMotion.addEventListener('change', (e) => {
      c.updateSettings({ reducedMotion: e.target.checked });
    });
    this.el.setGrid.addEventListener('change', (e) => {
      c.updateSettings({ showGrid: e.target.checked });
    });
    this.el.setCursor.addEventListener('change', (e) => {
      c.updateSettings({ showCursor: e.target.checked });
    });
    this.el.setNickname.addEventListener('change', (e) => {
      const value = c.setNickname(e.target.value);
      e.target.value = value;
      this.toast(`昵称已保存为“${value}”`, 'good');
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!window.confirm('清空全部本地进度？此操作不可撤销。')) return;
      c.clearAllProgress();
      this.refreshHome();
      this.toast('本地进度已清空');
      this.goto(SCENE.HOME);
    });

    // 线上重新发布后的版本提示
    document.getElementById('btn-update')?.addEventListener('click', () => {
      this.updateDismissed = true;
      location.reload();
    });
    document.getElementById('btn-update-later')?.addEventListener('click', () => {
      this.updateDismissed = true;
      this.el.updateBar?.classList.add('hidden');
    });
    document.getElementById('btn-update-info')?.addEventListener('click', () => {
      this.audio.play('button');
      this.goto(SCENE.NOTICE);
    });
    document.getElementById('btn-notice-refresh')?.addEventListener('click', () => {
      location.reload();
    });
    this.el.versionLine?.addEventListener('click', () => {
      this.audio.play('button');
      this.goto(SCENE.NOTICE);
    });
  }

  bindBus() {
    const b = this.bus;
    b.on(EVENTS.SESSION_UPDATED, (vm) => this.renderSession(vm));
    b.on(EVENTS.TOAST, (payload) => this.toast(payload.text, payload.type));
    b.on(EVENTS.TUTORIAL_STEP, (step) => this.showTutorial(step));
    b.on(EVENTS.SAVE_FAILED, () => {
      if (this.el.saveNote) this.el.saveNote.classList.remove('hidden');
    });
    b.on('game:paused', () => this.showPause());
    b.on('game:resumed', () => this.hidePause());
    b.on('ui:pause-request', () => this.controller.pause());
    b.on('ui:resume-request', () => this.controller.resume());
    b.on(EVENTS.LEVEL_CLEARED, () => this.refreshHome());
    b.on('offline:update', () => {
      // Service Worker 检测到有新版本已装好、等待刷新
      this.markUpdateAvailable(null);
    });
  }

  // ------------------------------------------------------------------ 版本与公告

  /**
   * 向服务器询问最新版本号（绕过本地缓存）。
   * 若高于当前构建版本，则显示更新条并在首页公告入口点亮红点；
   * 玩家刷新加载新版本后，两边版本一致，红点自然消失。
   */
  async checkVersion() {
    try {
      const res = await fetch(`./version.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.version && compareVersions(data.version, APP_VERSION) > 0) {
        this.markUpdateAvailable(data.version);
      }
    } catch {
      /* 离线或旧部署没有 version.json 时静默跳过 */
    }
  }

  /** 标记有可用更新：红点常显（直到刷新），更新条可手动关闭 */
  markUpdateAvailable(version) {
    if (version && compareVersions(version, APP_VERSION) <= 0) return;
    this.serverVersion = version || this.serverVersion;
    this.updateAvailable = true;
    this.el.noticeDot?.classList.remove('hidden');
    if (this.updateDismissed) return;
    if (this.el.updateText && this.serverVersion) {
      this.el.updateText.textContent = `新版本 v${this.serverVersion} 已发布`;
    }
    this.el.updateBar?.classList.remove('hidden');
  }

  renderNotice() {
    if (!this.el.noticeList) return;
    this.el.noticeMeta.textContent = `当前 v${APP_VERSION}`;
    this.el.noticeUpdatePanel?.classList.toggle('hidden', !this.updateAvailable);
    if (this.el.noticeNewVersion) {
      this.el.noticeNewVersion.textContent = this.serverVersion ? `v${this.serverVersion}` : '';
    }

    this.el.noticeList.textContent = '';
    const latestKnown = this.serverVersion && compareVersions(this.serverVersion, APP_VERSION) > 0
      ? this.serverVersion : null;
    // 服务器版本比本地公告还新时，先放一张占位卡片，详细内容刷新后即可查看
    if (latestKnown && !CHANGELOG.some((e) => e.version === latestKnown)) {
      const card = document.createElement('div');
      card.className = 'notice-card';
      const head = document.createElement('div');
      head.className = 'notice-head';
      const title = document.createElement('b');
      title.textContent = `v${latestKnown}`;
      const tag = document.createElement('span');
      tag.className = 'notice-tag new';
      tag.textContent = '新版本';
      head.append(title, tag);
      card.appendChild(head);
      const p = document.createElement('p');
      p.className = 'rule-text';
      p.textContent = '该版本的详细公告将在刷新页面后显示。';
      card.appendChild(p);
      this.el.noticeList.appendChild(card);
    }
    for (const entry of CHANGELOG) {
      const card = document.createElement('div');
      card.className = 'notice-card';
      const head = document.createElement('div');
      head.className = 'notice-head';
      const title = document.createElement('b');
      title.textContent = `v${entry.version}`;
      head.appendChild(title);
      if (entry.version === APP_VERSION) {
        const tag = document.createElement('span');
        tag.className = 'notice-tag current';
        tag.textContent = '当前版本';
        head.appendChild(tag);
      } else if (latestKnown && compareVersions(entry.version, APP_VERSION) > 0) {
        const tag = document.createElement('span');
        tag.className = 'notice-tag new';
        tag.textContent = '新版本';
        head.appendChild(tag);
      }
      const date = document.createElement('span');
      date.className = 'notice-date';
      date.textContent = entry.date;
      head.appendChild(date);
      card.appendChild(head);
      const ul = document.createElement('ul');
      for (const note of entry.notes) {
        const li = document.createElement('li');
        li.textContent = note;
        ul.appendChild(li);
      }
      card.appendChild(ul);
      this.el.noticeList.appendChild(card);
    }
  }

  // ------------------------------------------------------------------ 场景

  goto(scene) {
    if (!scene) return;
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach((s) => {
      const name = s.dataset.scene;
      if (name === scene) s.classList.add('active');
      else if (scene === SCENE.RESULT && name === SCENE.GAME) {
        /* 结算时保留棋盘作为背景 */
      } else s.classList.remove('active');
    });
    this.current = scene;
    if (scene !== SCENE.GAME) this.hideLevelIntro();
    if (scene !== SCENE.RESULT) this.el.achievementUnlock?.classList.add('hidden');

    if (scene === SCENE.LEVELS) this.renderLevels();
    if (scene === SCENE.ACHIEVEMENTS) this.renderAchievements();
    if (scene === SCENE.RANK) this.renderRank();
    if (scene === SCENE.SETTINGS) this.syncSettings();
    if (scene === SCENE.NOTICE) this.renderNotice();
    if (scene === SCENE.HOME) this.refreshHome();
    if (scene === SCENE.GAME) {
      this.lastScore = -1;
      requestAnimationFrame(() => this.renderer._onResize());
    }
    if (scene === SCENE.RESULT) this.el.pause.classList.add('hidden');
    // 引导气泡只在游戏场景内出现，离开时收起，避免遮挡其他界面
    if (scene !== SCENE.GAME && scene !== SCENE.RESULT) {
      this.el.tutorial.classList.add('hidden');
    } else if (this.tutorialStep) {
      this.showTutorial(this.tutorialStep);
    }
  }

  /** 所有关卡进入时的目标、步数与评星标准 */
  showLevelIntro(level) {
    if (!this.el.levelIntro || !level) return;
    this.controller.introOpen = true;
    const isEx = Boolean(level.isEx);
    const stars = Array.isArray(level.starThresholds) ? level.starThresholds : [];

    this.el.levelIntroKicker.textContent = isEx ? 'EX 关卡追加机制' : '关卡信息';
    this.el.levelIntroTitle.textContent = isEx
      ? level.name
      : `第 ${level.levelId} 关 · ${level.name}`;
    this.el.levelIntroGoal.textContent = goalSummary(level.goal) || '完成本关目标';
    this.el.levelIntroMoves.textContent = `${level.moves} 步`;
    this.el.levelIntroStar1.textContent = stars[0] ? `${stars[0]} 分` : '-';
    this.el.levelIntroStar2.textContent = stars[1] ? `${stars[1]} 分` : '-';
    this.el.levelIntroStar3.textContent = stars[2] ? `${stars[2]} 分` : '-';

    if (isEx) {
      this.el.levelIntroMechanic.textContent = level.tutorialHint || '本关有额外的特殊规则，请留意。';
      this.el.levelIntroMechanic.classList.remove('hidden');
      const limit = level.rules?.moveTimeLimit;
      this.el.levelIntroTimer.textContent = limit
        ? `每步限时 ${limit} 秒。首次操作不限时，之后每次操作结束会重新计时；使用道具也会重置时间。`
        : '本关没有单步时间限制。';
      this.el.levelIntroTimer.classList.remove('hidden');
    } else {
      this.el.levelIntroMechanic.classList.add('hidden');
      this.el.levelIntroTimer.classList.add('hidden');
    }

    this.el.levelIntro.classList.remove('hidden');
    this.el.btnLevelStart?.focus({ preventScroll: true });
  }

  hideLevelIntro() {
    this.controller.introOpen = false;
    this.el.levelIntro?.classList.add('hidden');
  }

  showPause() {
    this.hideLevelIntro();
    this.el.pause.classList.remove('hidden');
    this.el.tutorial.classList.add('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
    if (this.tutorialStep) this.showTutorial(this.tutorialStep);
  }

  // ------------------------------------------------------------------ 渲染

  refreshHome() {
    const save = this.controller.save;
    // 只统计对外可见的关卡，隐藏关卡既不显示在列表里，也不计入总进度
    const visible = this.controller.levels.list();
    const visibleIds = new Set(visible.map((lv) => String(lv.levelId)));
    const cleared = Object.entries(save.progress).filter(([id, p]) => p.cleared && visibleIds.has(id)).length;
    const total = visible.length || 20;
    // 标签与点击共用 homeEntry()，保证“显示哪一关就进哪一关”
    const entry = this.controller.homeEntry();
    const nextId = entry.levelId;
    const nextLevel = this.controller.levels.get(nextId);
    const levelLabel = nextLevel?.isEx ? `EX-${nextId - 100}` : `第 ${nextId} 关`;
    const label = this.el.btnContinue.querySelector('.btn-continue-label');
    const sub = this.el.btnContinue.querySelector('.btn-continue-sub');
    if (cleared === 0 && !entry.resume) {
      label.textContent = '开始第 1 关';
      sub.textContent = '四个元素连成一线';
    } else {
      label.textContent = `继续 ${levelLabel}`;
      const goal = nextLevel ? goalSummary(nextLevel.goal) : '';
      sub.textContent = nextLevel ? `${nextLevel.name} · ${goal}` : '全部关卡已通关';
    }
    this.el.homeProgress.textContent = cleared
      ? `已通关 ${cleared} / ${total} · 累计 ${save.player.totalScore} 分`
      : '尚未开始';

    const achievements = this.controller.achievementSummary();
    this.el.achievementDot?.classList.toggle('hidden', achievements.unseen === 0);
    const achievementBtn = document.querySelector('[data-action="achievements"]');
    achievementBtn?.setAttribute(
      'aria-label',
      `成就，已解锁 ${achievements.unlocked} / ${achievements.total}`
    );
  }

  renderSession(vm) {
    if (!vm || !vm.board) return;
    if (this.current !== SCENE.GAME && this.current !== SCENE.RESULT) return;

    // 每次进入关卡（首次进入 / 续玩 / 重开）弹一次开始信息
    if (vm.level && this.introSessionId !== vm.sessionId) {
      this.introSessionId = vm.sessionId;
      this.showLevelIntro(vm.level);
    }

    this.el.levelName.textContent = vm.levelId >= 100
      ? vm.levelName
      : `第 ${vm.levelId} 关 · ${vm.levelName}`;
    this.el.hint.textContent = vm.hint;
    this.el.movesLeft.textContent = vm.movesLeft;
    this.el.movesChip.classList.toggle('low', vm.movesLeft <= 3 && vm.state === 'in_progress');

    if (vm.score !== this.lastScore) {
      this.el.score.textContent = vm.score;
      if (vm.score > this.lastScore && this.lastScore >= 0) {
        this.el.score.classList.add('bump');
        setTimeout(() => this.el.score.classList.remove('bump'), 140);
      }
      this.lastScore = vm.score;
    }

    // 目标进度：始终可见并实时更新（NFR-08）
    this.el.goalTasks.textContent = '';
    for (const task of vm.goals) {
      const chip = document.createElement('div');
      chip.className = 'goal-chip' + (task.done ? ' done' : '');
      const label = document.createElement('span');
      label.className = 'goal-label';
      label.textContent = task.label;
      const value = document.createElement('span');
      value.className = 'goal-value';
      value.textContent = `${task.cleared} / ${task.total}`;
      const bar = document.createElement('span');
      bar.className = 'goal-bar';
      const fill = document.createElement('i');
      const pct = task.total > 0 ? Math.min(100, (task.cleared / task.total) * 100) : 0;
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      chip.append(label, value, bar);
      this.el.goalTasks.appendChild(chip);
    }

    /*
     * 道具按钮只创建一次，之后原地更新文本与禁用状态。
     * EX 关的计时器每 100ms 触发一次 emitSession，如果每次都重建按钮，
     * 玩家按下与松开之间按钮被替换，click 事件就会丢失，表现为“点不动”。
     */
    const seen = new Set();
    for (const b of vm.boosters) {
      seen.add(b.id);
      let btn = this.boosterButtons.get(b.id);
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'booster';
        btn.dataset.booster = b.id;
        const count = document.createElement('span');
        count.className = 'b-count';
        const name = document.createElement('span');
        name.className = 'b-name';
        name.textContent = b.name;
        const limit = document.createElement('span');
        limit.className = 'b-limit';
        btn.append(count, name, limit);
        this.boosterButtons.set(b.id, btn);
        this.el.boosterBar.appendChild(btn);
      }
      btn.classList.toggle('armed', Boolean(b.armed));
      btn.disabled = !b.available && !b.armed;
      btn.setAttribute('aria-label', `${b.name}，三种道具共用次数，本关剩余 ${b.count} 次`);
      // 三种道具共用次数池，三张卡显示同一个剩余次数
      btn.querySelector('.b-count').textContent = String(b.count);
      btn.querySelector('.b-limit').textContent = b.disabled ? '本关禁用' : `共用 ${b.usedTotal}/${b.limit}`;
    }
    for (const [id, btn] of this.boosterButtons) {
      if (!seen.has(id)) {
        btn.remove();
        this.boosterButtons.delete(id);
      }
    }

    this.el.saveNote.classList.toggle('hidden', !vm.storageDegraded);

    // 单步思考倒计时（EX 关卡）
    if (this.el.moveTimer) {
      const hasTimer = Boolean(vm.moveTimer);
      this.el.moveTimer.classList.toggle('hidden', !hasTimer);
      if (hasTimer) {
        const started = vm.moveTimer.started !== false;
        const pct = vm.moveTimer.limit > 0 ? (vm.moveTimer.remaining / vm.moveTimer.limit) * 100 : 0;
        this.el.moveTimerFill.style.width = `${Math.max(0, pct)}%`;
        this.el.moveTimerFill.classList.toggle('low', started && pct <= 30);
        this.el.moveTimerText.textContent = started
          ? `${(vm.moveTimer.remaining / 1000).toFixed(1)}s`
          : '待开始';
      }
    }

    // 达标后不强制结算：给出"继续冲分"与"立即结算并拿走剩余步数奖励"两条路
    const canSettle = Boolean(vm.goalDone) && vm.movesLeft > 0 && vm.state === 'in_progress';
    this.el.settleBar?.classList.toggle('hidden', !canSettle);
    if (canSettle && this.el.settleBonus) {
      this.el.settleBonus.textContent = `+${vm.potentialBonus}`;
    }

    this.a11y?.announce(`剩余 ${vm.movesLeft} 步，得分 ${vm.score}`);
  }

  renderLevels() {
    const list = this.controller.levelList();
    const cleared = list.filter((l) => l.cleared).length;
    this.el.levelsMeta.textContent = `${cleared} / ${list.length}`;
    this.el.levelGrid.textContent = '';
    // 与首页“继续”按钮共用 homeEntry()，让高亮、按钮文案、点击目标三者一致
    const currentId = this.controller.homeEntry().levelId;
    let exHeaderAdded = false;

    for (const lv of list) {
      if (lv.isEx && !exHeaderAdded) {
        const divider = document.createElement('div');
        divider.className = 'level-divider';
        divider.textContent = 'EX 关卡';
        this.el.levelGrid.appendChild(divider);
        exHeaderAdded = true;
      }
      const btn = document.createElement('button');
      btn.className = 'level-card';
      if (lv.isEx) btn.classList.add('ex');
      btn.dataset.level = String(lv.levelId);
      if (!lv.valid) {
        btn.classList.add('invalid');
        btn.disabled = true;
      } else if (!lv.unlocked) {
        btn.classList.add('locked');
        btn.disabled = true;
      }
      if (lv.cleared) btn.classList.add('cleared');
      if (lv.levelId === currentId && lv.unlocked) btn.classList.add('current');

      const no = document.createElement('span');
      no.className = 'level-no';
      no.textContent = lv.valid ? (lv.isEx ? `EX-${lv.levelId - 100}` : String(lv.levelId)) : '异常';

      const stars = document.createElement('span');
      stars.className = 'level-stars';
      if (lv.valid && lv.unlocked) {
        stars.textContent = STAR.repeat(lv.stars) + STAR.repeat(Math.max(0, 3 - lv.stars));
        // 已获得的星用高亮色，未获得的用浅色
        stars.textContent = '';
        for (let i = 0; i < 3; i += 1) {
          const s = document.createElement('span');
          s.textContent = STAR;
          if (i < lv.stars) s.className = 'on';
          stars.appendChild(s);
        }
      } else if (!lv.valid) {
        stars.textContent = '数据异常';
      } else {
        stars.textContent = '未解锁';
      }

      btn.append(no, stars);
      if (lv.valid && lv.unlocked) {
        btn.title = `第 ${lv.levelId} 关 ${lv.name}：${lv.goal}`;
      }
      this.el.levelGrid.appendChild(btn);
    }
  }

  renderResult(result) {
    this.lastResult = result;
    this.el.resultKicker.textContent = result.levelId >= 100
      ? result.levelName
      : `第 ${String(result.levelId).padStart(2, '0')} 关 · ${result.levelName}`;
    this.el.resultTitle.textContent = result.cleared ? (result.stars === 3 ? '完美通关' : '通关') : '未达成目标';
    this.el.resultCard.classList.toggle('failed', !result.cleared);

    this.el.resultStars.textContent = '';
    for (let i = 0; i < 3; i += 1) {
      const s = document.createElement('span');
      s.className = 'star' + (i < result.stars ? ' on' : '');
      s.textContent = STAR;
      s.style.animationDelay = `${120 + i * 130}ms`;
      this.el.resultStars.appendChild(s);
    }

    this.el.resultScore.textContent = result.finalScore;

    if (!result.cleared) {
      this.el.resultBest.textContent = '步数用尽，目标未完成';
    } else if (result.isNewBest) {
      this.el.resultBest.innerHTML = '';
      const up = document.createElement('span');
      up.className = 'up';
      up.textContent = `刷新纪录 +${result.finalScore - result.previousBest}`;
      this.el.resultBest.append(up);
    } else {
      this.el.resultBest.textContent = `历史最高 ${result.previousBest} 分`;
    }

    this.el.resultDetail.textContent = '';
    const rows = [
      ['基础分', String(result.baseScore)],
      ['步数奖励', result.cleared ? `+${result.bonusScore}` : '未通关不计'],
      ['剩余步数', `${result.movesLeft} / ${result.movesTotal}`],
      ['最高连锁', `${result.chainBest} 连`],
      ['消除元素', `${result.tilesCleared} 个`],
    ];
    if (!result.cleared) {
      for (const task of result.goalTasks) {
        if (!task.done) rows.push([task.label, `${task.cleared} / ${task.total}`]);
      }
    }
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      this.el.resultDetail.append(dt, dd);
    }

    const nextLevel = this.controller.levels.get(result.levelId + 1);
    const hasNext = Boolean(nextLevel && nextLevel.valid && !nextLevel.hidden);
    this.el.resultNext.textContent = result.cleared ? (hasNext ? '下一关' : '返回关卡') : '再试一次';
    // 未通关时隐藏与主按钮重复的"再玩一次"，以及不可用的成绩卡片
    this.el.resultRetry.classList.toggle('hidden', !result.cleared);
    this.el.resultShare.classList.toggle('hidden', !result.cleared);
    this.el.resultRow?.classList.toggle('single', !result.cleared);

    if (result.achievements?.length) this.showAchievementUnlock(result.achievements);
    else this.el.achievementUnlock?.classList.add('hidden');
  }

  showAchievementUnlock(achievements) {
    if (!Array.isArray(achievements) || !achievements.length || !this.el.achievementUnlock) return;
    this.pendingAchievementIds = achievements.map((achievement) => achievement.id);
    this.el.achievementUnlockList.textContent = '';

    for (const achievement of achievements) {
      const item = document.createElement('div');
      item.className = `achievement-unlock-item tier-${achievement.tier}`;

      const mark = document.createElement('span');
      mark.className = 'achievement-mark';
      mark.innerHTML = achievementIcon(achievement.icon);

      const text = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = achievement.name;
      const desc = document.createElement('p');
      desc.textContent = achievement.desc;
      text.append(name, desc);

      item.append(mark, text);
      this.el.achievementUnlockList.appendChild(item);
    }

    this.el.achievementUnlock.classList.remove('hidden');
    this.el.btnAchievementOk?.focus({ preventScroll: true });
  }

  renderRank() {
    const view = this.controller.rankView();
    this.el.rankName.textContent = view.nickname || '玩家';
    this.el.rankTotal.textContent = String(view.totalScore);
    this.el.rankList.textContent = '';

    if (!view.rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = '还没有成绩记录。完成任意一关后，这里会按分数从高到低列出你的本地记录。';
      this.el.rankList.appendChild(empty);
      return;
    }

    view.rows.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'rank-item';
      const idx = document.createElement('span');
      idx.className = 'rank-index';
      idx.textContent = String(i + 1).padStart(2, '0');
      const mid = document.createElement('div');
      mid.className = 'rank-level';
      const name = document.createElement('b');
      name.textContent = `第 ${row.levelId} 关 · ${row.name}`;
      const sub = document.createElement('small');
      sub.textContent = row.clearedAt ? row.clearedAt.slice(0, 10) : '—';
      mid.append(name, sub);
      const score = document.createElement('div');
      score.className = 'rank-score';
      score.textContent = String(row.score);
      const st = document.createElement('small');
      st.textContent = STAR.repeat(row.stars);
      score.appendChild(st);
      item.append(idx, mid, score);
      this.el.rankList.appendChild(item);
    });
  }

  renderAchievements() {
    const list = this.controller.achievementList();
    const unlocked = list.filter((a) => a.unlocked).length;
    this.el.achievementsMeta.textContent = `${unlocked} / ${list.length}`;
    this.el.achievementsCount.textContent = String(unlocked);
    this.el.achievementsBar.style.width = `${list.length ? (unlocked / list.length) * 100 : 0}%`;
    this.el.achievementList.textContent = '';

    for (const achievement of list) {
      const card = document.createElement('article');
      card.className = `achievement-card tier-${achievement.tier} ${achievement.unlocked ? 'unlocked' : 'locked'}`;

      const mark = document.createElement('div');
      mark.className = 'achievement-mark';
      mark.innerHTML = achievementIcon(achievement.icon);

      const main = document.createElement('div');
      main.className = 'achievement-main';

      const head = document.createElement('div');
      head.className = 'achievement-head';
      const name = document.createElement('h3');
      name.textContent = achievement.name;
      const tier = document.createElement('span');
      tier.className = 'achievement-tier';
      tier.textContent = ACHIEVEMENT_TIER_LABEL[achievement.tier] || '';
      head.append(name, tier);
      if (achievement.unlocked && !achievement.seen) {
        const badge = document.createElement('span');
        badge.className = 'achievement-new';
        badge.textContent = 'NEW';
        head.appendChild(badge);
      }

      const desc = document.createElement('p');
      desc.className = 'achievement-desc';
      desc.textContent = achievement.desc;
      main.append(head, desc);

      if (achievement.unlocked) {
        const meta = document.createElement('p');
        meta.className = 'achievement-meta';
        meta.textContent = achievement.unlockedAt
          ? `${achievement.unlockedAt.slice(0, 10)} 解锁`
          : '已解锁';
        main.appendChild(meta);
      } else if (achievement.runOnly) {
        const meta = document.createElement('p');
        meta.className = 'achievement-meta';
        meta.textContent = '完成对应挑战解锁';
        main.appendChild(meta);
      } else {
        const meta = document.createElement('p');
        meta.className = 'achievement-meta';
        meta.textContent = `进度 ${achievement.current} / ${achievement.target}`;
        const bar = document.createElement('div');
        bar.className = 'achievement-progress';
        const fill = document.createElement('span');
        fill.style.width = `${achievement.target > 0 ? (achievement.current / achievement.target) * 100 : 0}%`;
        bar.appendChild(fill);
        main.append(meta, bar);
      }

      card.append(mark, main);
      this.el.achievementList.appendChild(card);
    }

    // 已看过成就页后清除首页红点；卡片上的 NEW 标记在本次渲染中保留
    this.controller.markAchievementsSeen();
    this.refreshHome();
  }

  syncSettings() {
    const s = this.controller.save.settings;
    this.el.setSound.checked = s.soundEnabled;
    this.el.setVolume.value = String(s.volume);
    this.el.setVolumeOut.textContent = `${s.volume}%`;
    this.el.setColorblind.checked = s.colorBlindEnhanced;
    this.el.setMotion.checked = s.reducedMotion;
    this.el.setGrid.checked = s.showGrid;
    this.el.setCursor.checked = s.showCursor;
    this.el.setNickname.value = this.controller.save.player.nickname;
  }

  // ------------------------------------------------------------------ 引导

  showTutorial(step) {
    if (!this.el.tutorial) return;
    if (step.done) {
      this.tutorialStep = null;
      this.el.tutorial.classList.add('hidden');
      return;
    }
    this.tutorialStep = step;
    this.el.tutorialStep.textContent = `${step.index + 1}/${step.total}`;
    this.el.tutorialText.textContent = step.text;
    this.el.tutorial.classList.remove('hidden');

    const anchor = step.anchor;
    let target = null;
    if (anchor === 'goal') target = this.el.goalTasks;
    else if (anchor === 'moves') target = this.el.movesChip;
    else target = document.getElementById('board');

    requestAnimationFrame(() => {
      if (!target) return;
      const r = target.getBoundingClientRect();
      const bubble = this.el.tutorial;
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      let left = r.left + r.width / 2 - bw / 2;
      left = Math.max(10, Math.min(window.innerWidth - bw - 10, left));
      let top = r.top - bh - 14;
      let below = false;
      if (top < 12) {
        top = r.bottom + 14;
        below = true;
      }
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.classList.toggle('below', below);
    });
  }

  // ------------------------------------------------------------------ 分享

  openShare() {
    if (!this.lastResult) return;
    drawShareCard(this.el.shareCanvas, this.lastResult);
    this.el.share.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ 提示

  toast(text, type = 'info') {
    if (!text) return;
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = text;
    this.el.toastLayer.appendChild(div);
    while (this.el.toastLayer.children.length > 3) this.el.toastLayer.firstChild.remove();
    setTimeout(() => {
      div.classList.add('leaving');
      setTimeout(() => div.remove(), 260);
    }, 1900);
  }

  showBadge(text) {
    if (!this.el.badge) return;
    this.el.badge.textContent = text;
    this.el.badge.classList.remove('hidden');
    setTimeout(() => this.el.badge.classList.add('hidden'), 1200);
  }
}
