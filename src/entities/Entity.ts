import { v4 as uuidv4 } from 'uuid';
import {
  EntityType,
  EntityStatus,
  Need,
  ResourceType,
  Position,
  WorldTime,
} from '../core/types';

/**
 * 实体 - 世界中所有生命体的基类
 * Base class for all entities (AI agents and human players)
 */
export class Entity {
  readonly id: string;
  readonly type: EntityType;
  name: string;
  status: EntityStatus;
  position: Position;
  createdAt: WorldTime;

  /** 货币余额 */
  currency: number;

  /** 资源库存 */
  inventory: Map<ResourceType, number>;

  /** 每日需求 */
  needs: Need[];

  /** 拥有的建筑ID列表 */
  ownedBuildings: string[];

  /** 每日收入记录 */
  dailyIncome: number;

  /** 每日支出记录 */
  dailyExpense: number;

  /** 信用评分 (0-1000) */
  creditScore: number;

  /** 生存天数 */
  survivalDays: number;

  /** 声望值 */
  reputation: number;

  constructor(
    type: EntityType,
    name: string,
    startingCurrency: number,
    position: Position,
    createdAt: WorldTime,
  ) {
    this.id = uuidv4();
    this.type = type;
    this.name = name;
    this.status = EntityStatus.ACTIVE;
    this.position = position;
    this.createdAt = createdAt;
    this.currency = startingCurrency;
    this.inventory = new Map();
    this.needs = this.initializeNeeds();
    this.ownedBuildings = [];
    this.dailyIncome = 0;
    this.dailyExpense = 0;
    this.creditScore = 500;
    this.survivalDays = 0;
    this.reputation = 50;
  }

  /** 初始化基本需求 */
  private initializeNeeds(): Need[] {
    return [
      { type: ResourceType.FOOD, amount: 3, priority: 10, satisfied: 0 },
      { type: ResourceType.ENERGY, amount: 2, priority: 8, satisfied: 0 },
      { type: ResourceType.GOODS, amount: 1, priority: 5, satisfied: 0 },
    ];
  }

  /** 消费资源以满足需求 */
  consumeDaily(): ConsumptionResult {
    const result: ConsumptionResult = {
      satisfied: [],
      unsatisfied: [],
      totalCost: 0,
    };

    for (const need of this.needs) {
      const available = this.inventory.get(need.type) || 0;
      if (available >= need.amount) {
        this.inventory.set(need.type, available - need.amount);
        need.satisfied = need.amount;
        result.satisfied.push(need.type);
      } else {
        // 部分满足
        this.inventory.set(need.type, 0);
        need.satisfied = available;
        result.unsatisfied.push({
          type: need.type,
          deficit: need.amount - available,
        });
      }
    }

    return result;
  }

  /** 获取资源数量 */
  getResource(type: ResourceType): number {
    return this.inventory.get(type) || 0;
  }

  /** 添加资源 */
  addResource(type: ResourceType, amount: number): void {
    const current = this.inventory.get(type) || 0;
    this.inventory.set(type, current + amount);
  }

  /** 移除资源 */
  removeResource(type: ResourceType, amount: number): boolean {
    const current = this.inventory.get(type) || 0;
    if (current < amount) return false;
    this.inventory.set(type, current - amount);
    return true;
  }

  /** 支付货币 */
  pay(amount: number): boolean {
    if (this.currency < amount) return false;
    this.currency -= amount;
    this.dailyExpense += amount;
    return true;
  }

  /** 接收货币 */
  receive(amount: number): void {
    this.currency += amount;
    this.dailyIncome += amount;
  }

  /** 每日重置统计 */
  resetDailyStats(): void {
    this.dailyIncome = 0;
    this.dailyExpense = 0;
    for (const need of this.needs) {
      need.satisfied = 0;
    }
  }

  /** 检查是否破产 */
  isBankrupt(): boolean {
    return this.currency <= 0 && this.ownedBuildings.length === 0;
  }

  /** 计算净资产 */
  getNetWorth(): number {
    let worth = this.currency;
    for (const [, amount] of this.inventory) {
      worth += amount * 10; // 粗略估值
    }
    return worth;
  }

  /** 获取实体状态摘要 */
  getSummary(): EntitySummary {
    const inventoryObj: Record<string, number> = {};
    for (const [key, value] of this.inventory) {
      inventoryObj[key] = value;
    }
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.status,
      currency: this.currency,
      inventory: inventoryObj,
      buildings: this.ownedBuildings.length,
      creditScore: this.creditScore,
      reputation: this.reputation,
      netWorth: this.getNetWorth(),
      survivalDays: this.survivalDays,
    };
  }
}

/** 消费结果 */
export interface ConsumptionResult {
  satisfied: ResourceType[];
  unsatisfied: Array<{ type: ResourceType; deficit: number }>;
  totalCost: number;
}

/** 实体摘要 */
export interface EntitySummary {
  id: string;
  type: EntityType;
  name: string;
  status: EntityStatus;
  currency: number;
  inventory: Record<string, number>;
  buildings: number;
  creditScore: number;
  reputation: number;
  netWorth: number;
  survivalDays: number;
}
