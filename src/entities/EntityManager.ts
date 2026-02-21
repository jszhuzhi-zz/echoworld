import {
  EntityType,
  EntityStatus,
  WorldEventType,
  Position,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { Entity } from './Entity';

/**
 * 实体管理器 - 管理世界中所有实体的生命周期
 * Manages the lifecycle of all entities in the world
 */
export class EntityManager {
  private entities: Map<string, Entity> = new Map();
  private worldState: WorldState;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 每天开始时，给予基础收入并重置统计
    this.worldState.eventBus.on(WorldEventType.DAY_START, () => {
      for (const entity of this.entities.values()) {
        if (entity.status === EntityStatus.ACTIVE) {
          entity.receive(this.worldState.config.dailyBasicIncome);
          entity.survivalDays++;
          entity.resetDailyStats();
        }
      }
    });

    // 每天结束时，执行消费并检查破产
    this.worldState.eventBus.on(WorldEventType.DAY_END, () => {
      for (const entity of this.entities.values()) {
        if (entity.status !== EntityStatus.ACTIVE) continue;

        const result = entity.consumeDaily();

        // 未满足需求扣减信用
        if (result.unsatisfied.length > 0) {
          entity.creditScore = Math.max(0, entity.creditScore - 10);
        } else {
          entity.creditScore = Math.min(1000, entity.creditScore + 2);
        }

        // 检查破产
        if (entity.isBankrupt()) {
          entity.status = EntityStatus.BANKRUPT;
          this.worldState.eventBus.emit({
            type: WorldEventType.ENTITY_BANKRUPT,
            data: {
              entityId: entity.id,
              entityName: entity.name,
              survivalDays: entity.survivalDays,
            },
            timestamp: this.worldState.getTime(),
          });
        }
      }

      this.updateWorldStatistics();
    });
  }

  /** 创建新实体 */
  createEntity(
    type: EntityType,
    name: string,
    position?: Position,
  ): Entity {
    if (this.entities.size >= this.worldState.config.maxEntities) {
      throw new Error('World entity limit reached');
    }

    const pos = position || this.randomPosition();
    const entity = new Entity(
      type,
      name,
      this.worldState.config.startingCurrency,
      pos,
      this.worldState.getTime(),
    );

    this.entities.set(entity.id, entity);

    this.worldState.eventBus.emit({
      type: WorldEventType.ENTITY_CREATED,
      data: {
        entityId: entity.id,
        entityType: type,
        entityName: name,
        position: pos,
      },
      timestamp: this.worldState.getTime(),
    });

    return entity;
  }

  /** 恢复已有实体 (服务器重启后重建，使用原始ID) */
  restoreEntity(
    id: string,
    type: EntityType,
    name: string,
  ): Entity {
    if (this.entities.has(id)) return this.entities.get(id)!;
    const pos = this.randomPosition();
    const entity = new Entity(
      type,
      name,
      this.worldState.config.startingCurrency,
      pos,
      this.worldState.getTime(),
    );
    // 覆盖自动生成的ID
    (entity as any).id = id;
    this.entities.set(id, entity);
    return entity;
  }

  /** 移除实体 */
  removeEntity(entityId: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    this.entities.delete(entityId);

    this.worldState.eventBus.emit({
      type: WorldEventType.ENTITY_REMOVED,
      data: { entityId, entityName: entity.name },
      timestamp: this.worldState.getTime(),
    });

    return true;
  }

  /** 获取实体 */
  getEntity(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  /** 获取所有活跃实体 */
  getActiveEntities(): Entity[] {
    return Array.from(this.entities.values())
      .filter(e => e.status === EntityStatus.ACTIVE);
  }

  /** 获取所有实体 */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /** 按类型获取实体 */
  getEntitiesByType(type: EntityType): Entity[] {
    return Array.from(this.entities.values())
      .filter(e => e.type === type);
  }

  /** 获取排行榜（按净资产排序） */
  getLeaderboard(limit = 10): Entity[] {
    return Array.from(this.entities.values())
      .sort((a, b) => b.getNetWorth() - a.getNetWorth())
      .slice(0, limit);
  }

  /** 随机位置 */
  private randomPosition(): Position {
    return {
      x: Math.floor(Math.random() * this.worldState.config.mapWidth),
      y: Math.floor(Math.random() * this.worldState.config.mapHeight),
    };
  }

  /** 更新世界统计数据 */
  private updateWorldStatistics(): void {
    const activeEntities = this.getActiveEntities();
    const totalWealth = activeEntities.reduce((sum, e) => sum + e.getNetWorth(), 0);
    const count = activeEntities.length;

    this.worldState.updateStatistics({
      totalEntities: count,
      averageWealth: count > 0 ? totalWealth / count : 0,
      totalCurrencyCirculating: activeEntities.reduce((sum, e) => sum + e.currency, 0),
      giniCoefficient: this.calculateGini(activeEntities),
    });
  }

  /** 计算基尼系数 */
  private calculateGini(entities: Entity[]): number {
    if (entities.length < 2) return 0;

    const wealths = entities.map(e => e.getNetWorth()).sort((a, b) => a - b);
    const n = wealths.length;
    const totalWealth = wealths.reduce((a, b) => a + b, 0);
    if (totalWealth === 0) return 0;

    let sumOfDiffs = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfDiffs += Math.abs(wealths[i] - wealths[j]);
      }
    }

    return sumOfDiffs / (2 * n * totalWealth);
  }
}
