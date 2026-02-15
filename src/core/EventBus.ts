import EventEmitter from 'eventemitter3';
import { WorldEvent, WorldEventType } from './types';

/**
 * 世界事件总线 - 所有世界事件的中央调度系统
 * Central event dispatching system for all world events
 */
export class EventBus {
  private emitter: EventEmitter;
  private eventLog: WorldEvent[] = [];
  private maxLogSize: number;

  constructor(maxLogSize = 10000) {
    this.emitter = new EventEmitter();
    this.maxLogSize = maxLogSize;
  }

  /** 发布事件 */
  emit(event: WorldEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize / 2);
    }
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  /** 订阅特定类型事件 */
  on(type: WorldEventType | '*', handler: (event: WorldEvent) => void): void {
    this.emitter.on(type, handler);
  }

  /** 取消订阅 */
  off(type: WorldEventType | '*', handler: (event: WorldEvent) => void): void {
    this.emitter.off(type, handler);
  }

  /** 获取最近的事件日志 */
  getRecentEvents(count = 100): WorldEvent[] {
    return this.eventLog.slice(-count);
  }

  /** 按类型获取事件 */
  getEventsByType(type: WorldEventType, count = 50): WorldEvent[] {
    return this.eventLog
      .filter(e => e.type === type)
      .slice(-count);
  }

  /** 清空事件日志 */
  clearLog(): void {
    this.eventLog = [];
  }
}
