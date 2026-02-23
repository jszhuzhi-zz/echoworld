import EventEmitter from 'eventemitter3';
import * as fs from 'fs';
import { WorldEvent, WorldEventType } from './types';
import { DATA_DIR, ensureDataDir, dataFile } from './dataDir';

const EVENTS_FILE = dataFile('events.json');

/**
 * 世界事件总线 - 所有世界事件的中央调度系统
 * Central event dispatching system for all world events
 *
 * 全量持久化: 所有事件存储到文件，无条数上限，支持分页查询
 */
export class EventBus {
  private emitter: EventEmitter;
  private eventLog: WorldEvent[] = [];
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _dirty = false;

  constructor() {
    this.emitter = new EventEmitter();
    this._loadFromDisk();
  }

  /** 从磁盘加载历史事件 */
  private _loadFromDisk(): void {
    try {
      ensureDataDir();
      if (fs.existsSync(EVENTS_FILE)) {
        const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.eventLog = arr;
          console.log(`[EventBus] 已加载 ${this.eventLog.length} 条历史事件`);
        }
      }
    } catch (e) {
      console.error('[EventBus] 加载事件文件失败:', e);
    }
  }

  /** 异步写入磁盘 (防抖 5 秒) */
  private _scheduleSave(): void {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (!this._dirty) return;
      this._dirty = false;
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(EVENTS_FILE, JSON.stringify(this.eventLog), 'utf-8');
      } catch (e) {
        console.error('[EventBus] 保存事件文件失败:', e);
      }
    }, 5000);
  }

  /** 发布事件 (自动附加真实时间戳, 无条数上限) */
  emit(event: WorldEvent): void {
    (event as any).realTime = new Date().toISOString();
    this.eventLog.push(event);
    this._scheduleSave();
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

  /** 获取事件总数 */
  getTotalCount(): number {
    return this.eventLog.length;
  }

  /**
   * 分页获取事件 (从最新到最旧)
   * @param page 页码 (从1开始)
   * @param pageSize 每页条数
   * @param type 可选事件类型过滤
   * @returns { events, total, page, pageSize, totalPages }
   */
  getEventsPaginated(page = 1, pageSize = 50, type?: WorldEventType): {
    events: WorldEvent[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    let source = this.eventLog;
    if (type) {
      source = source.filter(e => e.type === type);
    }
    const total = source.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    // 从最新到最旧: 最后一页是最旧的
    const endIndex = total - (safePage - 1) * pageSize;
    const startIndex = Math.max(0, endIndex - pageSize);
    const events = source.slice(startIndex, endIndex).reverse(); // 最新在前
    return { events, total, page: safePage, pageSize, totalPages };
  }

  /** 按类型获取事件 */
  getEventsByType(type: WorldEventType, count = 50): WorldEvent[] {
    return this.eventLog
      .filter(e => e.type === type)
      .slice(-count);
  }

  /** 按实体ID获取事件 */
  getEventsByEntity(entityId: string, count = 100): WorldEvent[] {
    return this.eventLog
      .filter(e => {
        const d = e.data;
        return d.entityId === entityId || d.from === entityId || d.to === entityId || d.borrowerId === entityId;
      })
      .slice(-count);
  }

  /** 清空事件日志 */
  clearLog(): void {
    this.eventLog = [];
    this._scheduleSave();
  }

  /** 立即持久化 (用于优雅关闭) */
  flushToDisk(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      ensureDataDir();
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(this.eventLog), 'utf-8');
      console.log(`[EventBus] 已保存 ${this.eventLog.length} 条事件到磁盘`);
    } catch (e) {
      console.error('[EventBus] 保存事件文件失败:', e);
    }
  }
}
