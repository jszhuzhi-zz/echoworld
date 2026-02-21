import { BuildingType, ResourceType } from '../core/types';

/**
 * 棋盘格子类型
 */
export type TileType = 'corner' | 'property' | 'market' | 'tax' | 'event' | 'bank';

/**
 * 棋盘格子定义
 */
export interface BoardTile {
  id: number;
  name: string;
  icon: string;
  type: TileType;
  color: string;           // CSS color for the tile
  buildingType?: BuildingType;  // For property tiles
  resourceType?: ResourceType;  // For market tiles
  cost?: number;           // Build cost for properties
  description: string;
}

/**
 * 玩家棋盘状态
 */
export interface PlayerBoardState {
  entityId: string;
  position: number;        // 0-27 board tile index
  actionsToday: number;    // Actions used today
  maxActions: number;      // Max actions per day (default 6)
  lastDiceRoll: number;    // Last dice result
  turnsInJail: number;     // Turns stuck in trouble
  passedGo: number;        // Times passed GO
}

/**
 * 28格棋盘定义 (8x8 外圈)
 */
export const BOARD_TILES: BoardTile[] = [
  // ===== 底边 (左→右) position 0-7 =====
  { id: 0,  name: '起点',     icon: '🚀', type: 'corner',   color: '#10b981', description: '经过起点收取基础收入' },
  { id: 1,  name: '农场',     icon: '🌾', type: 'property', color: '#84cc16', buildingType: BuildingType.FARM,       cost: 500,  description: '产出食物' },
  { id: 2,  name: '食品市场', icon: '🍎', type: 'market',   color: '#3b82f6', resourceType: ResourceType.FOOD,       description: '交易食物' },
  { id: 3,  name: '缴税',     icon: '💸', type: 'tax',      color: '#ef4444', description: '缴纳税款' },
  { id: 4,  name: '餐厅',     icon: '🍳', type: 'property', color: '#f97316', buildingType: BuildingType.RESTAURANT, cost: 800,  description: '食物→能源' },
  { id: 5,  name: '住宅',     icon: '🏠', type: 'property', color: '#8b5cf6', buildingType: BuildingType.HOUSE,      cost: 300,  description: '产出劳动力' },
  { id: 6,  name: '机遇',     icon: '🎲', type: 'event',    color: '#a855f7', description: '随机事件' },
  { id: 7,  name: '休息站',   icon: '⛱️', type: 'corner',   color: '#06b6d4', description: '恢复需求满足度' },

  // ===== 右边 (下→上) position 8-13 =====
  { id: 8,  name: '工厂',     icon: '🏭', type: 'property', color: '#64748b', buildingType: BuildingType.FACTORY,    cost: 1000, description: '原料→商品' },
  { id: 9,  name: '原料市场', icon: '🪨', type: 'market',   color: '#3b82f6', resourceType: ResourceType.MATERIAL,   description: '交易原材料' },
  { id: 10, name: '银行',     icon: '🏦', type: 'property', color: '#eab308', buildingType: BuildingType.BANK,       cost: 2000, description: '金融服务' },
  { id: 11, name: '仓库',     icon: '📦', type: 'property', color: '#78716c', buildingType: BuildingType.WAREHOUSE,  cost: 400,  description: '存储资源' },
  { id: 12, name: '贷款所',   icon: '🏧', type: 'bank',     color: '#f59e0b', description: '申请贷款' },
  { id: 13, name: '事件',     icon: '📰', type: 'event',    color: '#a855f7', description: '世界新闻事件' },

  // ===== 顶边 (右→左) position 14-21 =====
  { id: 14, name: '机遇',     icon: '🌟', type: 'corner',   color: '#fbbf24', description: '获得奖励金' },
  { id: 15, name: '高级商铺', icon: '🏬', type: 'property', color: '#ec4899', buildingType: BuildingType.SHOP,       cost: 600,  description: '售卖商品' },
  { id: 16, name: '商品市场', icon: '📱', type: 'market',   color: '#3b82f6', resourceType: ResourceType.GOODS,      description: '交易商品' },
  { id: 17, name: '缴税',     icon: '🏛️', type: 'tax',      color: '#ef4444', description: '缴纳所得税' },
  { id: 18, name: '交易中心', icon: '🏪', type: 'property', color: '#14b8a6', buildingType: BuildingType.MARKET,     cost: 1200, description: '综合交易枢纽' },
  { id: 19, name: '能源市场', icon: '⚡', type: 'market',   color: '#3b82f6', resourceType: ResourceType.ENERGY,     description: '交易能源' },
  { id: 20, name: '投资',     icon: '📈', type: 'event',    color: '#a855f7', description: '投资机会' },
  { id: 21, name: '困境',     icon: '⚠️', type: 'corner',   color: '#dc2626', description: '陷入困境,跳过一回合' },

  // ===== 左边 (上→下) position 22-27 =====
  { id: 22, name: '劳务市场', icon: '👷', type: 'market',   color: '#3b82f6', resourceType: ResourceType.LABOR,      description: '交易劳动力' },
  { id: 23, name: '商店',     icon: '🛒', type: 'property', color: '#ec4899', buildingType: BuildingType.SHOP,       cost: 600,  description: '零售商店' },
  { id: 24, name: '福利',     icon: '🎁', type: 'event',    color: '#10b981', description: '领取福利补贴' },
  { id: 25, name: '存款所',   icon: '💰', type: 'bank',     color: '#f59e0b', description: '存款生息' },
  { id: 26, name: '高级住宅', icon: '🏘️', type: 'property', color: '#8b5cf6', buildingType: BuildingType.HOUSE,      cost: 600,  description: '高级住宅区' },
  { id: 27, name: '事件',     icon: '🎭', type: 'event',    color: '#a855f7', description: '文化娱乐事件' },
];

/**
 * 棋盘状态管理
 */
export class BoardState {
  private playerStates: Map<string, PlayerBoardState> = new Map();
  private dailyActionsLimit = 6;

  /** 初始化玩家棋盘位置 */
  initPlayer(entityId: string): PlayerBoardState {
    const state: PlayerBoardState = {
      entityId,
      position: 0,
      actionsToday: 0,
      maxActions: this.dailyActionsLimit,
      lastDiceRoll: 0,
      turnsInJail: 0,
      passedGo: 0,
    };
    this.playerStates.set(entityId, state);
    return state;
  }

  /** 获取玩家棋盘状态 */
  getPlayerState(entityId: string): PlayerBoardState | undefined {
    return this.playerStates.get(entityId);
  }

  /** 获取或初始化 */
  getOrInit(entityId: string): PlayerBoardState {
    return this.playerStates.get(entityId) || this.initPlayer(entityId);
  }

  /** 掷骰子移动 (1-6) */
  rollAndMove(entityId: string): { roll: number; newPosition: number; tile: BoardTile; passedGo: boolean } | null {
    const state = this.getOrInit(entityId);
    if (state.actionsToday >= state.maxActions) return null;
    if (state.turnsInJail > 0) {
      state.turnsInJail--;
      state.actionsToday++;
      return { roll: 0, newPosition: state.position, tile: BOARD_TILES[state.position], passedGo: false };
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    state.lastDiceRoll = roll;
    const oldPos = state.position;
    state.position = (state.position + roll) % 28;
    state.actionsToday++;

    // Check if passed GO
    let passedGo = false;
    if (state.position < oldPos || (oldPos + roll >= 28)) {
      state.passedGo++;
      passedGo = true;
    }

    const tile = BOARD_TILES[state.position];

    // Handle trouble tile
    if (tile.id === 21) {
      state.turnsInJail = 1;
    }

    return { roll, newPosition: state.position, tile, passedGo };
  }

  /** 每日重置行动次数 */
  resetDailyActions(): void {
    for (const state of this.playerStates.values()) {
      state.actionsToday = 0;
    }
  }

  /** 获取所有棋盘状态 */
  getAllStates(): PlayerBoardState[] {
    return Array.from(this.playerStates.values());
  }

  /** 获取指定位置上的所有玩家 */
  getPlayersAtPosition(position: number): string[] {
    const result: string[] = [];
    for (const state of this.playerStates.values()) {
      if (state.position === position) result.push(state.entityId);
    }
    return result;
  }

  /** 设置每日行动上限 */
  setDailyActionsLimit(limit: number): void {
    this.dailyActionsLimit = Math.max(1, Math.min(20, limit));
    for (const state of this.playerStates.values()) {
      state.maxActions = this.dailyActionsLimit;
    }
  }

  /** 获取棋盘快照 (包含所有格子和玩家位置) */
  getSnapshot(): {
    tiles: BoardTile[];
    players: PlayerBoardState[];
    dailyActionsLimit: number;
  } {
    return {
      tiles: BOARD_TILES,
      players: this.getAllStates(),
      dailyActionsLimit: this.dailyActionsLimit,
    };
  }
}
