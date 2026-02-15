/**
 * EchoWorld 核心类型定义
 * Core type definitions for the EchoWorld simulation
 */

/** 世界时间 - World time representation */
export interface WorldTime {
  day: number;       // 当前天数
  hour: number;      // 当前小时 (0-23)
  tick: number;      // 总tick数
}

/** 坐标位置 */
export interface Position {
  x: number;
  y: number;
}

/** 实体类型 */
export enum EntityType {
  AI_AGENT = 'ai_agent',
  HUMAN_PLAYER = 'human_player',
}

/** 建筑类型 */
export enum BuildingType {
  RESTAURANT = 'restaurant',       // 饭店
  SHOP = 'shop',                   // 商店
  FACTORY = 'factory',             // 工厂
  FARM = 'farm',                   // 农场
  BANK = 'bank',                   // 银行
  HOUSE = 'house',                 // 住宅
  WAREHOUSE = 'warehouse',         // 仓库
  MARKET = 'market',               // 市场
}

/** 资源类型 */
export enum ResourceType {
  FOOD = 'food',                   // 食物
  MATERIAL = 'material',           // 原材料
  GOODS = 'goods',                 // 商品
  ENERGY = 'energy',               // 能源
  LABOR = 'labor',                 // 劳动力
}

/** 需求类型 */
export interface Need {
  type: ResourceType;
  amount: number;                  // 每日需要量
  priority: number;                // 优先级 1-10
  satisfied: number;               // 当前满足量
}

/** 交易记录 */
export interface Transaction {
  id: string;
  from: string;                    // 卖方ID
  to: string;                      // 买方ID
  resourceType: ResourceType;
  amount: number;
  price: number;                   // 单价(世界货币)
  totalCost: number;
  timestamp: WorldTime;
}

/** 世界事件类型 */
export enum WorldEventType {
  TICK = 'tick',
  DAY_START = 'day_start',
  DAY_END = 'day_end',
  ENTITY_CREATED = 'entity_created',
  ENTITY_REMOVED = 'entity_removed',
  BUILDING_BUILT = 'building_built',
  BUILDING_UPGRADED = 'building_upgraded',
  TRANSACTION = 'transaction',
  MARKET_PRICE_CHANGE = 'market_price_change',
  RULE_EVOLVED = 'rule_evolved',
  ENTITY_BANKRUPT = 'entity_bankrupt',
  ENTITY_ACTION = 'entity_action',
}

/** 世界事件 */
export interface WorldEvent {
  type: WorldEventType;
  data: Record<string, unknown>;
  timestamp: WorldTime;
}

/** 世界配置 */
export interface WorldConfig {
  name: string;
  tickIntervalMs: number;         // tick间隔毫秒
  hoursPerDay: number;             // 每天小时数
  ticksPerHour: number;            // 每小时tick数
  startingCurrency: number;        // 初始货币
  dailyBasicIncome: number;        // 每日基础收入
  taxRate: number;                 // 税率
  maxEntities: number;             // 最大实体数量
  mapWidth: number;
  mapHeight: number;
}

/** 实体状态 */
export enum EntityStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  BANKRUPT = 'bankrupt',
  OFFLINE = 'offline',
}

/** 建筑等级配置 */
export interface BuildingLevelConfig {
  level: number;
  buildCost: number;
  dailyOutput: number;
  dailyMaintenance: number;
  upgradeCost: number;
}
