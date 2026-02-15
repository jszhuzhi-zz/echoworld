import { WorldTime, WorldConfig, WorldEventType } from './types';
import { EventBus } from './EventBus';

/**
 * 世界时钟 - 管理世界的时间流逝
 * Manages the passage of time in the world
 */
export class WorldClock {
  private time: WorldTime;
  private config: WorldConfig;
  private eventBus: EventBus;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: WorldConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.time = { day: 1, hour: 0, tick: 0 };
  }

  /** 启动世界时钟 */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.config.tickIntervalMs);
  }

  /** 停止世界时钟 */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 手动推进一个tick */
  tick(): void {
    this.time.tick++;

    const totalTicksPerDay = this.config.hoursPerDay * this.config.ticksPerHour;
    const tickInDay = this.time.tick % totalTicksPerDay;
    const newHour = Math.floor(tickInDay / this.config.ticksPerHour) % this.config.hoursPerDay;

    // 检测新一天开始
    if (newHour === 0 && this.time.hour !== 0) {
      this.time.day++;
      this.eventBus.emit({
        type: WorldEventType.DAY_START,
        data: { day: this.time.day },
        timestamp: { ...this.time },
      });
    }

    // 检测一天结束
    if (newHour === this.config.hoursPerDay - 1 && this.time.hour !== this.config.hoursPerDay - 1) {
      this.eventBus.emit({
        type: WorldEventType.DAY_END,
        data: { day: this.time.day },
        timestamp: { ...this.time },
      });
    }

    this.time.hour = newHour;

    // 发送tick事件
    this.eventBus.emit({
      type: WorldEventType.TICK,
      data: { time: { ...this.time } },
      timestamp: { ...this.time },
    });
  }

  /** 获取当前世界时间 */
  getTime(): WorldTime {
    return { ...this.time };
  }

  /** 是否正在运行 */
  isRunning(): boolean {
    return this.running;
  }

  /** 获取当前天数 */
  getDay(): number {
    return this.time.day;
  }

  /** 格式化时间显示 */
  formatTime(): string {
    return `Day ${this.time.day}, ${String(this.time.hour).padStart(2, '0')}:00 (Tick #${this.time.tick})`;
  }
}
