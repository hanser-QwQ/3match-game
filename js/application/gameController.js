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
import { BOOSTERS, SESSION_STATE, SCENE, SCORE, SPECIAL } from '../core/constants.js';
import { Board } from '../domain/board.js';
import { createBoard } from '../domain/boardFactory.js';
import { isAdjacent, isValidSwap, planSpecialSwap } from '../domain/matchEngine.js';
import { resolveCascade } from '../domain/cascadeResolver.js';
import { hasValidMove, reshuffle, findAnyValidMove } from '../domain/deadlockDetector.js';
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
    // EX 追加机制弹窗打开时锁住棋盘输入（键盘路径也要拦）
    this.introOpen = false;
    this.boosterArmed = null;
    this.storageDegraded = false;
    this.sessionCounter = 0;
    this._moveTimer = null;
    this._moveRemaining = 0;
    this._moveLastTick = 0;
    // 首次操作（交换或道具）完成后才启动单步计时，避免进入/重开时计时器空转
    this._moveTimerStarted = false;
    this._pausedTimer = false;
    this.pendingPause = false;
  }

  async boot() {
    await this.levels.loadAll();
    const loaded = this.storage.read();
    this.save = loaded || createDefaultSave();
    if (this.storage.lastReadState === 'corrupt') this.storageDegraded = true;
    // 关卡被下线后，指向它的中断会话不应再把玩家带进一个不可见的关卡
    const snap = this.save.interruptedSession;
    if (snap && (!this.levels.get(snap.levelId) || this.levels.get(snap.levelId).hidden)) {
      this.save.interruptedSession = null;
    }
    this.recalculateStars();
    this.applySettings();
    return this.save;
  }

  /**
   * 星级阈值调整后的存档修复。
   *
   * 用玩家的历史最高分按当前阈值重新判定星级，只升不降：
   * - 本轮调整都是降低难度，已通关的玩家不应因为旧阈值而少星；
   * - 未通关的关卡不动；
   * - 星级阈值非法时跳过该关。
   */
  recalculateStars() {
    let changed = false;
    const judge = (score, level) => {
      const stars = judgeStars(score, level.starThresholds);
      return stars < 0 ? null : Math.max(1, stars);
    };

    for (const [id, p] of Object.entries(this.save.progress || {})) {
      if (!p?.cleared) continue;
      const level = this.levels.get(id);
      if (!level?.valid || !Array.isArray(level.starThresholds)) continue;
      const earned = judge(Math.max(0, Number(p.highScore) || 0), level);
      if (earned !== null && earned > (Number(p.stars) || 0)) {
        p.stars = earned;
        changed = true;
      }
    }

    for (const item of this.save.localBest || []) {
      const level = this.levels.get(item.levelId);
      if (!level?.valid || !Array.isArray(level.starThresholds)) continue;
      const progress = this.save.progress?.[String(item.levelId)];
      const score = Math.max(0, Number(item.score) || 0, Number(progress?.highScore) || 0);
      if (!score) continue;
      const earned = judge(score, level);
      if (earned !== null && earned > (Number(item.stars) || 0)) {
        item.stars = earned;
        changed = true;
      }
    }

    if (changed) this.storage.write(this.save);
    return changed;
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

  /**
   * 首页“开始 / 继续”按钮的唯一入口。
   *
   * 首页标签与点击必须共用同一个结果：之前标签按 nextLevelId() 显示，
   * 点击却优先用 interruptedSession.levelId，于是暂停在 EX 关或非下一关时，
   * 会出现“外面显示第 X 关、点进去却是第 Y 关”。
   */
  homeEntry() {
    const snap = this.save.interruptedSession;
    const snapId = Number(snap?.levelId);
    if (snap && Number.isInteger(snapId) && Array.isArray(snap.board) && snap.board.length) {
      const level = this.levels.get(snapId);
      if (level && level.valid && !level.hidden) {
        return { levelId: snapId, resume: true };
      }
    }
    return { levelId: this.nextLevelId(), resume: false };
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
    if (level.hidden) {
      this.toast('该关卡暂时下线，敬请期待', 'info');
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
          {
            board: snap.board,
            specials: snap.specials,
            specialActive: snap.specialActive,
            specialFrozen: snap.specialFrozen,
            usedSpecialTypes: snap.usedSpecialTypes,
            specialGenerated: snap.specialGenerated,
            ice: snap.ice,
          },
          { ...level.board, elementTypes: level.board.elementTypes }
        );
        if (board.countTiles() < 20) board = null;
        else {
          /*
           * 加三步会让剩余步数超过关卡初始步数，续玩时不能再按 level.moves 截断，
           * 否则会出现“道具次数被扣了、步数却没加”的问题。
           * 上限按“初始步数 + 全部道具都用在加三步”计算，仅用于防御异常存档。
           */
          const maxMoves = level.moves + 3 * boosterLimit();
          const restoredLeft = Math.max(0, Math.min(Number(snap.movesLeft) || 0, maxMoves));
          const restoredTotalRaw = Number(snap.movesTotal);
          const restoredTotal = Number.isFinite(restoredTotalRaw) && restoredTotalRaw >= restoredLeft
            ? Math.min(restoredTotalRaw, maxMoves)
            : Math.max(level.moves, restoredLeft);
          resumed = {
            movesLeft: restoredLeft,
            movesTotal: restoredTotal,
            counters: GameSession.restoreCounters(snap, board),
            boosterUsage: { shuffle: 0, hammer: 0, addMoves: 0, ...(snap.boostersUsed || {}) },
            chainBest: Number(snap.chainBest) || 0,
            tilesCleared: Number(snap.tilesCleared) || 0,
            turnCount: Number(snap.turnCount) || 0,
          };
        }
      } catch {
        board = null;
      }
    }

    if (!board) board = createBoard({ ...level.board, rules: level.rules || {} }, this.rng);
    board.rules = level.rules || {};

    this.session = new GameSession({ level, board, resumed });
    this.sessionCounter += 1;
    this.introOpen = false;
    this.boosterArmed = null;
    this.renderer?.setBoard(board);
    this.renderer?.setHint(this.suggestMove());
    // 进入 / 续玩 / 重开：计时器先停在满时间，等玩家完成第一次操作后再启动
    this._prepareMoveTimer();
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
      // 立即刷新一次，让道具按钮在结算期间马上置灰，避免“点了没反应”
      this.emitSession();
    } else {
      clearTimeout(this._busyTimer);
      if (this.pendingPause) {
        this.pendingPause = false;
        this.pause();
      } else {
        this._startMoveTimer();
        // 解锁后刷新一次，让道具按钮从“结算中”恢复为可点击
        this.emitSession();
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
    // 首次操作之前不计时，避免进入关卡或重开时计时器先跑起来
    if (!this._moveTimerStarted) return;
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
    this._moveTimerStarted = true;
    this._pausedTimer = false;
    const limit = this._moveTimeLimitMs();
    this._moveRemaining = limit;
    this._startMoveTimer();
  }

  /**
   * 进入 / 续玩 / 重开时的计时器状态：停在满时间，但不启动。
   * 第一次操作完成后再由 _resetMoveTimer() 正式开跑。
   */
  _prepareMoveTimer() {
    this._stopMoveTimer();
    this._moveTimerStarted = false;
    this._pausedTimer = false;
    this.pendingPause = false;
    this._moveRemaining = this._moveTimeLimitMs();
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

    // 优先使用合法的可行交换（会 respecting EX-5 冷却等规则）
    const move = findAnyValidMove(s.board) || this.suggestMove();
    if (move) {
      this.toast('思考时间到，自动执行一步', 'warn');
      await this.handleSwap(move.a, move.b);
      return;
    }

    // 没有可行交换：直接消耗一步，交给 afterMove 自动重排
    this.toast('思考时间到，没有可行交换，自动重排', 'warn');
    s.spendMove();
    s.pendingFreeze = true;
    await this.afterMove();
  }

  async handleSwap(from, to) {
    if (this.busy) return { ok: false, error: 'BUSY' };
    const s = this.session;
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS) return { ok: false, error: 'STATE_MISMATCH' };
    if (!from || !to || !isAdjacent(from, to)) return { ok: false, error: 'INVALID_COORD' };

    // EX-5 节律：已使用的特殊方块被冻住，禁止移动且无提示
    if (s.board.rules?.specialCycle) {
      const frozen = (r, c) => s.board.specialAt(r, c) && s.board.isSpecialFrozen(r, c);
      if (frozen(from.r, from.c) || frozen(to.r, to.c)) {
        return { ok: false, error: 'FROZEN_SPECIAL' };
      }
    }

    if (!s.board.isFree(from.r, from.c) || !s.board.isFree(to.r, to.c)) {
      this.toast('冰块覆盖的元素不能交换', 'warn');
      return { ok: false, error: 'BLOCKED' };
    }

    // 只有真正会执行的交换才暂停计时，非法点击不打断思考时间
    this._stopMoveTimer();
    this.setBusy(true);
    try {
      const effect = planSpecialSwap(s.board, from, to, this.rng);
      if (effect?.upgradeRainbow) {
        // EX-1 升阶：两个条纹合成一个彩虹，另一个降为普通元素
        this.audio.play('special');
        await this.renderer?.playSpecialSwap(from, to, effect.combo);
        s.board.swap(from, to);
        s.board.setType(to.r, to.c, s.board.typeAt(to.r, to.c), SPECIAL.RAINBOW);
        s.board.setType(from.r, from.c, s.board.typeAt(from.r, from.c));
        s.spendMove();
        s.pendingFreeze = true;
        this.renderer?.syncBoard(s.board);
        this.toast('两个条纹合成为彩虹', 'good');
        this.emitSession();
        // 降为普通元素后如果顺势形成了连线，正常结算掉，避免棋盘上留下现成三连
        await this.runCascade({ preferred: [from, to] });
        await this.afterMove();
        return { ok: true };
      }
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
    // 先重置并启动下一次思考的计时，再落盘与刷新，界面能立刻显示满时间
    this._resetMoveTimer();
    this.saveSession();
    this.renderer?.setHint(this.tutorial?.active ? this.suggestMove() : null);
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
    // 仅当本次星级更高时才更新星级记录（AC-08）
    this.save.progress[id] = {
      unlocked: true,
      cleared: true,
      stars: Math.max(prev.stars, result.stars),
      highScore: Math.max(prev.highScore, result.finalScore),
      clearedAt: prev.clearedAt || result.at,
    };

    const nextId = String(result.levelId + 1);
    const nextLevel = this.levels.get(result.levelId + 1);
    if (nextLevel && !nextLevel.hidden) {
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

    // 累计总得分 = 各可见关卡历史最高分之和（已下线关卡不计入）
    this.save.player.totalScore = Object.entries(this.save.progress).reduce((sum, [id, p]) => {
      const lv = this.levels.get(id);
      return lv && !lv.hidden ? sum + p.highScore : sum;
    }, 0);
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
    if (!s || s.state !== SESSION_STATE.IN_PROGRESS || this.busy) return { ok: false };
    const check = checkBooster(id, {
      usedTotal: s.boosterUsedTotal,
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
      usedTotal: s.boosterUsedTotal,
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

    const consumed = consumeBooster(id, { used: s.boosterUsage[id] });
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
      // 使用道具后重置思考时间，避免刚用完道具就被计时器逼着走
      this._resetMoveTimer();
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
    const usedTotal = s.boosterUsedTotal;
    const limit = boosterLimit();
    const remaining = Math.max(0, limit - usedTotal);
    const boosters = Object.values(BOOSTERS).map((def) => {
      const check = checkBooster(def.id, {
        usedTotal,
        disabled: s.level.disabledBoosters,
        state: s.state,
      });
      return {
        id: def.id,
        name: def.name,
        desc: def.desc,
        // 三种道具共用次数池：count 是共享剩余次数
        count: remaining,
        used: s.boosterUsage[def.id],
        usedTotal,
        limit,
        disabled: (s.level.disabledBoosters || []).includes(def.id),
        // 结算动画期间也置灰，避免玩家点了却没有反应
        available: check.ok && !this.busy,
        armed: this.boosterArmed === def.id,
        reason: check.message || '',
      };
    });
    return {
      scene: SCENE.GAME,
      sessionId: this.sessionCounter,
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
        ? {
          limit: this._moveTimeLimitMs(),
          remaining: Math.max(0, Math.round(this._moveRemaining)),
          started: this._moveTimerStarted,
        }
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
