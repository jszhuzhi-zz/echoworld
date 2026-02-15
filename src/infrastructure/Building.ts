import { v4 as uuidv4 } from 'uuid';
import {
  BuildingType,
  ResourceType,
  Position,
  WorldTime,
  BuildingLevelConfig,
} from '../core/types';

/**
 * 建筑 - 世界中的基础设施
 * Buildings that entities own and operate for resource production
 */
export class Building {
  readonly id: string;
  readonly type: BuildingType;
  readonly position: Position;
  readonly createdAt: WorldTime;

  ownerId: string;
  name: string;
  level: number;
  durability: number;          // 耐久度 0-100
  efficiency: number;          // 效率 0.0-1.0 (受员工、维护影响)

  /** 输入资源（生产需要消耗的） */
  inputResources: Map<ResourceType, number>;

  /** 输出资源（生产产出的） */
  outputResources: Map<ResourceType, number>;

  /** 每日维护成本 */
  dailyMaintenanceCost: number;

  /** 每日收入 */
  dailyRevenue: number;

  /** 员工数量 */
  workers: number;
  maxWorkers: number;

  constructor(
    type: BuildingType,
    ownerId: string,
    position: Position,
    createdAt: WorldTime,
  ) {
    this.id = uuidv4();
    this.type = type;
    this.ownerId = ownerId;
    this.position = position;
    this.createdAt = createdAt;
    this.name = this.getDefaultName(type);
    this.level = 1;
    this.durability = 100;
    this.efficiency = 1.0;
    this.workers = 0;
    this.dailyRevenue = 0;

    const config = Building.getBuildingConfig(type);
    this.inputResources = new Map(config.inputs);
    this.outputResources = new Map(config.outputs);
    this.dailyMaintenanceCost = config.maintenance;
    this.maxWorkers = config.maxWorkers;
  }

  /** 执行每日生产 */
  produce(ownerInventory: Map<ResourceType, number>): ProductionResult {
    const result: ProductionResult = {
      success: false,
      produced: new Map(),
      consumed: new Map(),
      revenue: 0,
    };

    // 检查输入资源是否足够
    for (const [resource, amount] of this.inputResources) {
      const required = amount * this.efficiency;
      const available = ownerInventory.get(resource) || 0;
      if (available < required) {
        return result; // 资源不足，无法生产
      }
    }

    // 消耗输入资源
    for (const [resource, amount] of this.inputResources) {
      const consumed = amount * this.efficiency;
      const current = ownerInventory.get(resource) || 0;
      ownerInventory.set(resource, current - consumed);
      result.consumed.set(resource, consumed);
    }

    // 产出资源
    for (const [resource, amount] of this.outputResources) {
      const produced = amount * this.efficiency * this.level;
      const current = ownerInventory.get(resource) || 0;
      ownerInventory.set(resource, current + produced);
      result.produced.set(resource, produced);
    }

    // 降低耐久度
    this.durability = Math.max(0, this.durability - 2);
    if (this.durability < 30) {
      this.efficiency = this.durability / 100;
    }

    result.success = true;
    return result;
  }

  /** 维修建筑 */
  repair(cost: number): void {
    this.durability = Math.min(100, this.durability + 30);
    this.efficiency = Math.min(1.0, this.durability / 100 + 0.3);
  }

  /** 升级建筑 */
  upgrade(): BuildingLevelConfig | null {
    if (this.level >= 5) return null;

    this.level++;
    this.maxWorkers += 2;
    this.durability = 100;
    this.efficiency = 1.0;

    // 升级后产出增加
    for (const [resource, amount] of this.outputResources) {
      this.outputResources.set(resource, amount * 1.2);
    }

    return {
      level: this.level,
      buildCost: this.getBuildCost() * this.level,
      dailyOutput: this.level * 1.2,
      dailyMaintenance: this.dailyMaintenanceCost * (1 + this.level * 0.1),
      upgradeCost: this.getUpgradeCost(),
    };
  }

  /** 获取建造成本 */
  getBuildCost(): number {
    return Building.getBuildingConfig(this.type).buildCost;
  }

  /** 获取升级成本 */
  getUpgradeCost(): number {
    return this.getBuildCost() * this.level * 0.8;
  }

  /** 获取建筑摘要 */
  getSummary(): BuildingSummary {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      level: this.level,
      ownerId: this.ownerId,
      position: this.position,
      durability: this.durability,
      efficiency: this.efficiency,
      workers: this.workers,
      maxWorkers: this.maxWorkers,
      dailyMaintenanceCost: this.dailyMaintenanceCost,
    };
  }

  private getDefaultName(type: BuildingType): string {
    const names: Record<BuildingType, string> = {
      [BuildingType.RESTAURANT]: '餐厅',
      [BuildingType.SHOP]: '商店',
      [BuildingType.FACTORY]: '工厂',
      [BuildingType.FARM]: '农场',
      [BuildingType.BANK]: '银行',
      [BuildingType.HOUSE]: '住宅',
      [BuildingType.WAREHOUSE]: '仓库',
      [BuildingType.MARKET]: '市场',
    };
    return names[type] || '建筑';
  }

  /** 获取建筑类型配置 */
  static getBuildingConfig(type: BuildingType): BuildingTypeConfig {
    const configs: Record<BuildingType, BuildingTypeConfig> = {
      [BuildingType.FARM]: {
        buildCost: 500,
        maintenance: 20,
        maxWorkers: 5,
        inputs: [],
        outputs: [[ResourceType.FOOD, 10]],
      },
      [BuildingType.FACTORY]: {
        buildCost: 1000,
        maintenance: 50,
        maxWorkers: 10,
        inputs: [[ResourceType.MATERIAL, 5]],
        outputs: [[ResourceType.GOODS, 8]],
      },
      [BuildingType.RESTAURANT]: {
        buildCost: 800,
        maintenance: 30,
        maxWorkers: 6,
        inputs: [[ResourceType.FOOD, 5]],
        outputs: [[ResourceType.ENERGY, 8]],
      },
      [BuildingType.SHOP]: {
        buildCost: 600,
        maintenance: 25,
        maxWorkers: 4,
        inputs: [[ResourceType.GOODS, 3]],
        outputs: [], // 商店通过销售赚钱，不直接产出
      },
      [BuildingType.BANK]: {
        buildCost: 2000,
        maintenance: 100,
        maxWorkers: 8,
        inputs: [],
        outputs: [],
      },
      [BuildingType.HOUSE]: {
        buildCost: 300,
        maintenance: 10,
        maxWorkers: 0,
        inputs: [],
        outputs: [[ResourceType.LABOR, 2]],
      },
      [BuildingType.WAREHOUSE]: {
        buildCost: 400,
        maintenance: 15,
        maxWorkers: 3,
        inputs: [],
        outputs: [],
      },
      [BuildingType.MARKET]: {
        buildCost: 1200,
        maintenance: 40,
        maxWorkers: 8,
        inputs: [],
        outputs: [],
      },
    };
    return configs[type];
  }
}

/** 生产结果 */
export interface ProductionResult {
  success: boolean;
  produced: Map<ResourceType, number>;
  consumed: Map<ResourceType, number>;
  revenue: number;
}

/** 建筑摘要 */
export interface BuildingSummary {
  id: string;
  type: BuildingType;
  name: string;
  level: number;
  ownerId: string;
  position: Position;
  durability: number;
  efficiency: number;
  workers: number;
  maxWorkers: number;
  dailyMaintenanceCost: number;
}

/** 建筑类型配置 */
export interface BuildingTypeConfig {
  buildCost: number;
  maintenance: number;
  maxWorkers: number;
  inputs: [ResourceType, number][];
  outputs: [ResourceType, number][];
}
