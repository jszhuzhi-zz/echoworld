/**
 * 无限世界地图 - 3D 大富翁
 * 基于图论的道路网络 + 马斯洛需求分级建筑体系
 *
 * 设计原则:
 * - 无自动产出，所有收益来自玩家互动
 * - 建筑升级仅靠 "被他人使用" 或 "引荐新人"
 * - 不使用他人设施 → 生存指标下降 → 警报 → 死亡
 */

// ============ 马斯洛需求分级建筑目录 ============

export interface BuildingTemplate {
  type: string;
  name: string;
  maslowLevel: number;   // 1-5
  cost: number;           // 建造费用 CC
  baseFee: number;        // 使用费 CC (支付给业主)
  effects: Partial<Record<'hunger' | 'energy' | 'happiness', number>>;
  icon: string;
  description: string;
  isBank?: boolean;
}

export const MASLOW_BUILDINGS: BuildingTemplate[] = [
  // ── Level 1: 生理需求 (Physiological) ──
  { type: 'food_stand',    name: '小食摊',   maslowLevel: 1, cost: 100,  baseFee: 10,  effects: { hunger: 20 },                     icon: '🍜', description: '简单的街边食物' },
  { type: 'water_station', name: '水站',     maslowLevel: 1, cost: 80,   baseFee: 8,   effects: { hunger: 10, energy: 5 },           icon: '💧', description: '提供干净饮用水' },
  { type: 'shelter',       name: '简易棚',   maslowLevel: 1, cost: 120,  baseFee: 12,  effects: { energy: 15 },                     icon: '🛖', description: '遮风挡雨的住所' },
  // ── Level 2: 安全需求 (Safety) ──
  { type: 'clinic',        name: '诊所',     maslowLevel: 2, cost: 300,  baseFee: 25,  effects: { hunger: 10, energy: 10 },          icon: '🏥', description: '基础医疗服务' },
  { type: 'pharmacy',      name: '药店',     maslowLevel: 2, cost: 250,  baseFee: 20,  effects: { energy: 15, hunger: 5 },           icon: '💊', description: '药品和保健品' },
  { type: 'savings',       name: '储蓄所',   maslowLevel: 2, cost: 400,  baseFee: 0,   effects: {},                                 icon: '🏧', description: '存款和小额贷款', isBank: true },
  // ── Level 3: 社交需求 (Belonging) ──
  { type: 'tea_house',     name: '茶馆',     maslowLevel: 3, cost: 600,  baseFee: 40,  effects: { happiness: 20 },                   icon: '🍵', description: '品茶交友的去处' },
  { type: 'bar',           name: '酒吧',     maslowLevel: 3, cost: 700,  baseFee: 50,  effects: { happiness: 15, hunger: 10 },       icon: '🍻', description: '社交娱乐场所' },
  { type: 'community',     name: '社区中心', maslowLevel: 3, cost: 800,  baseFee: 45,  effects: { happiness: 8, energy: 8, hunger: 8 }, icon: '🏘️', description: '社区活动中心' },
  // ── Level 4: 尊重需求 (Esteem) ──
  { type: 'restaurant',    name: '高级餐厅', maslowLevel: 4, cost: 1500, baseFee: 100, effects: { hunger: 35, happiness: 15 },       icon: '🍽️', description: '精致的用餐体验' },
  { type: 'hotel',         name: '精品酒店', maslowLevel: 4, cost: 1800, baseFee: 120, effects: { energy: 30, happiness: 20 },       icon: '🏨', description: '高品质住宿休息' },
  { type: 'bank',          name: '银行',     maslowLevel: 4, cost: 2500, baseFee: 0,   effects: {},                                 icon: '🏦', description: '大额金融服务', isBank: true },
  // ── Level 5: 自我实现 (Self-Actualization) ──
  { type: 'academy',       name: '学院',     maslowLevel: 5, cost: 4000, baseFee: 200, effects: { happiness: 15, energy: 15, hunger: 15 }, icon: '🎓', description: '知识与技能提升' },
  { type: 'gallery',       name: '艺术馆',   maslowLevel: 5, cost: 3500, baseFee: 180, effects: { happiness: 40 },                   icon: '🎨', description: '审美与创造力源泉' },
  { type: 'hub',           name: '创业中心', maslowLevel: 5, cost: 6000, baseFee: 300, effects: { happiness: 20, energy: 10 },       icon: '🚀', description: '实现梦想的孵化器' },
];

/** 升级所需条件 (index = 目标等级 - 1) */
const UPGRADE_THRESHOLDS = [
  { uses: 0,   referrals: 0 },  // Lv.1 起始
  { uses: 10,  referrals: 1 },  // → Lv.2
  { uses: 25,  referrals: 2 },  // → Lv.3
  { uses: 50,  referrals: 4 },  // → Lv.4
  { uses: 100, referrals: 7 },  // → Lv.5
];

// ============ 地图节点 ============

export type NodeType = 'road' | 'intersection' | 'start' | 'event' | 'tax' | 'welfare' | 'lot';

export interface MapNode {
  id: number;
  x: number;
  y: number;
  type: NodeType;
  connections: number[];
  building?: WorldBuilding;
}

export interface WorldBuilding {
  templateType: string;
  ownerId: string;
  ownerName: string;
  name: string;
  level: number;
  usageCount: number;
  referralCredits: number;
}

// ============ 玩家状态 ============

export interface PlayerWorldState {
  entityId: string;
  nodeId: number;
  hunger: number;       // 0-100
  energy: number;       // 0-100
  happiness: number;    // 0-100
  alive: boolean;
  actionsToday: number;
  maxActions: number;
  pendingRoll: number | null;
  turnsPlayed: number;
  referralCount: number;
}

export interface DirectionOption {
  nodeId: number;
  x: number;
  y: number;
  label: string;
}

export interface MoveResult {
  path: { x: number; y: number }[];
  finalNode: MapNode;
  events: string[];
  stats: { hunger: number; energy: number; happiness: number; alive: boolean };
}

// ============ 无限世界 ============

export class InfiniteWorld {
  nodes: Map<number, MapNode> = new Map();
  private coordIndex: Map<string, number> = new Map();
  players: Map<string, PlayerWorldState> = new Map();
  private nextId = 0;

  constructor() {
    this.generateMap();
  }

  // ── 地图生成 ──

  private generateMap(): void {
    const GRID = 64;
    const SPACING = 8;

    // 主干道节点 (水平路 + 垂直路，节点间距 2)
    for (let r = 0; r <= GRID; r += SPACING) {
      for (let c = 0; c <= GRID; c += 2) {
        this.ensureNode(c, r, this.classifyNode(c, r, SPACING));
      }
      for (let c = 0; c <= GRID; c += 2) {
        if (c % SPACING !== 0) {
          this.ensureNode(r, c, this.classifyNode(r, c, SPACING));
        }
      }
    }

    // 连接相邻节点 (距离 ≤ 2)
    for (const node of this.nodes.values()) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const nid = this.coordIndex.get(`${node.x + dx},${node.y + dy}`);
        if (nid !== undefined && !node.connections.includes(nid)) {
          node.connections.push(nid);
        }
      }
    }

    // 在交叉路口旁添加建筑地块
    const intersections = [...this.nodes.values()].filter(
      n => n.type === 'intersection' || n.type === 'start'
    );
    for (const node of intersections) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const lx = node.x + dx, ly = node.y + dy;
        if (!this.coordIndex.has(`${lx},${ly}`) && this.hash(lx, ly) % 3 !== 0) {
          const lot = this.ensureNode(lx, ly, 'lot');
          lot.connections.push(node.id);
          node.connections.push(lot.id);
        }
      }
    }
  }

  private ensureNode(x: number, y: number, type: NodeType): MapNode {
    const key = `${x},${y}`;
    const existing = this.coordIndex.get(key);
    if (existing !== undefined) return this.nodes.get(existing)!;
    const node: MapNode = { id: this.nextId++, x, y, type, connections: [] };
    this.nodes.set(node.id, node);
    this.coordIndex.set(key, node.id);
    return node;
  }

  private classifyNode(x: number, y: number, spacing: number): NodeType {
    if (x === 0 && y === 0) return 'start';
    if (x % spacing === 0 && y % spacing === 0) {
      const h = this.hash(x, y);
      if (h % 7 === 0) return 'tax';
      if (h % 11 === 0) return 'welfare';
      if (h % 5 === 0) return 'event';
      return 'intersection';
    }
    return 'road';
  }

  private hash(x: number, y: number): number {
    let h = (x * 374761 + y * 668265) ^ 0x5555;
    h = Math.abs((h ^ (h >> 13)) * 127413);
    return h & 0x7FFFFFFF;
  }

  // ── 玩家管理 ──

  initPlayer(entityId: string): PlayerWorldState {
    if (this.players.has(entityId)) return this.players.get(entityId)!;
    const startId = this.coordIndex.get('0,0') ?? 0;
    const state: PlayerWorldState = {
      entityId,
      nodeId: startId,
      hunger: 80,
      energy: 80,
      happiness: 80,
      alive: true,
      actionsToday: 0,
      maxActions: 8,
      pendingRoll: null,
      turnsPlayed: 0,
      referralCount: 0,
    };
    this.players.set(entityId, state);
    return state;
  }

  getPlayer(entityId: string): PlayerWorldState | undefined {
    return this.players.get(entityId);
  }

  // ── 骰子与移动 ──

  rollDice(entityId: string): { roll: number; directions: DirectionOption[] } | null {
    const state = this.players.get(entityId);
    if (!state?.alive || state.actionsToday >= state.maxActions) return null;

    const roll = Math.floor(Math.random() * 6) + 1;
    state.pendingRoll = roll;

    const node = this.nodes.get(state.nodeId)!;
    const directions: DirectionOption[] = [];

    for (const cid of node.connections) {
      const cn = this.nodes.get(cid)!;
      if (cn.type === 'lot') continue; // 不能走进纯地块
      const dx = cn.x - node.x, dy = cn.y - node.y;
      let label = '前方';
      if (dx > 0) label = '东 →';
      else if (dx < 0) label = '← 西';
      else if (dy > 0) label = '南 ↓';
      else if (dy < 0) label = '↑ 北';
      directions.push({ nodeId: cid, x: cn.x, y: cn.y, label });
    }
    return { roll, directions };
  }

  moveToDirection(entityId: string, firstStepNodeId: number): MoveResult | null {
    const state = this.players.get(entityId);
    if (!state?.alive || state.pendingRoll === null) return null;

    const steps = state.pendingRoll;
    state.pendingRoll = null;
    state.actionsToday++;
    state.turnsPlayed++;

    // 沿道路行走
    let current = firstStepNodeId;
    let prev = state.nodeId;
    const startNode = this.nodes.get(state.nodeId)!;
    const path: { x: number; y: number }[] = [{ x: startNode.x, y: startNode.y }];
    path.push({ x: this.nodes.get(current)!.x, y: this.nodes.get(current)!.y });

    for (let i = 1; i < steps; i++) {
      const node = this.nodes.get(current)!;
      const nextOptions = node.connections.filter(
        id => id !== prev && this.nodes.get(id)!.type !== 'lot'
      );
      if (nextOptions.length === 0) break; // 死胡同
      const nextId = nextOptions[Math.floor(Math.random() * nextOptions.length)];
      path.push({ x: this.nodes.get(nextId)!.x, y: this.nodes.get(nextId)!.y });
      prev = current;
      current = nextId;
    }

    state.nodeId = current;

    // 生存指标衰减
    state.hunger = Math.max(0, state.hunger - 5);
    state.energy = Math.max(0, state.energy - 3);
    state.happiness = Math.max(0, state.happiness - 2);

    const events: string[] = [];
    const finalNode = this.nodes.get(current)!;

    // 格子效果
    if (finalNode.type === 'event') events.push('RANDOM_EVENT');
    else if (finalNode.type === 'tax') events.push('TAX');
    else if (finalNode.type === 'welfare') {
      state.hunger = Math.min(100, state.hunger + 10);
      state.energy = Math.min(100, state.energy + 5);
      events.push('WELFARE');
    }
    if (finalNode.building) events.push('BUILDING');

    // 生死检查
    if (state.hunger <= 0 || state.energy <= 0) {
      state.alive = false;
      events.push('DEATH');
    } else if (state.hunger <= 20) {
      events.push('HUNGER_WARNING');
    } else if (state.energy <= 15) {
      events.push('ENERGY_WARNING');
    }

    return {
      path,
      finalNode,
      events,
      stats: {
        hunger: state.hunger,
        energy: state.energy,
        happiness: state.happiness,
        alive: state.alive,
      },
    };
  }

  // ── 建筑操作 ──

  buildOnNode(
    entityId: string,
    nodeId: number,
    templateType: string,
    ownerName: string,
    customName?: string,
  ): { building: WorldBuilding; template: BuildingTemplate } | null {
    const node = this.nodes.get(nodeId);
    if (!node || node.type !== 'lot' || node.building) return null;

    const template = MASLOW_BUILDINGS.find(b => b.type === templateType);
    if (!template) return null;

    const building: WorldBuilding = {
      templateType,
      ownerId: entityId,
      ownerName,
      name: customName || template.name,
      level: 1,
      usageCount: 0,
      referralCredits: 0,
    };
    node.building = building;
    return { building, template };
  }

  useBuilding(
    entityId: string,
    nodeId: number,
  ): {
    fee: number;
    effects: Record<string, number>;
    building: WorldBuilding;
    template: BuildingTemplate;
    upgraded: boolean;
  } | null {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return null;

    const building = node.building;
    const template = MASLOW_BUILDINGS.find(b => b.type === building.templateType);
    if (!template) return null;

    // 不能使用自己的设施
    if (building.ownerId === entityId) return null;

    const state = this.players.get(entityId);
    if (!state) return null;

    // 费用 (等级加成)
    const levelMult = 1 + (building.level - 1) * 0.3;
    const fee = Math.floor(template.baseFee * levelMult);

    // 效果 (等级加成)
    const effectMult = 1 + (building.level - 1) * 0.2;
    const effects: Record<string, number> = {};
    for (const [stat, val] of Object.entries(template.effects)) {
      const boost = Math.floor((val as number) * effectMult);
      effects[stat] = boost;
      if (stat === 'hunger') state.hunger = Math.min(100, state.hunger + boost);
      else if (stat === 'energy') state.energy = Math.min(100, state.energy + boost);
      else if (stat === 'happiness') state.happiness = Math.min(100, state.happiness + boost);
    }

    // 使用计数 & 自动升级
    building.usageCount++;
    let upgraded = false;
    if (building.level < 5) {
      const th = UPGRADE_THRESHOLDS[building.level]; // next level threshold
      if (building.usageCount >= th.uses || building.referralCredits >= th.referrals) {
        building.level++;
        upgraded = true;
      }
    }

    return { fee, effects, building, template, upgraded };
  }

  /** 引荐新人 → 推荐人名下所有建筑获得引荐积分 */
  addReferralCredit(referrerEntityId: string): void {
    for (const node of this.nodes.values()) {
      if (node.building?.ownerId === referrerEntityId) {
        node.building.referralCredits++;
      }
    }
    const state = this.players.get(referrerEntityId);
    if (state) state.referralCount++;
  }

  /** 死亡后重生到起点 */
  respawn(entityId: string): PlayerWorldState | null {
    const state = this.players.get(entityId);
    if (!state) return null;
    state.nodeId = this.coordIndex.get('0,0') ?? 0;
    state.alive = true;
    state.hunger = 50;
    state.energy = 50;
    state.happiness = 50;
    state.pendingRoll = null;
    return state;
  }

  // ── 查询 ──

  getVisibleNodes(cx: number, cy: number, radius = 20): MapNode[] {
    const result: MapNode[] = [];
    for (const node of this.nodes.values()) {
      if (Math.abs(node.x - cx) <= radius && Math.abs(node.y - cy) <= radius) {
        result.push(node);
      }
    }
    return result;
  }

  getAllPlayerStates(): PlayerWorldState[] {
    return Array.from(this.players.values());
  }

  resetDailyActions(): void {
    for (const state of this.players.values()) {
      state.actionsToday = 0;
    }
  }

  setMaxActions(limit: number): void {
    const clamped = Math.max(1, Math.min(20, limit));
    for (const state of this.players.values()) {
      state.maxActions = clamped;
    }
  }

  /** 获取附近有建筑的地块 (用于建造选址) */
  getNearbyLots(cx: number, cy: number, radius = 6): MapNode[] {
    return this.getVisibleNodes(cx, cy, radius).filter(
      n => n.type === 'lot' && !n.building
    );
  }
}
