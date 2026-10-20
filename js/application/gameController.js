/**
 * M07 游戏控制器 GameController（应用层）
 *
 * 业务编排中枢：把语义动作翻译成对领域模块的调用序列，
 * 决定何时播放动画、何时写档、何时进入结算。控制器本身不实现任何规则。
 *
 * 一条完整操作的调用链（F1）：
 *   SWAP → 判定可行 → 棋盘交换 → 连锁结算 → 逐段计分与动画 → 目标/步数判定
 *        → 死局检测与重排 → 写档
 */

import { EVENTS } from '../core/events.js';
import { BOOSTERS, SESSION_STATE, SCENE, SCORE } from '../core/constants.js';
import { Board } from '../domain/board.js';
import { createBoard } from '../domain/boardFactory.js';
import { isAdjacent, isValidSwap, planSpecialSwap } from '../domain/matchEngine.js';
import { resolveCascade } from '../domain/cascadeResolver.js';
import { hasValidMove, reshuffle } from '../domain/deadlockDetector.js';
import { settleScore, judgeStars } from '../domain/scorer.js';
import { checkBooster, consumeBooster, boosterLimit } from '../domain/boosterService.js';
import { goalSummary } from '../domain/goals.js';
import { GameSession } from './gameSession.js';
import { sanitizeNickname } from './nickname.js';
import { createDefaultSave, localISO } from '../infrastructure/storageService.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GameController {
  constructor({ bus, storage, levels, audio, renderer, tutorial, rng, navigate, toast, a11y }) {
    this.bus = bus;
    this.storage = storage;
    this.levels = levels;
    this.audio = audio;
    this.renderer = renderer;
    this.tutorial = tutorial;
    this.a11y = a11y || null;
    this.rng = rng;
    this.navigate = navigate || (() => {});
    this.toast = toast || (() => {});

    this.save = createDefaultSave();
    this.session = null;
    this.busy = false;
    this.boosterArmed = null;
    this.storageDegraded = false;
    this.sessionCounter = 0;
    this._moveTimer = null;
    this._moveRemaining = 0;
    this._moveLastTick = 0;
  }

  async boot() {
    await this.levels.loadAll();
    const loaded = this.storage.read();
    this.save = loaded || createDefaultSave();
    if (!this.save.flags) this.save.flags = { addMovesRewarded: false };
    if (this.storage.lastReadState === 'corrupt') this.storageDegraded = true;
    this.applySettings();
    return this.save;
  }

  /**
   * 首次进入固定落在首页：是否继续中断的会话、是否播放新手引导，
   * 都由玩家从首页主动点击"开始/继续"时再决定，不在打开网站时替玩家做决定。
   */
  firstRoute() {
    return { scene: SCENE.HOME };
  }

  /** 是否应在本关开始时播放新手引导（仅第 1 关且从未完成过引导） */
  shouldStartTutorial(levelId) {
    const hasProgress = Object.values(this.save.progress).some((p) => p.cleared);
    return Number(levelId) === 1 && !this.save.tutorialDone && !hasProgress;
  }

  applySettings() {
    const s = this.save.settings;
    this.audio.setEnabled(s.soundEnabled);
    this.audio.setVolume(s.volume / 100);
    this.renderer?.setSettings(s);
    this.a11y?.applySettings(s);
  }

  updateSettings(patch) {
    Object.assign(this.save.settings, patch);
    this.applySettings();
    this.storage.write(this.save);
    this.emitSession();
  }

  setNickname(raw) {
    const { value } = sanitizeNickname(raw);
    this.save.player.nickname = value;
    this.storage.write(this.save);
    return value;
  }

  /** 下一次未完成关卡（只考虑普通关卡，EX 关独立解锁） */
  nextLevelId() {
    const list = this.levels.playable().filter((lv) => !lv.isEx);
    for (const lv of list) {
      const p = this.save.progress[String(lv.levelId)];
      if (!p?.cleared) return lv.levelId;
    }
    return list.length ? list[list.length - 1].levelId : 1;
  }

  startLevel(levelId, { resume = false } = {}) {
    // 连锁结算进行中不允许换关：否则上一局的异步结算会继续作用到新的会话上
    if (this.busy) return false;
    const level = this.levels.get(levelId);
    if (!level || !level.valid) {
      this.toast('该关卡数据异常，暂时无法进入', 'warn');
      this.navigate(SCENE.LEVELS);
      return false;
    }

    // 换关时先收起上一个会话的引导，避免气泡跨关卡残留
    this.tutorial?.stop();

    const snap = this.save.interruptedSession;
    let board = null;
    let resumed = null;

    if (resume && snap && Number(snap.levelId) === Number(levelId) && Array.isArray(snap.board)) {
      try {
        board = Board.deserialize(
          { board: snap.board, specials: snap.specials, ice: snap.ice },
          { ...level.board, elementTypes: level.board.elementTypes }
        );
        if (board.countTiles() < 20) board = null;
        else {
          resumed = {
            movesLeft: Math.max(0, Math.min(Number(snap.movesLeft) || 0, level.moves)),
            counters: GameSession.restoreCounters(snap, board),
            boosterUsage: { shuffle: 0, hammer: 0, addMoves: 0, ...(snap.boostersUsed || {}) },
            chainBest: Number(snap.chainBest) || 0,
            tilesCleared: Number(snap.tilesCleared) || 0,
          };
        }
      } catch {
        board = null;
      }
    }

    if (!board) board = createBoard(level.board, this.rng);
    board.rules = level.rules || {};

    this.session = new GameSession({ level, board, resumed });
    this.sessionCounter += 1;
    this.boosterArmed = null;
    this.renderer?.setBoard(board);
    this.renderer?.setHint(this.suggestMove());
    this._resetMoveTimer();
    this.navigate(SCENE.GAME);
    this.emitSession();
    return true;
  }

  /** 引导与提示用：给出一个可行交换 */
  suggestMove() {
    const board = this.session?.board;
    if (!board) return null;
    for (let r = 0; r < board.rows; r += 1) {
      for (let c = 0; c < board.cols; c += 1) {
        if (!board.isFree(r, c)) continue;
        if (c + 1 < board.cols && board.isFree(r, c + 1)) {
          const a = { r, c };
          const b = { r, c: c + 1 };
          if (isValidSwap(board, a, b)) return { a, b };
        }
        if (r + 1 < board.rows && board.isFree(r + 1, c)) {
          const a = { r, c };
          const b = { r: r + 1, c };
          if (isValidSwap(board, a, b)) return { a, b };
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- 动作分发

  async dispatch(action) {
    if (!action || !this.session) return { ok: false, error: 'NO_SESSION' };
    switch (action.type) {
      case 'SELECT':
        return { ok: true };
      case 'SWAP':
        return this.handleSwap(action.from, action.to);
      case 'PAUSE':
        return this.pause();
      case 'RESUME':
        return this.resume();
      case 'RESTART':
        return this.restart();
      case 'QUIT':
        return this.quit();
      case 'USE_BOOSTER':
        return this.useBooster(action.boosterId, action.target || null);
      case 'ARM_BOOSTER':
        return this.armBooster(action.boosterId);
      case 'SETTLE':
        return this.settle();
      case 'CONFIRM_RESULT':
        return { ok: true };
      default:
        return { ok: false, error: 'UNKNOWN_ACTION' };
    }
  }

  setBusy(value) {
    this.busy = value;
    this.renderer?.setInputLocked(value);
    if (value) {
      // 看门狗：动画异常时也不能让棋盘永久锁死
      clearTimeout(this._busyTimer);
      this._busyTimer = setTimeout(() => {
        if (!this.busy) return;
        console.warn('[controller] 操作超时，强制解锁输入');
        this.busy = false;
        this.renderer?.setInputLocked(false);
        this.emitSession();
      }, 12000);
      this._stopMoveTimer();
    } else {
      clearTimeout(this._busyTimer);
      if (this.pendingPause) {
        this.pendingPause = false;
        this.pause();
      } else {
        this._startMoveTimer();
      }
    }
  }

  _moveTimeLimitMs() {
    const limit = this.session?.level?.rules?.moveTimeLimit;
    return Number.isFinite(limit) && limit > 0 ? limit * 1000 : 0;
  }

  _startMoveTimer() {
    const limit = this._moveTimeLimitMs();
    if (!limit) return;
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS || this.busy || this._pausedTimer) return;
    this._stopMoveTimer();
    if (!this._moveRemaining || this._moveRemaining <= 0) this._moveRemaining = limit;
    this._moveLastTick = performance.now();
    this._moveTimer = setInterval(() => this._tickMoveTimer(), 100);
  }

  _stopMoveTimer() {
    if (this._moveTimer) {
      clearInterval(this._moveTimer);
      this._moveTimer = null;
    }
  }

  _pauseMoveTimer() {
    this._pausedTimer = true;
    this._stopMoveTimer();
  }

  _resumeMoveTimer() {
    this._pausedTimer = false;
    this._startMoveTimer();
  }

  _resetMoveTimer() {
    this._stopMoveTimer();
    const limit = this._moveTimeLimitMs();
    this._moveRemaining = limit;
    this._startMoveTimer();
  }

  _tickMoveTimer() {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS || this.busy) return;
    const now = performance.now();
    const delta = now - this._moveLastTick;
    this._moveLastTick = now;
    this._moveRemaining -= delta;
    if (this._moveRemaining <= 0) {
      this._moveRemaining = 0;
      this._stopMoveTimer();
      this.autoPlayMove();
    } else {
      this.emitSession();
    }
  }

  async autoPlayMove() {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS || this.busy) return;
    this._stopMoveTimer();
    const move = this.suggestMove();
    if (move) {
      this.toast('思考时间到，自动执行一步', 'warn');
      await this.handleSwap(move.a, move.b);
      return;
    }
    // 没有可行交换时，随机交换两个相邻空格并消耗一步
    const freePairs = [];
    for (let r = 0; r < s.board.rows; r += 1) {
      for (let c = 0; c < s.board.cols; c += 1) {
        if (!s.board.isFree(r, c)) continue;
        if (c + 1 < s.board.cols && s.board.isFree(r, c + 1)) freePairs.push([{ r, c }, { r, c: c + 1 }]);
        if (r + 1 < s.board.rows && s.board.isFree(r + 1, c)) freePairs.push([{ r, c }, { r: r + 1, c }]);
      }
    }
    if (freePairs.length) {
      const [a, b] = freePairs[this.rng.int(freePairs.length)];
      this.toast('思考时间到，自动交换', 'warn');
      await this.handleSwap(a, b);
    } else {
      // 没有任何可交换的相邻空格，让 afterMove 自动重排
      s.spendMove();
      s.pendingFreeze = true;
      await this.afterMove();
    }
  }

  async handleSwap(from, to) {
    if (this.busy) return { ok: false, error: 'BUSY' };
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS) return { ok: false, error: 'STATE_MISMATCH' };
    if (!from || !to || !isAdjacent(from, to)) return { ok: false, error: 'INVALID_COORD' };
    this._stopMoveTimer();

    if (!s.board.isFree(from.r, from.c) || !s.board.isFree(to.r, to.c)) {
      this.toast('冰块覆盖的元素不能交换', 'warn');
      return { ok: false, error: 'BLOCKED' };
    }

    this.setBusy(true);
    try {
      const effect = planSpecialSwap(s.board, from, to, this.rng);
      if (effect) {
        this.audio.play('special');
        await this.renderer.playSpecialSwap(from, to, effect.combo);
        s.spendMove();
        this.emitSession();
        await this.runCascade({ initialCells: effect.cells, preferred: [from, to] });
      } else {
        /*
         * 任何相邻交换都会真正执行并消耗一步，不再预先判定"能否形成三连"。
         * 交换后若没有连线，就只是这一步没有收益——把选择权留给玩家，
         * 不做"这一步不划算所以不让你走"的拦截。
         */
        s.board.swap(from, to);
        this.audio.play('swap');
        await this.renderer.playSwap(from, to, s.board);
        s.spendMove();
        s.pendingFreeze = true;
        this.emitSession();
        const result = await this.runCascade({ preferred: [from, to] });
        if (!result.sequence.length) {
          // 没有连锁产生：给一个轻微的低音提示，画面保持交换后的状态
          this.audio.play('dud');
        }
      }
      await this.afterMove();
      return { ok: true };
    } finally {
      this.setBusy(false);
    }
  }

  async runCascade(options) {
    const s = this.session;
    const result = resolveCascade(s.board, { rng: this.rng, ...options });
    this.bus.emit(EVENTS.CASCADE_START, { levelId: s.level.levelId });
    for (const step of result.sequence) {
      s.applyStep(step);
      this.emitSession();
      if (step.cleared.length) this.audio.play('clear', { chainIndex: step.index });
      if (step.triggered.length) this.audio.play('special');
      await this.renderer.playStep(step);
      this.bus.emit(EVENTS.CASCADE_STEP, step);
    }
    if (result.sequence.length >= 3) {
      this.toast(`${result.sequence.length} 连击！`, 'good');
    }
    if (this.tutorial?.active && result.sequence.length) this.tutorial.notifyCascade();
    this.bus.emit(EVENTS.CASCADE_END, result);
    return result;
  }

  async afterMove() {
    const s = this.session;
    if (!s) return;

    // 处理 EX-2 的“每 N 步随机冰冻”
    if (s.pendingFreeze) {
      s.pendingFreeze = false;
      s.turnCount += 1;
      await this.applyFreezeRule();
    }

    // 步数用尽才自动结算。达标后不强制结束，玩家可以继续消除把分数做高，
    // 否则"提前结算 + 剩余步数 ×100"往往低于继续消除的收益，反而拿不到三星。
    if (s.movesLeft <= 0) {
      await this.finish(s.goalDone);
      return;
    }

    if (s.goalDone && !s.goalAnnounced) {
      s.goalAnnounced = true;
      this.audio.play('special');
      this.toast('目标已达成，可继续消除冲分，也可直接结算', 'good');
    }

    // 死局检测与自动重排（FR-02）：不消耗步数、不改变得分
    if (!hasValidMove(s.board)) {
      this.toast('没有可消除的组合，自动重排', 'warn');
      await wait(600);
      reshuffle(s.board, this.rng);
      await this.renderer.playReshuffle(s.board);
    }
    this.saveSession();
    this.renderer?.setHint(this.tutorial?.active ? this.suggestMove() : null);
    this._resetMoveTimer();
  }

  /** EX-2：每走 N 步后随机冰冻 1~4 个空格 */
  async applyFreezeRule() {
    const s = this.session;
    const rules = s.level.rules || {};
    const n = rules.freezeEveryNMoves;
    if (!n || s.turnCount % n !== 0) return;

    const free = [];
    s.board.eachCell((r, c) => {
      if (s.board.isFree(r, c) && s.board.typeAt(r, c) >= 0) free.push({ r, c });
    });
    if (!free.length) return;

    // 随机抽取 1~4 个
    for (let i = free.length - 1; i > 0; i -= 1) {
      const j = this.rng.int(i + 1);
      [free[i], free[j]] = [free[j], free[i]];
    }
    const pick = Math.min(1 + this.rng.int(4), free.length);
    const frozen = free.slice(0, pick);
    for (const cell of frozen) s.board.setIce(cell.r, cell.c, 1);

    // 关键：渲染器维护的是棋盘克隆，必须同步回去才会立即显示
    this.renderer?.syncBoard(s.board);
    this.audio?.play('freeze');
    this.toast(`第 ${s.turnCount} 步：随机冻住了 ${pick} 个元素`, 'warn');
    this.emitSession();
    await this.renderer?.playFreeze?.(frozen);
  }

  /** 达成目标后主动结算，保留剩余步数奖励 */
  async settle() {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS || this.busy) return { ok: false };
    if (!s.goalDone) {
      this.toast('目标尚未完成', 'warn');
      return { ok: false };
    }
    await this.finish(true);
    return { ok: true };
  }

  async finish(cleared) {
    const s = this.session;
    s.state = SESSION_STATE.RESOLVED;
    const baseScore = s.counters.score;
    const { bonusScore, finalScore } = settleScore({
      baseScore,
      remainingMoves: s.movesLeft,
      cleared,
    });
    const stars = cleared ? Math.max(1, judgeStars(finalScore, s.level.starThresholds)) : 0;
    const prev = this.save.progress[String(s.level.levelId)] || null;
    const previousBest = prev?.highScore || 0;

    s.result = {
      levelId: s.level.levelId,
      levelName: s.level.name,
      cleared,
      baseScore,
      bonusScore,
      finalScore,
      stars,
      movesLeft: s.movesLeft,
      movesTotal: s.movesTotal,
      chainBest: s.chainBest,
      tilesCleared: s.tilesCleared,
      goalTasks: s.goalTasks,
      hint: goalSummary(s.level.goal),
      at: localISO(),
      previousBest,
      isNewBest: cleared && finalScore > previousBest,
      firstClear: cleared && !prev?.cleared,
    };

    if (cleared) this.applyProgress(s.result);
    this.save.interruptedSession = null;
    this._stopMoveTimer();
    const wr = this.storage.write(this.save);
    if (!wr.ok) this.storageDegraded = true;
    this.audio.play(cleared ? 'win' : 'lose');
    this.tutorial?.stop();
    this.emitSession();
    this.navigate(SCENE.RESULT, s.result);
    this.bus.emit(cleared ? EVENTS.LEVEL_CLEARED : EVENTS.LEVEL_FAILED, s.result);
  }

  applyProgress(result) {
    const id = String(result.levelId);
    const prev = this.save.progress[id] || {
      unlocked: true,
      cleared: false,
      stars: 0,
      highScore: 0,
      clearedAt: null,
    };
    const firstClear = !prev.cleared;

    // 仅当本次星级更高时才更新星级记录（AC-08）
    this.save.progress[id] = {
      unlocked: true,
      cleared: true,
      stars: Math.max(prev.stars, result.stars),
      highScore: Math.max(prev.highScore, result.finalScore),
      clearedAt: prev.clearedAt || result.at,
    };

    const nextId = String(result.levelId + 1);
    if (this.levels.get(result.levelId + 1)) {
      const nx = this.save.progress[nextId] || {
        unlocked: false,
        cleared: false,
        stars: 0,
        highScore: 0,
        clearedAt: null,
      };
      nx.unlocked = true;
      this.save.progress[nextId] = nx;
    }

    // 首次获得三星额外赠送 1 个洗牌
    if (firstClear && result.stars === 3) this.save.boosters.shuffle += 1;

    // 累计通关 10 关且其中至少 5 个三星时赠送 1 个加三步（只发一次）
    if (!this.save.flags) this.save.flags = { addMovesRewarded: false };
    if (!this.save.flags.addMovesRewarded) {
      const values = Object.values(this.save.progress);
      const clearedCount = values.filter((p) => p.cleared).length;
      const threeStar = values.filter((p) => p.stars === 3).length;
      if (clearedCount >= 10 && threeStar >= 5) {
        this.save.boosters.addMoves += 1;
        this.save.flags.addMovesRewarded = true;
        this.toast('达成 10 关通关且 5 个三星，获得加三步 ×1', 'good');
      }
    }

    // 本地成绩记录
    const best = this.save.localBest.find((x) => x.levelId === result.levelId);
    if (best) {
      if (result.finalScore > best.score) {
        best.score = result.finalScore;
        best.stars = Math.max(best.stars, result.stars);
        best.clearedAt = best.clearedAt || result.at;
      }
    } else {
      this.save.localBest.push({
        levelId: result.levelId,
        score: result.finalScore,
        stars: result.stars,
        clearedAt: result.at,
      });
      this.save.localBest.sort((a, b) => a.levelId - b.levelId);
    }

    // 累计总得分 = 各关历史最高分之和（与存档迁移规则一致）
    this.save.player.totalScore = Object.values(this.save.progress).reduce((sum, p) => sum + p.highScore, 0);
  }

  // ---------------------------------------------------------------- 暂停与重开

  pause() {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS) return { ok: false };
    // 动画结算期间按下暂停：等本次操作结束再暂停，避免状态与画面不一致
    if (this.busy) {
      this.pendingPause = true;
      return { ok: true, deferred: true };
    }
    this._pauseMoveTimer();
    s.pause();
    this.tutorial?.pause();
    this.save.interruptedSession = s.snapshot();
    this.storage.write(this.save);
    this.bus.emit('game:paused', {});
    this.emitSession();
    return { ok: true };
  }

  resume() {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.PAUSED) return { ok: false };
    s.resume();
    this.tutorial?.resume();
    this.bus.emit('game:resumed', {});
    this.emitSession();
    this._resumeMoveTimer();
    return { ok: true };
  }

  restart() {
    const s = this.session;
    if (!s) return { ok: false };
    const levelId = s.level.levelId;
    this.save.interruptedSession = null;
    this.tutorial?.stop();
    this.startLevel(levelId, { resume: false });
    this.storage.write(this.save);
    return { ok: true };
  }

  quit() {
    const s = this.session;
    if (s && s.state === SESSION_STATE.IN_PROGRESS) {
      this.save.interruptedSession = s.snapshot();
      this.storage.write(this.save);
    }
    this._stopMoveTimer();
    this.tutorial?.stop();
    this.session = null;
    this.renderer?.setBoard(null);
    this.navigate(SCENE.LEVELS);
    return { ok: true };
  }

  /** 直接回到标题（首页），用于结算后不想继续/不想跳下一关的场景 */
  goHome() {
    const s = this.session;
    if (s && s.state === SESSION_STATE.IN_PROGRESS) {
      this.save.interruptedSession = s.snapshot();
      this.storage.write(this.save);
    }
    this._stopMoveTimer();
    this.tutorial?.stop();
    this.session = null;
    this.renderer?.setBoard(null);
    this.navigate(SCENE.HOME);
    return { ok: true };
  }

  // ---------------------------------------------------------------- 道具

  armBooster(id) {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS) return { ok: false };
    const check = checkBooster(id, {
      inventory: this.save.boosters[id],
      used: s.boosterUsage[id],
      disabled: s.level.disabledBoosters,
      state: s.state,
    });
    if (!check.ok) {
      this.toast(check.message, 'warn');
      return { ok: false, error: check.reason };
    }
    if (id !== 'hammer') return this.useBooster(id, null);
    this.boosterArmed = this.boosterArmed === 'hammer' ? null : 'hammer';
    this.renderer?.setArmedTarget(this.boosterArmed);
    this.emitSession();
    return { ok: true };
  }

  async useBooster(id, target) {
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS || this.busy) return { ok: false };
    if (!BOOSTERS[id]) return { ok: false, error: 'UNKNOWN_BOOSTER' };

    const check = checkBooster(id, {
      inventory: this.save.boosters[id],
      used: s.boosterUsage[id],
      disabled: s.level.disabledBoosters,
      state: s.state,
    });
    if (!check.ok) {
      this.toast(check.message, 'warn');
      return { ok: false, error: check.reason };
    }

    if (id === 'hammer') {
      if (!target) {
        this.toast('点选一个要敲掉的元素', 'info');
        return { ok: false, error: 'NEEDS_TARGET' };
      }
      if (!s.board.isFree(target.r, target.c) || s.board.typeAt(target.r, target.c) < 0) {
        this.toast('这个位置不能被敲掉', 'warn');
        return { ok: false, error: 'INVALID_TARGET' };
      }
    }

    const consumed = consumeBooster(id, { inventory: this.save.boosters[id], used: s.boosterUsage[id] });
    this.save.boosters[id] = consumed.inventory;
    s.boosterUsage[id] = consumed.used;
    this.boosterArmed = null;
    this.renderer?.setArmedTarget(null);
    this.audio.play('booster');
    this.bus.emit(EVENTS.BOOSTER_USED, { id, levelId: s.level.levelId });

    this.setBusy(true);
    try {
      if (id === 'shuffle') {
        reshuffle(s.board, this.rng);
        await this.renderer.playReshuffle(s.board);
        this.saveSession();
      } else if (id === 'addMoves') {
        s.addMoves(3);
        this.toast('剩余步数 +3', 'good');
        this.saveSession();
      } else if (id === 'hammer') {
        await this.runCascade({ initialCells: [target] });
        await this.afterMove();
      }
      this.renderer?.setHint(null);
      this.emitSession();
      return { ok: true };
    } finally {
      this.setBusy(false);
    }
  }

  // ---------------------------------------------------------------- 视图模型与存档

  saveSession() {
    const s = this.session;
    if (!s) return;
    if (s.state === SESSION_STATE.IN_PROGRESS || s.state === SESSION_STATE.PAUSED) {
      this.save.interruptedSession = s.snapshot();
    }
    const wr = this.storage.write(this.save);
    if (!wr.ok) this.storageDegraded = true;
    this.emitSession();
  }

  viewModel() {
    const s = this.session;
    const settings = this.save.settings;
    if (!s) {
      return { scene: SCENE.HOME, settings, save: this.save, storageDegraded: this.storageDegraded };
    }
    const boosters = Object.values(BOOSTERS).map((def) => {
      const check = checkBooster(def.id, {
        inventory: this.save.boosters[def.id],
        used: s.boosterUsage[def.id],
        disabled: s.level.disabledBoosters,
        state: s.state,
      });
      return {
        id: def.id,
        name: def.name,
        desc: def.desc,
        count: this.save.boosters[def.id],
        used: s.boosterUsage[def.id],
        limit: boosterLimit(def.id),
        disabled: (s.level.disabledBoosters || []).includes(def.id),
        available: check.ok,
        armed: this.boosterArmed === def.id,
        reason: check.message || '',
      };
    });
    return {
      scene: SCENE.GAME,
      level: s.level,
      levelId: s.level.levelId,
      levelName: s.level.name,
      hint: s.level.tutorialHint || goalSummary(s.level.goal),
      board: s.board,
      state: s.state,
      movesLeft: s.movesLeft,
      movesTotal: s.movesTotal,
      score: s.counters.score,
      counters: s.counters,
      goals: s.goalTasks,
      goalDone: s.goalDone,
      potentialBonus: s.movesLeft * SCORE.CLEAR_BONUS_PER_MOVE,
      boosters,
      boosterArmed: this.boosterArmed,
      settings,
      storageDegraded: this.storageDegraded,
      busy: this.busy,
      save: this.save,
      chainBest: s.chainBest,
      moveTimer: this._moveTimeLimitMs()
        ? { limit: this._moveTimeLimitMs(), remaining: Math.max(0, Math.round(this._moveRemaining)) }
        : null,
    };
  }

  emitSession() {
    this.bus.emit(EVENTS.SESSION_UPDATED, this.viewModel());
  }

  /** 关卡列表视图数据 */
  levelList() {
    return this.levels.list().map((lv) => {
      const p = this.save.progress[String(lv.levelId)];
      let unlocked;
      if (lv.isEx) {
        unlocked = lv.levelId === 101 || Boolean(this.save.progress[String(lv.levelId - 1)]?.cleared);
      } else {
        unlocked = Boolean(p?.unlocked) || lv.levelId === 1;
      }
      return {
        levelId: lv.levelId,
        name: lv.name,
        isEx: lv.isEx,
        valid: lv.valid,
        errors: lv.errors,
        unlocked,
        cleared: Boolean(p?.cleared),
        stars: p?.stars || 0,
        highScore: p?.highScore || 0,
        goal: goalSummary(lv.goal),
        moves: lv.moves,
        elementTypes: lv.board?.elementTypes,
      };
    });
  }

  /** 排行榜视图数据（派生，不持久化） */
  rankView() {
    const best = new Map();
    for (const item of this.save.localBest) best.set(item.levelId, item);
    const rows = this.levels
      .playable()
      .map((lv) => {
        const p = this.save.progress[String(lv.levelId)];
        const b = best.get(lv.levelId);
        return {
          levelId: lv.levelId,
          name: lv.name,
          score: p?.highScore || b?.score || 0,
          stars: p?.stars || b?.stars || 0,
          clearedAt: p?.clearedAt || b?.clearedAt || null,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      nickname: this.save.player.nickname,
      totalScore: this.save.player.totalScore,
      rows,
    };
  }

  clearAllProgress() {
    this.save = createDefaultSave();
    this.storage.write(this.save);
    this.applySettings();
    this.emitSession();
  }
}
