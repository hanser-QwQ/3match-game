/**
 * M08 会话状态机 GameSession（应用层）
 *
 * 维护"进行中 / 暂停 / 已结算"三态，以及步数、目标进度、道具使用计数。
 * 状态迁移集中在此处，渲染器与输入控制器不各自维护标志位，
 * 避免出现"画面已经结算但状态仍是进行中"这类不一致（TB-03）。
 */

import { SESSION_STATE } from '../core/constants.js';
import { createCounters, goalTasks, isGoalComplete } from '../domain/goals.js';

export class GameSession {
  constructor({ level, board, resumed = null }) {
    this.level = level;
    this.board = board;
    this.state = SESSION_STATE.IN_PROGRESS;
    this.movesLeft = resumed?.movesLeft ?? level.moves;
    /*
     * 加三步会同时增加 movesLeft 与 movesTotal，续玩时必须把两者都恢复，
     * 否则剩余步数会被截回初始值，结算页的总步数也会少掉加成。
     */
    const restoredTotal = Number(resumed?.movesTotal);
    this.movesTotal = Number.isFinite(restoredTotal) && restoredTotal >= this.movesLeft
      ? restoredTotal
      : Math.max(level.moves, this.movesLeft);
    this.counters = resumed?.counters ?? createCounters(board);
    this.boosterUsage = resumed?.boosterUsage ?? { shuffle: 0, hammer: 0, addMoves: 0 };
    this.chainBest = resumed?.chainBest ?? 0;
    this.tilesCleared = resumed?.tilesCleared ?? 0;
    this.turnCount = resumed?.turnCount ?? 0;
    this.goalAnnounced = false;
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.result = null;
  }

  get goalTasks() {
    return goalTasks(this.level.goal, this.counters);
  }

  get goalDone() {
    return isGoalComplete(this.level.goal, this.counters);
  }

  get isOver() {
    return this.state === SESSION_STATE.RESOLVED;
  }

  /** 本关三种道具已经使用的总次数（共享次数池） */
  get boosterUsedTotal() {
    return Object.values(this.boosterUsage).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }

  /** 消耗一步 */
  spendMove() {
    this.movesLeft = Math.max(0, this.movesLeft - 1);
  }

  addMoves(n) {
    this.movesLeft += n;
    this.movesTotal += n;
  }

  /** 吸收一段连锁结算 */
  applyStep(step) {
    this.counters.score += step.score;
    for (const item of step.cleared) {
      this.counters.collected[item.type] = (this.counters.collected[item.type] || 0) + 1;
    }
    this.counters.iceLeft = step.iceLeft ?? this.board.countIce();
    this.chainBest = Math.max(this.chainBest, step.index);
    this.tilesCleared += step.cleared.length;
  }

  pause() {
    if (this.state === SESSION_STATE.IN_PROGRESS) this.state = SESSION_STATE.PAUSED;
  }

  resume() {
    if (this.state === SESSION_STATE.PAUSED) this.state = SESSION_STATE.IN_PROGRESS;
  }

  /** 中断会话快照，写入存档的 interruptedSession */
  snapshot() {
    const first = this.goalTasks[0] || { cleared: 0, total: 0 };
    const boardData = this.board.serialize();
    return {
      levelId: this.level.levelId,
      board: boardData.board,
      specials: boardData.specials,
      specialActive: boardData.specialActive,
      specialFrozen: boardData.specialFrozen,
      usedSpecialTypes: boardData.usedSpecialTypes,
      specialGenerated: boardData.specialGenerated,
      ice: boardData.ice,
      movesLeft: this.movesLeft,
      movesTotal: this.movesTotal,
      score: this.counters.score,
      boostersUsed: { ...this.boosterUsage },
      goalProgress: { cleared: first.cleared, total: first.total },
      collected: { ...this.counters.collected },
      initialIce: this.counters.initialIce,
      chainBest: this.chainBest,
      tilesCleared: this.tilesCleared,
      turnCount: this.turnCount,
    };
  }

  static restoreCounters(snapshot, board) {
    return {
      score: Math.max(0, Number(snapshot.score) || 0),
      collected: { ...(snapshot.collected || {}) },
      iceLeft: board.countIce(),
      initialIce: Number.isFinite(snapshot.initialIce) ? snapshot.initialIce : board.countIce(),
    };
  }
}
