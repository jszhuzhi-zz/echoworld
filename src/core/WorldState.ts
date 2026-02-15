import { WorldConfig, WorldTime } from './types';
import { EventBus } from './EventBus';
import { WorldClock } from './WorldClock';

/**
 * 世界状态 - 维护整个世界的全局状态
 * Maintains the global state of the entire world
 */
export class WorldState {
  readonly config: WorldConfig;
  readonly eventBus: EventBus;
  readonly clock: WorldClock;

  private statistics: WorldStatistics;

  constructor(config: WorldConfig) {
    this.config = config;
    this.eventBus = new EventBus();
    this.clock = new WorldClock(config, this.eventBus);
    this.statistics = {
      totalTransactions: 0,
      totalCurrencyCirculating: 0,
      totalBuildings: 0,
      totalEntities: 0,
      averageWealth: 0,
      giniCoefficient: 0,
      dailyGDP: 0,
    };
  }

  /** 获取当前时间 */
  getTime(): WorldTime {
    return this.clock.getTime();
  }

  /** 更新统计数据 */
  updateStatistics(partial: Partial<WorldStatistics>): void {
    Object.assign(this.statistics, partial);
  }

  /** 获取统计数据 */
  getStatistics(): WorldStatistics {
    return { ...this.statistics };
  }

  /** 获取世界快照（用于序列化/保存） */
  getSnapshot(): WorldSnapshot {
    return {
      config: this.config,
      time: this.clock.getTime(),
      statistics: this.getStatistics(),
      recentEvents: this.eventBus.getRecentEvents(50),
    };
  }
}

/** 世界统计数据 */
export interface WorldStatistics {
  totalTransactions: number;
  totalCurrencyCirculating: number;
  totalBuildings: number;
  totalEntities: number;
  averageWealth: number;
  giniCoefficient: number;       // 基尼系数，衡量贫富差距
  dailyGDP: number;
}

/** 世界快照 */
export interface WorldSnapshot {
  config: WorldConfig;
  time: WorldTime;
  statistics: WorldStatistics;
  recentEvents: unknown[];
}
