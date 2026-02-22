import { WorldTime, WorldConfig, WorldEventType } from './types';
import { EventBus } from './EventBus';

/**
 * 世界时钟 - 与真实世界时间同步
 * Synced to real-world UTC time
 */
export class WorldClock {
  private config: WorldConfig;
  private eventBus: EventBus;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastHour = -1;
  private lastDay = '';
  private tickCount = 0;

  constructor(config: WorldConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
  }

  /** 获取基于真实时间的世界时间 */
  getTime(): WorldTime {
    const now = new Date();
    return {
      day: this.daysSinceEpoch(now),
      hour: now.getHours(),
      tick: this.tickCount,
    };
  }

  /** 从固定纪元起算的天数（作为游戏内天数） */
  private daysSinceEpoch(now: Date): number {
    const epoch = new Date('2025-01-01T00:00:00Z');
    return Math.floor((now.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  }

  /** 获取当前真实时间的日期字符串 YYYY-MM-DD */
  private todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** 启动世界时钟 */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastHour = new Date().getHours();
    this.lastDay = this.todayStr();
    // 每分钟检查一次时间变化（真实时间同步）
    this.timer = setInterval(() => this.tick(), 60_000);
    // 立即触发一次
    this.tick();
  }

  /** 停止世界时钟 */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 每分钟检查：检测小时变化和天变化 */
  tick(): void {
    this.tickCount++;
    const now = new Date();
    const curHour = now.getHours();
    const curDay = this.todayStr();

    // 检测新一天开始（真实世界跨天）
    if (curDay !== this.lastDay) {
      this.lastDay = curDay;
      this.eventBus.emit({
        type: WorldEventType.DAY_START,
        data: { day: this.daysSinceEpoch(now) },
        timestamp: this.getTime(),
      });
    }

    // 检测整点变化（用于每小时事件）
    if (curHour !== this.lastHour) {
      const prevHour = this.lastHour;
      this.lastHour = curHour;
      // 一天结束事件
      if (curHour === 23 && prevHour !== 23) {
        this.eventBus.emit({
          type: WorldEventType.DAY_END,
          data: { day: this.daysSinceEpoch(now) },
          timestamp: this.getTime(),
        });
      }
    }

    // 发送tick事件（每分钟）
    this.eventBus.emit({
      type: WorldEventType.TICK,
      data: { time: this.getTime() },
      timestamp: this.getTime(),
    });
  }

  /** 是否正在运行 */
  isRunning(): boolean {
    return this.running;
  }

  /** 获取当前天数 */
  getDay(): number {
    return this.daysSinceEpoch(new Date());
  }

  /** 格式化时间显示 — 显示真实时间 */
  formatTime(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const day = this.daysSinceEpoch(now);
    return `Day ${day}, ${hh}:${mm}`;
  }

  /** 返回真实时间戳（毫秒） */
  getRealTimestamp(): number {
    return Date.now();
  }
}
