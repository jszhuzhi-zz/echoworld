/**
 * 无限世界地图 - 3D 大富翁
 * 基于图论的道路网络 + 马斯洛需求分级建筑体系
 *
 * 设计原则:
 * - 无自动产出，所有收益来自玩家互动
 * - 建筑升级仅靠 "被他人使用" 或 "引荐新人"
 * - 不使用他人设施 → 生存指标下降 → 警报 → 死亡
 */

import { getDB } from '../core/Database';

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
  listingPrice?: number;   // 挂牌出售价格 (undefined = 不出售)
  // 银行类建筑自定义利率
  customDepositRate?: number;  // 自定义存款日利率 (如 0.05 = 5%)
  customLoanRate?: number;     // 自定义贷款日利率 (如 0.08 = 8%)
  loanPool?: number;           // 该银行的可贷资金池
  totalDeposits?: number;      // 总存款额
  totalLoansOut?: number;      // 总贷出额
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

export interface PassedBuilding {
  nodeId: number;
  x: number;
  y: number;
  building: WorldBuilding;
  template: BuildingTemplate;
  fee: number;
}

export interface MoveResult {
  path: { x: number; y: number }[];
  finalNode: MapNode;
  events: string[];
  stats: { hunger: number; energy: number; happiness: number; alive: boolean };
  fork: boolean;           // true = 遇到岔路需要选择
  directions: DirectionOption[]; // fork时的可选方向
  remainingSteps: number;  // 剩余步数
  passedBuildings: PassedBuilding[]; // 路过的可消费建筑
}

// ============ 银行存贷记录 ============

export interface PlayerDeposit {
  id: string;
  entityId: string;
  nodeId: number;        // 存款所在银行建筑
  amount: number;        // 本金
  interestRate: number;  // 日利率
  accumulatedInterest: number; // 累计利息
  createdDay: number;    // 创建时的天数
}

export interface PlayerLoan {
  id: string;
  entityId: string;
  nodeId: number;        // 贷款所在银行建筑
  principal: number;     // 本金
  remainingBalance: number; // 剩余欠款（含利息）
  interestRate: number;  // 日利率
  createdDay: number;    // 创建时的天数
  status: 'active' | 'paid' | 'overdue';
}

// ============ 资产交易 ============

export interface TradeOffer {
  id: string;
  nodeId: number;
  buildingName: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  price: number;       // 买方出价 (含税)
  tax: number;         // 交易税
  netPrice: number;    // 卖方实收
  createdAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

const TRADE_TAX_RATE = 0.10; // 10% transaction tax

// ============ 无限世界 ============

const SPACING = 14;
/** 每个方格（intersection 围成的区域）期望容纳的玩家数 */
const PLAYERS_PER_BLOCK = 5;
/** 最小世界半径 = 1 个方格 */
const MIN_BOUNDS = SPACING;

export class InfiniteWorld {
  nodes: Map<number, MapNode> = new Map();
  private coordIndex: Map<string, number> = new Map();
  players: Map<string, PlayerWorldState> = new Map();
  tradeOffers: Map<string, TradeOffer> = new Map();
  playerDeposits: PlayerDeposit[] = [];
  playerLoans: PlayerLoan[] = [];
  private depositIdCounter = 0;
  private loanIdCounter = 0;
  private tradeIdCounter = 0;
  private nextId = 0;
  private generatedChunks: Set<string> = new Set();
  private worldBounds = MIN_BOUNDS;

  constructor() {
    // 预生成原点附近的最小区域 (1个方格)
    this.ensureRegion(0, 0, MIN_BOUNDS);
  }

  // ── 世界边界追踪 ──

  /** 获取当前世界半径 */
  getWorldBounds(): number { return this.worldBounds; }

  /**
   * 根据玩家人数动态计算世界边界。
   * 每个 SPACING×SPACING 方格期望容纳 ~PLAYERS_PER_BLOCK 个玩家,
   * 人少时世界很小（容易遇到彼此），人多时自动扩大。
   */
  private updateBounds(): void {
    const playerCount = this.players.size;
    // 需要的方格数
    const blocksNeeded = Math.max(1, Math.ceil(playerCount / PLAYERS_PER_BLOCK));
    // 方形排列：边长 = ceil(sqrt(blocksNeeded))
    const gridSide = Math.ceil(Math.sqrt(blocksNeeded));
    // 世界半径 = 方格数 × 间距 (从原点向四周扩展，所以半径 = ceil(gridSide/2) * SPACING)
    const newBounds = Math.max(MIN_BOUNDS, Math.ceil(gridSide / 2) * SPACING);

    if (newBounds > this.worldBounds) {
      this.worldBounds = newBounds;
      // 扩大时预生成新区域
      this.ensureRegion(0, 0, this.worldBounds);
    }
  }

  // ── 懒加载地图生成 ──

  /** 确保 (cx, cy) 为中心、radius 半径的区域已生成 */
  ensureRegion(cx: number, cy: number, radius: number): void {
    // 按 SPACING 对齐到区块边界
    const chunkSize = SPACING * 2;
    const minCX = Math.floor((cx - radius) / chunkSize) * chunkSize;
    const maxCX = Math.ceil((cx + radius) / chunkSize) * chunkSize;
    const minCY = Math.floor((cy - radius) / chunkSize) * chunkSize;
    const maxCY = Math.ceil((cy + radius) / chunkSize) * chunkSize;

    for (let bx = minCX; bx <= maxCX; bx += chunkSize) {
      for (let by = minCY; by <= maxCY; by += chunkSize) {
        this.ensureChunk(bx, by, chunkSize);
      }
    }
  }

  /** 对齐到 SPACING 的整数倍 (向下取整) */
  private alignDown(v: number, step: number): number {
    return Math.floor(v / step) * step;
  }

  /** 对齐到偶数 (向上取整) */
  private alignEvenUp(v: number): number {
    return v % 2 === 0 ? v : v + 1;
  }

  /** 生成一个区块内的所有节点和连接 */
  private ensureChunk(ox: number, oy: number, size: number): void {
    const key = `${ox},${oy}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    const newNodes: MapNode[] = [];

    // 找到区块内所有 SPACING 对齐的行/列
    const rowStart = this.alignDown(ox, SPACING);
    const rowEnd = ox + size;
    const colStart = this.alignDown(oy, SPACING);
    const colEnd = oy + size;

    for (let row = rowStart; row <= rowEnd; row += SPACING) {
      // 水平主干道: 在 row 行上每隔2个单位放节点
      const cStart = this.alignEvenUp(oy);
      for (let c = cStart; c < colEnd; c += 2) {
        const n = this.ensureNode(c, row, this.classifyNode(c, row));
        newNodes.push(n);
      }
      // 垂直主干道: 在 row 列上每隔2个单位放节点 (跳过已有交叉节点)
      const rStart = this.alignEvenUp(ox);
      for (let r = rStart; r < rowEnd; r += 2) {
        if (r % SPACING === 0 && row % SPACING === 0) continue; // 跳过交叉点 (已生成)
        const n = this.ensureNode(row, r, this.classifyNode(row, r));
        newNodes.push(n);
      }
    }

    // 连接新生成的节点 (包括与邻居区块的边界节点)
    for (const node of newNodes) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const nid = this.coordIndex.get(`${node.x + dx},${node.y + dy}`);
        if (nid !== undefined && !node.connections.includes(nid)) {
          node.connections.push(nid);
          const neighbor = this.nodes.get(nid)!;
          if (!neighbor.connections.includes(node.id)) neighbor.connections.push(node.id);
        }
      }
    }

    // 在交叉路口旁添加建筑地块
    for (const node of newNodes) {
      if (node.type !== 'intersection' && node.type !== 'start') continue;
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

  private classifyNode(x: number, y: number): NodeType {
    if (x === 0 && y === 0) return 'start';
    if (x % SPACING === 0 && y % SPACING === 0) {
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

    // 先临时注册，让 updateBounds 计算包含新玩家的边界，
    // 确保世界扩大后再选出生点（新玩家可以出生在新扩展区域）
    const placeholder: PlayerWorldState = {
      entityId,
      nodeId: 0,
      hunger: 80,
      energy: 80,
      happiness: 80,
      alive: true,
      actionsToday: 0,
      maxActions: 20,
      pendingRoll: null,
      turnsPlayed: 0,
      referralCount: 0,
    };
    this.players.set(entityId, placeholder);
    this.updateBounds();

    // 在扩展后的世界范围内选择出生点
    placeholder.nodeId = this.findRandomSpawnNode();
    this.markDirty();
    return placeholder;
  }

  /** 在当前世界范围内找到一个随机可行走节点作为出生点 */
  private findRandomSpawnNode(): number {
    const bounds = this.worldBounds;
    // 候选节点: 当前世界范围内所有 road / intersection / start 类型
    const candidates: MapNode[] = [];
    for (const node of this.nodes.values()) {
      if (Math.abs(node.x) > bounds || Math.abs(node.y) > bounds) continue;
      if (node.type === 'road' || node.type === 'intersection' || node.type === 'start') {
        candidates.push(node);
      }
    }
    if (candidates.length === 0) return this.coordIndex.get('0,0') ?? 0;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return chosen.id;
  }

  getPlayer(entityId: string): PlayerWorldState | undefined {
    return this.players.get(entityId);
  }

  // ── 骰子与移动 ──

  rollDice(entityId: string): { roll: number; directions: DirectionOption[] } | null {
    const state = this.players.get(entityId);
    if (!state?.alive || state.actionsToday >= state.maxActions) return null;
    // 体力耗尽无法行动（但不死亡，等待恢复）
    if (state.energy <= 0) return null;

    // 确保玩家周围区域已生成 (骰子最大6步 × 步距2 = 12格)
    const curNode = this.nodes.get(state.nodeId);
    if (curNode) this.ensureRegion(curNode.x, curNode.y, 20);

    const roll = Math.floor(Math.random() * 6) + 1;
    state.pendingRoll = roll;

    const node = this.nodes.get(state.nodeId)!;
    let directions: DirectionOption[] = [];

    for (const cid of node.connections) {
      const cn = this.nodes.get(cid)!;
      if (cn.type === 'lot') continue; // 不能走进纯地块
      directions.push({ nodeId: cid, x: cn.x, y: cn.y, label: '' });
    }

    // 如果没有可走方向 (死角)，搜索最近的可行走节点
    if (directions.length === 0) {
      const walkable = this.findNearestWalkable(node);
      if (walkable) {
        directions.push({ nodeId: walkable.id, x: walkable.x, y: walkable.y, label: '' });
      }
    }

    // 限制最多2个方向 (多于2个时随机选取2个)
    if (directions.length > 2) {
      for (let i = directions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [directions[i], directions[j]] = [directions[j], directions[i]];
      }
      directions = directions.slice(0, 2);
    }

    // 用顺逆时针标注方向 (相对于从原点出发的前进方向)
    this.labelDirections(directions, node);

    return { roll, directions };
  }

  /** 从给定节点出发，BFS 找到最近的可行走节点 (road/intersection/start/event/tax/welfare) */
  private findNearestWalkable(from: MapNode): MapNode | null {
    const visited = new Set<number>([from.id]);
    const queue: number[] = [...from.connections];
    for (const id of queue) visited.add(id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (!node) continue;
      if (node.type !== 'lot') return node; // found a walkable node
      for (const cid of node.connections) {
        if (!visited.has(cid)) { visited.add(cid); queue.push(cid); }
      }
    }
    return null;
  }

  /** 根据叉路口位置和来向，用顺逆时针标注方向 */
  private labelDirections(directions: DirectionOption[], fromNode: MapNode, prevNode?: MapNode): void {
    if (directions.length === 1) {
      directions[0].label = '→ 前进';
      return;
    }
    if (directions.length < 2) return;

    // 计算来向向量 (如无来向，默认从 y 正方向看)
    const inDx = prevNode ? fromNode.x - prevNode.x : 0;
    const inDy = prevNode ? fromNode.y - prevNode.y : 1;

    // 用叉积判断顺逆时针: cross = inDx*(dy) - inDy*(dx)
    // cross > 0 → 方向在来向的顺时针侧; cross < 0 → 逆时针侧
    const d0 = directions[0], d1 = directions[1];
    const dx0 = d0.x - fromNode.x, dy0 = d0.y - fromNode.y;
    const dx1 = d1.x - fromNode.x, dy1 = d1.y - fromNode.y;
    const cross0 = inDx * dy0 - inDy * dx0;
    const cross1 = inDx * dy1 - inDy * dx1;

    if (cross0 >= cross1) {
      // d0 偏顺时针，d1 偏逆时针
      directions[0] = { ...d0, label: '↻ 顺时针' };
      directions[1] = { ...d1, label: '↺ 逆时针' };
    } else {
      directions[0] = { ...d1, label: '↻ 顺时针' };
      directions[1] = { ...d0, label: '↺ 逆时针' };
    }
  }

  moveToDirection(entityId: string, firstStepNodeId: number): MoveResult | null {
    const state = this.players.get(entityId);
    if (!state?.alive || state.pendingRoll === null) return null;

    // 确保 nodeId 是数字类型（JSON 反序列化可能传来 string）
    const nodeId = Number(firstStepNodeId);

    // 验证目标节点存在
    const targetNode = this.nodes.get(nodeId);
    if (!targetNode) {
      // 节点无效，清除 pendingRoll 避免卡死
      state.pendingRoll = null;
      return null;
    }

    // 确保移动方向的区域已生成
    this.ensureRegion(targetNode.x, targetNode.y, 20);

    const startNode = this.nodes.get(state.nodeId);
    if (!startNode) {
      state.pendingRoll = null;
      return null;
    }

    let remaining = state.pendingRoll;

    // 沿道路行走，遇岔路暂停；同时收集路过的可消费建筑
    let current = nodeId;
    let prev = state.nodeId;
    const path: { x: number; y: number }[] = [
      { x: startNode.x, y: startNode.y },
      { x: targetNode.x, y: targetNode.y },
    ];
    remaining--;
    const passedBuildings: PassedBuilding[] = [];

    // 检查路径节点及其邻居是否有可消费建筑
    const collectBuildings = (nodeId: number) => {
      const checkNode = (nid: number) => {
        if (passedBuildings.some(pb => pb.nodeId === nid)) return;
        const cn = this.nodes.get(nid);
        if (cn?.building) {
          const tpl = MASLOW_BUILDINGS.find(b => b.type === cn.building!.templateType);
          if (!tpl) return;
          const fee = Math.floor(tpl.baseFee * (1 + (cn.building!.level - 1) * 0.3));
          passedBuildings.push({
            nodeId: nid, x: cn.x, y: cn.y,
            building: cn.building!, template: tpl, fee,
          });
        }
      };
      // Check the node itself
      checkNode(nodeId);
      // Also check connected lots (legacy support)
      const node = this.nodes.get(nodeId)!;
      for (const cid of node.connections) {
        const cn = this.nodes.get(cid);
        if (cn?.type === 'lot') checkNode(cid);
      }
    };

    // 起点所在建筑不算路过，从第一步开始收集
    // collectBuildings(state.nodeId);  // 起点不计入
    collectBuildings(current);

    while (remaining > 0) {
      const node = this.nodes.get(current)!;
      // 确保当前节点周围的区域已生成（保证无边界）
      this.ensureRegion(node.x, node.y, SPACING * 2);
      const nextOptions = node.connections.filter(
        id => id !== prev && this.nodes.get(id)!.type !== 'lot'
      );

      if (nextOptions.length === 0) break; // 死胡同（理论上不应发生）

      if (nextOptions.length > 1) {
        // 岔路口！暂停，等待玩家选择
        state.nodeId = current;
        state.pendingRoll = remaining; // 保存剩余步数

        let directions = nextOptions.map(id => {
          const n = this.nodes.get(id)!;
          return { nodeId: id, x: n.x, y: n.y, label: '' } as DirectionOption;
        });
        if (directions.length > 2) {
          for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
          }
          directions = directions.slice(0, 2);
        }
        const prevNodeObj = this.nodes.get(prev)!;
        this.labelDirections(directions, node, prevNodeObj);

        return {
          path,
          finalNode: node,
          events: [],
          stats: { hunger: state.hunger, energy: state.energy, happiness: state.happiness, alive: state.alive },
          fork: true,
          directions,
          remainingSteps: remaining,
          passedBuildings,
        };
      }

      // 唯一方向，自动前进
      const nextId = nextOptions[0];
      path.push({ x: this.nodes.get(nextId)!.x, y: this.nodes.get(nextId)!.y });
      prev = current;
      current = nextId;
      remaining--;
      collectBuildings(current);
    }

    // 移动完成 - 结算
    state.pendingRoll = null;
    state.actionsToday++;
    state.turnsPlayed++;
    state.nodeId = current;
    this.updateBounds();

    // 每日初始行动值内不消耗体力和饥饿值
    // 超出部分由 buyExtraAction 统一扣除
    // 每次移动消耗 5 点体力
    state.energy = Math.max(0, state.energy - 5);
    // 幸福感每10步减少1点
    if (state.turnsPlayed % 10 === 0) {
      state.happiness = Math.max(0, state.happiness - 1);
    }

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

    // 生死检查: 饥饿=0 或 幸福感=0 → 死亡; 体力=0 → 不死但无法行动
    if (state.hunger <= 0 || state.happiness <= 0) {
      state.alive = false;
      events.push('DEATH');
    } else if (state.energy <= 0) {
      events.push('ENERGY_EXHAUSTED'); // 体力耗尽，无法继续行动（不死亡）
    } else if (state.hunger <= 20) {
      events.push('HUNGER_WARNING');
    } else if (state.happiness <= 15) {
      events.push('HAPPINESS_WARNING');
    } else if (state.energy <= 15) {
      events.push('ENERGY_WARNING');
    }

    this.markDirty();
    return {
      path,
      finalNode,
      events,
      stats: { hunger: state.hunger, energy: state.energy, happiness: state.happiness, alive: state.alive },
      fork: false,
      directions: [],
      remainingSteps: 0,
      passedBuildings,
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
    if (!node || node.building) return null;
    // Allow building on road and intersection (not on start/tax/welfare/event/lot)
    const buildable: NodeType[] = ['road', 'intersection'];
    if (!buildable.includes(node.type)) return null;

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
    this.markDirty();
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

    // 自己的建筑也可以消费（费用自付自收，但享受效果）
    const state = this.players.get(entityId);
    if (!state) return null;

    // 费用 (等级加成)
    const levelMult = 1 + (building.level - 1) * 0.3;
    const fee = Math.floor(template.baseFee * levelMult);

    // 效果 (等级加成 + 特殊建筑随机/补满逻辑)
    const effectMult = 1 + (building.level - 1) * 0.2;
    const effects: Record<string, number> = {};

    // 特殊建筑类型处理
    const bType = template.type;
    if (bType === 'food_stand') {
      // 小食摊: 饥饿 +30~50 随机
      const hungerBoost = Math.floor((30 + Math.random() * 20) * effectMult);
      effects.hunger = hungerBoost;
      state.hunger = Math.min(100, state.hunger + hungerBoost);
    } else if (bType === 'water_station') {
      // 水站: 饥饿 +5~15 随机 (仅饮水), 体力 +5
      const hungerBoost = Math.floor((5 + Math.random() * 10) * effectMult);
      effects.hunger = hungerBoost;
      state.hunger = Math.min(100, state.hunger + hungerBoost);
      const energyBoost = Math.floor(5 * effectMult);
      effects.energy = energyBoost;
      state.energy = Math.min(100, state.energy + energyBoost);
    } else if (bType === 'restaurant') {
      // 高级餐厅: 饥饿 +50~100 随机
      const hungerBoost = Math.floor((50 + Math.random() * 50) * effectMult);
      effects.hunger = hungerBoost;
      state.hunger = Math.min(100, state.hunger + hungerBoost);
      // 幸福感照常
      const happyBoost = Math.floor(15 * effectMult);
      effects.happiness = happyBoost;
      state.happiness = Math.min(100, state.happiness + happyBoost);
    } else if (bType === 'hotel' || bType === 'shelter') {
      // 酒店/住宅: 体力补满至100
      const energyGain = 100 - state.energy;
      effects.energy = energyGain;
      state.energy = 100;
      // 酒店额外加幸福感
      if (bType === 'hotel') {
        const happyBoost = Math.floor(20 * effectMult);
        effects.happiness = happyBoost;
        state.happiness = Math.min(100, state.happiness + happyBoost);
      }
    } else {
      // 其他建筑: 使用模板定义的效果
      for (const [stat, val] of Object.entries(template.effects)) {
        const boost = Math.floor((val as number) * effectMult);
        effects[stat] = boost;
        if (stat === 'hunger') state.hunger = Math.min(100, state.hunger + boost);
        else if (stat === 'energy') state.energy = Math.min(100, state.energy + boost);
        else if (stat === 'happiness') state.happiness = Math.min(100, state.happiness + boost);
      }
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

    this.markDirty();
    return { fee, effects, building, template, upgraded };
  }

  /** 拆除建筑 (仅建筑所有者可拆除，返还 30% 建设费用) */
  demolishBuilding(entityId: string, nodeId: number): { refund: number; template: BuildingTemplate } | null {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return null;
    if (node.building.ownerId !== entityId) return null;
    const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
    if (!template) return null;
    const refund = Math.floor(template.cost * 0.3);
    node.building = undefined;
    this.markDirty();
    return { refund, template };
  }

  /** 设置/取消挂牌出售价格 */
  setListingPrice(entityId: string, nodeId: number, price: number | null): boolean {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return false;
    if (node.building.ownerId !== entityId) return false;
    node.building.listingPrice = price !== null && price > 0 ? price : undefined;
    return true;
  }

  /** 银行类建筑: 设置自定义利率 */
  setBankRates(entityId: string, nodeId: number, depositRate: number, loanRate: number): boolean {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return false;
    if (node.building.ownerId !== entityId) return false;
    const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
    if (!template?.isBank) return false;
    // 利率限制: 存款 0~10%, 贷款 1~20%
    node.building.customDepositRate = Math.max(0, Math.min(0.10, depositRate));
    node.building.customLoanRate = Math.max(0.01, Math.min(0.20, loanRate));
    return true;
  }

  /** 银行类建筑: 业主注入资金到贷款资金池 */
  depositToLoanPool(entityId: string, nodeId: number, amount: number): number {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return 0;
    if (node.building.ownerId !== entityId) return 0;
    const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
    if (!template?.isBank) return 0;
    if (amount <= 0) return 0;
    node.building.loanPool = (node.building.loanPool ?? 0) + amount;
    return node.building.loanPool;
  }

  /** 获取银行类建筑的默认利率 (储蓄所利率低于银行) */
  private getDefaultBankRates(templateType: string): { depositRate: number; loanRate: number } {
    if (templateType === 'savings') {
      return { depositRate: 0.03, loanRate: 0.05 }; // 储蓄所: 存款3%, 贷款5%
    }
    return { depositRate: 0.05, loanRate: 0.08 };   // 银行: 存款5%, 贷款8%
  }

  /** 银行类建筑: 用户存款 (创建存款记录) */
  bankDeposit(entityId: string, nodeId: number, amount: number): { depositRate: number; amount: number; depositId: string } | null {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return null;
    const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
    if (!template?.isBank) return null;
    if (amount <= 0) return null;
    const defaults = this.getDefaultBankRates(template.type);
    const rate = node.building.customDepositRate ?? defaults.depositRate;
    node.building.totalDeposits = (node.building.totalDeposits ?? 0) + amount;
    // 创建存款记录
    const deposit: PlayerDeposit = {
      id: `dep_${++this.depositIdCounter}`,
      entityId,
      nodeId,
      amount,
      interestRate: rate,
      accumulatedInterest: 0,
      createdDay: 0, // 由外部设置
    };
    this.playerDeposits.push(deposit);
    this.markDirty();
    return { depositRate: rate, amount, depositId: deposit.id };
  }

  /** 银行类建筑: 用户取款 (取出本金+利息) */
  bankWithdraw(entityId: string, depositId: string): { total: number; interest: number } | null {
    const idx = this.playerDeposits.findIndex(d => d.id === depositId && d.entityId === entityId);
    if (idx === -1) return null;
    const deposit = this.playerDeposits[idx];
    const node = this.nodes.get(deposit.nodeId);
    const total = deposit.amount + deposit.accumulatedInterest;
    // 从建筑的总存款中扣除
    if (node?.building) {
      node.building.totalDeposits = Math.max(0, (node.building.totalDeposits ?? 0) - deposit.amount);
    }
    this.playerDeposits.splice(idx, 1);
    this.markDirty();
    return { total: Math.floor(total), interest: Math.floor(deposit.accumulatedInterest) };
  }

  /** 银行类建筑: 用户贷款 (创建贷款记录) */
  bankLoan(entityId: string, nodeId: number, amount: number, isPaidUser: boolean): {
    loanRate: number; amount: number; remaining: number; loanId: string;
  } | null {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return null;
    const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
    if (!template?.isBank) return null;
    if (amount <= 0) return null;
    const pool = node.building.loanPool ?? 0;
    if (pool < amount) return null;  // 资金池不足
    // 检查该玩家在此银行的未还贷款总额
    const existingLoans = this.playerLoans
      .filter(l => l.entityId === entityId && l.nodeId === nodeId && l.status === 'active')
      .reduce((sum, l) => sum + l.remainingBalance, 0);
    // 贷款额度: 储蓄所 2000 / 银行 10000, 付费用户 x3
    const baseLimit = template.type === 'savings' ? 2000 : 10000;
    const limit = isPaidUser ? baseLimit * 3 : baseLimit;
    if (existingLoans + amount > limit) return null;
    const defaults = this.getDefaultBankRates(template.type);
    const rate = node.building.customLoanRate ?? defaults.loanRate;
    node.building.loanPool = pool - amount;
    node.building.totalLoansOut = (node.building.totalLoansOut ?? 0) + amount;
    // 创建贷款记录
    const loan: PlayerLoan = {
      id: `loan_${++this.loanIdCounter}`,
      entityId,
      nodeId,
      principal: amount,
      remainingBalance: amount,
      interestRate: rate,
      createdDay: 0, // 由外部设置
      status: 'active',
    };
    this.playerLoans.push(loan);
    this.markDirty();
    return { loanRate: rate, amount, remaining: node.building.loanPool, loanId: loan.id };
  }

  /** 银行类建筑: 还款 (指定贷款ID或自动选最早的) */
  bankRepay(entityId: string, nodeId: number, amount: number): { repaid: number; remaining: number; paid: boolean } | null {
    // 找到该玩家在此银行的活跃贷款 (优先还最早的)
    const loan = this.playerLoans.find(
      l => l.entityId === entityId && l.nodeId === nodeId && l.status === 'active'
    );
    if (!loan) return null;
    const repaid = Math.min(amount, loan.remainingBalance);
    loan.remainingBalance -= repaid;
    const node = this.nodes.get(nodeId);
    if (node?.building) {
      node.building.loanPool = (node.building.loanPool ?? 0) + repaid;
      node.building.totalLoansOut = Math.max(0, (node.building.totalLoansOut ?? 0) - repaid);
    }
    let paid = false;
    if (loan.remainingBalance <= 0) {
      loan.status = 'paid';
      paid = true;
    }
    return { repaid, remaining: loan.remainingBalance, paid };
  }

  /** 获取玩家的所有存款记录 */
  getPlayerDeposits(entityId: string): PlayerDeposit[] {
    return this.playerDeposits.filter(d => d.entityId === entityId);
  }

  /** 获取玩家的所有贷款记录 */
  getPlayerLoans(entityId: string): PlayerLoan[] {
    return this.playerLoans.filter(l => l.entityId === entityId && l.status === 'active');
  }

  /** 获取银行建筑列表 (所有银行类建筑) */
  getBankBuildings(): Array<{ nodeId: number; building: WorldBuilding; template: BuildingTemplate }> {
    const result: Array<{ nodeId: number; building: WorldBuilding; template: BuildingTemplate }> = [];
    for (const node of this.nodes.values()) {
      if (!node.building) continue;
      const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
      if (template?.isBank) {
        result.push({ nodeId: node.id, building: node.building, template });
      }
    }
    return result;
  }

  /** 每日结算银行利息: 存款生息、贷款计息、业主赚利差
   *  返回每个业主的利差收入 Map<ownerId, income> */
  settleBankInterest(): Map<string, number> {
    const ownerIncome = new Map<string, number>();

    // 1. 存款利息结算 — 存款人获得利息
    for (const deposit of this.playerDeposits) {
      const interest = deposit.amount * deposit.interestRate;
      deposit.accumulatedInterest += interest;
    }

    // 2. 贷款利息结算 — 借款人欠款增长，利差归业主
    for (const loan of this.playerLoans) {
      if (loan.status !== 'active') continue;
      const interest = Math.floor(loan.remainingBalance * loan.interestRate);
      loan.remainingBalance += interest;
      // 利差收入 = 贷款利息 - 对应存款需付利息（简化: 利差 = 贷款利息的50%归业主）
      const node = this.nodes.get(loan.nodeId);
      if (node?.building) {
        const ownerId = node.building.ownerId;
        const template = MASLOW_BUILDINGS.find(b => b.type === node.building!.templateType);
        const defaults = this.getDefaultBankRates(template?.type ?? 'savings');
        const depositRate = node.building.customDepositRate ?? defaults.depositRate;
        const loanRate = node.building.customLoanRate ?? defaults.loanRate;
        // 利差 = (贷款利率 - 存款利率) × 贷款余额
        const spread = Math.floor(loan.remainingBalance * Math.max(0, loanRate - depositRate));
        const prev = ownerIncome.get(ownerId) ?? 0;
        ownerIncome.set(ownerId, prev + spread);
      }
    }

    this.markDirty();
    return ownerIncome;
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

  /** 消耗健康值换取额外行动次数 (花费10体力+5饥饿，获得10次行动) */
  buyExtraAction(entityId: string): { success: boolean; message: string; stats?: any } {
    const state = this.players.get(entityId);
    if (!state?.alive) return { success: false, message: '角色已死亡' };
    if (state.energy < 10 || state.hunger < 5) {
      return { success: false, message: '健康值不足（需要体力≥10且饥饿≥5）' };
    }
    state.energy -= 10;
    state.hunger -= 5;
    state.maxActions += 10;
    this.markDirty();
    return {
      success: true,
      message: `消耗 10体力+5饥饿，行动次数+10 (${state.actionsToday}/${state.maxActions})`,
      stats: { hunger: state.hunger, energy: state.energy, happiness: state.happiness, alive: state.alive },
    };
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
    this.markDirty();
    return state;
  }

  // ── 查询 ──

  getVisibleNodes(cx: number, cy: number, radius = 20): MapNode[] {
    // 懒加载: 确保请求区域已生成
    this.ensureRegion(cx, cy, radius + SPACING);
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

  /** 管理员复活玩家 */
  revivePlayer(entityId: string): boolean {
    const state = this.players.get(entityId);
    if (!state || state.alive) return false;
    state.alive = true;
    state.hunger = 50;
    state.energy = 50;
    state.happiness = 50;
    state.actionsToday = 0;
    state.pendingRoll = null;
    return true;
  }

  /** 每真实天重置行动次数（不再在此扣减属性，属性由小时衰减处理） */
  resetDailyActions(): void {
    for (const state of this.players.values()) {
      state.actionsToday = 0;
      state.maxActions = 20;
    }
    this.markDirty();
  }

  /**
   * 每真实小时触发：属性衰减 + 体力恢复
   * 饥饿: -1/小时 (≈-24/天)  → 鼓励消费恢复
   * 幸福感: -1/2小时 (偶数小时扣1) → ≈-12/天
   * 体力: +5/小时 (恢复)
   */
  hourlyDecayAndRecovery(): void {
    const curHour = new Date().getHours();
    for (const state of this.players.values()) {
      if (!state.alive) continue;
      // 体力恢复
      state.energy = Math.min(100, state.energy + 5);
      // 饥饿衰减 (每小时 -1)
      state.hunger = Math.max(0, state.hunger - 1);
      // 幸福感衰减 (每偶数小时 -1)
      if (curHour % 2 === 0) {
        state.happiness = Math.max(0, state.happiness - 1);
      }
      // 死亡检查
      if (state.hunger <= 0 || state.happiness <= 0) {
        state.alive = false;
      }
    }
    this.markDirty();
  }

  setMaxActions(limit: number): void {
    const clamped = Math.max(1, Math.min(20, limit));
    for (const state of this.players.values()) {
      state.maxActions = clamped;
    }
  }

  /** 获取附近可建空地 (road/intersection，按距离排序) */
  getNearbyBuildable(cx: number, cy: number, radius = 6): MapNode[] {
    return this.getVisibleNodes(cx, cy, radius)
      .filter(n => !n.building && (n.type === 'road' || n.type === 'intersection'))
      .sort((a, b) => {
        const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
        const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
        return da - db;
      });
  }

  // ============ 资产交易 ============

  /** 创建购买出价 */
  createTradeOffer(buyerId: string, buyerName: string, nodeId: number, price: number): TradeOffer | null {
    const node = this.nodes.get(nodeId);
    if (!node?.building) return null;
    if (node.building.ownerId === buyerId) return null; // 不能买自己的
    if (price <= 0) return null;

    // 检查是否已有pending offer for this node by this buyer
    for (const offer of this.tradeOffers.values()) {
      if (offer.nodeId === nodeId && offer.buyerId === buyerId && offer.status === 'pending') {
        return null; // 已有待处理出价
      }
    }

    const tax = Math.floor(price * TRADE_TAX_RATE);
    const netPrice = price - tax;
    const id = `trade_${++this.tradeIdCounter}_${Date.now()}`;

    const offer: TradeOffer = {
      id,
      nodeId,
      buildingName: node.building.name,
      buyerId,
      buyerName,
      sellerId: node.building.ownerId,
      sellerName: node.building.ownerName,
      price,
      tax,
      netPrice,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.tradeOffers.set(id, offer);
    this.markDirty();
    return offer;
  }

  /** 卖家接受出价 → 转移建筑所有权 */
  acceptTradeOffer(offerId: string, sellerId: string): { offer: TradeOffer; building: WorldBuilding } | null {
    const offer = this.tradeOffers.get(offerId);
    if (!offer || offer.status !== 'pending') return null;
    if (offer.sellerId !== sellerId) return null;

    const node = this.nodes.get(offer.nodeId);
    if (!node?.building || node.building.ownerId !== sellerId) return null;

    // Transfer ownership
    node.building.ownerId = offer.buyerId;
    node.building.ownerName = offer.buyerName;
    offer.status = 'accepted';
    this.markDirty();

    return { offer, building: node.building };
  }

  /** 拒绝出价 */
  rejectTradeOffer(offerId: string, sellerId: string): boolean {
    const offer = this.tradeOffers.get(offerId);
    if (!offer || offer.status !== 'pending') return false;
    if (offer.sellerId !== sellerId) return false;
    offer.status = 'rejected';
    this.markDirty();
    return true;
  }

  /** 获取某用户收到的pending offers */
  getPendingOffersForSeller(sellerId: string): TradeOffer[] {
    return Array.from(this.tradeOffers.values()).filter(
      o => o.sellerId === sellerId && o.status === 'pending'
    );
  }

  /** 获取某用户发出的pending offers */
  getPendingOffersFromBuyer(buyerId: string): TradeOffer[] {
    return Array.from(this.tradeOffers.values()).filter(
      o => o.buyerId === buyerId && o.status === 'pending'
    );
  }

  /** 清理过期offers (>24h) */
  cleanExpiredOffers(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, offer] of this.tradeOffers) {
      if (offer.createdAt < cutoff && offer.status === 'pending') {
        offer.status = 'expired';
      }
    }
  }

  // ── 持久化 (SQLite) ──

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _dirty = false;

  /** 标记数据已变更，延迟 10 秒写盘 */
  markDirty(): void {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (!this._dirty) return;
      this._dirty = false;
      this._saveToDB();
    }, 10000);
  }

  /** 立即写盘 (用于优雅关闭) */
  flushToDisk(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._saveToDB();
  }

  private _saveToDB(): void {
    try {
      const db = getDB();
      const saveAll = db.transaction(() => {
        // ── 世界元数据 ──
        const upsertMeta = db.prepare('INSERT OR REPLACE INTO world_meta(key, value) VALUES(?, ?)');
        upsertMeta.run('worldBounds', String(this.worldBounds));
        upsertMeta.run('nextId', String(this.nextId));
        upsertMeta.run('depositIdCounter', String(this.depositIdCounter));
        upsertMeta.run('loanIdCounter', String(this.loanIdCounter));
        upsertMeta.run('tradeIdCounter', String(this.tradeIdCounter));

        // ── 玩家 ──
        db.prepare('DELETE FROM players').run();
        const insertPlayer = db.prepare(
          `INSERT INTO players(entityId,nodeId,hunger,energy,happiness,alive,actionsToday,maxActions,pendingRoll,turnsPlayed,referralCount)
           VALUES(@entityId,@nodeId,@hunger,@energy,@happiness,@alive,@actionsToday,@maxActions,@pendingRoll,@turnsPlayed,@referralCount)`
        );
        for (const p of this.players.values()) {
          insertPlayer.run({
            entityId: p.entityId,
            nodeId: p.nodeId,
            hunger: p.hunger,
            energy: p.energy,
            happiness: p.happiness,
            alive: p.alive ? 1 : 0,
            actionsToday: p.actionsToday,
            maxActions: p.maxActions,
            pendingRoll: p.pendingRoll,
            turnsPlayed: p.turnsPlayed,
            referralCount: p.referralCount,
          });
        }

        // ── 建筑 ──
        db.prepare('DELETE FROM buildings').run();
        const insertBuilding = db.prepare(
          `INSERT INTO buildings(nodeId,x,y,templateType,ownerId,ownerName,name,level,usageCount,referralCredits,listingPrice,customDepositRate,customLoanRate,loanPool,totalDeposits,totalLoansOut)
           VALUES(@nodeId,@x,@y,@templateType,@ownerId,@ownerName,@name,@level,@usageCount,@referralCredits,@listingPrice,@customDepositRate,@customLoanRate,@loanPool,@totalDeposits,@totalLoansOut)`
        );
        for (const node of this.nodes.values()) {
          if (!node.building) continue;
          const b = node.building;
          insertBuilding.run({
            nodeId: node.id,
            x: node.x,
            y: node.y,
            templateType: b.templateType,
            ownerId: b.ownerId,
            ownerName: b.ownerName,
            name: b.name,
            level: b.level,
            usageCount: b.usageCount,
            referralCredits: b.referralCredits,
            listingPrice: b.listingPrice ?? null,
            customDepositRate: b.customDepositRate ?? null,
            customLoanRate: b.customLoanRate ?? null,
            loanPool: b.loanPool ?? null,
            totalDeposits: b.totalDeposits ?? null,
            totalLoansOut: b.totalLoansOut ?? null,
          });
        }

        // ── 交易报价 ──
        db.prepare('DELETE FROM trade_offers').run();
        const insertTrade = db.prepare(
          `INSERT INTO trade_offers(id,nodeId,buildingName,buyerId,buyerName,sellerId,sellerName,price,tax,netPrice,createdAt,status)
           VALUES(@id,@nodeId,@buildingName,@buyerId,@buyerName,@sellerId,@sellerName,@price,@tax,@netPrice,@createdAt,@status)`
        );
        for (const t of this.tradeOffers.values()) {
          insertTrade.run(t);
        }

        // ── 银行存款 ──
        db.prepare('DELETE FROM player_deposits').run();
        const insertDeposit = db.prepare(
          `INSERT INTO player_deposits(id,entityId,nodeId,amount,interestRate,accumulatedInterest,createdDay)
           VALUES(@id,@entityId,@nodeId,@amount,@interestRate,@accumulatedInterest,@createdDay)`
        );
        for (const d of this.playerDeposits) {
          insertDeposit.run(d);
        }

        // ── 银行贷款 ──
        db.prepare('DELETE FROM player_loans').run();
        const insertLoan = db.prepare(
          `INSERT INTO player_loans(id,entityId,nodeId,principal,remainingBalance,interestRate,createdDay,status)
           VALUES(@id,@entityId,@nodeId,@principal,@remainingBalance,@interestRate,@createdDay,@status)`
        );
        for (const l of this.playerLoans) {
          insertLoan.run(l);
        }
      });

      saveAll();
      console.log(`[InfiniteWorld] DB已保存 (${this.players.size} 玩家, ${this.countBuildings()} 建筑)`);
    } catch (e) {
      console.error('[InfiniteWorld] DB保存失败:', e);
    }
  }

  private countBuildings(): number {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (node.building) count++;
    }
    return count;
  }

  /** 从数据库加载世界状态 (应在 constructor 之后、initPlayer 之前调用) */
  loadFromDisk(): boolean {
    try {
      const db = getDB();

      // 检查是否有数据
      const metaRow = db.prepare('SELECT value FROM world_meta WHERE key = ?').get('worldBounds') as { value: string } | undefined;
      if (!metaRow) return false;

      console.log(`[InfiniteWorld] 正在从数据库恢复世界状态...`);

      // ── 恢复元数据 ──
      const getMeta = (key: string): number => {
        const row = db.prepare('SELECT value FROM world_meta WHERE key = ?').get(key) as { value: string } | undefined;
        return row ? Number(row.value) : 0;
      };
      this.nextId = getMeta('nextId');
      this.depositIdCounter = getMeta('depositIdCounter');
      this.loanIdCounter = getMeta('loanIdCounter');
      this.tradeIdCounter = getMeta('tradeIdCounter');

      // 恢复 worldBounds 并确保区域已生成
      this.worldBounds = Number(metaRow.value) || MIN_BOUNDS;
      this.ensureRegion(0, 0, this.worldBounds);

      // ── 恢复建筑 ──
      let buildingCount = 0;
      const buildingRows = db.prepare('SELECT * FROM buildings').all() as any[];
      for (const b of buildingRows) {
        this.ensureRegion(b.x, b.y, SPACING);
        const key = `${b.x},${b.y}`;
        const realNodeId = this.coordIndex.get(key);
        if (realNodeId !== undefined) {
          const node = this.nodes.get(realNodeId);
          if (node) {
            node.building = {
              templateType: b.templateType,
              ownerId: b.ownerId,
              ownerName: b.ownerName,
              name: b.name,
              level: b.level,
              usageCount: b.usageCount,
              referralCredits: b.referralCredits,
              listingPrice: b.listingPrice ?? undefined,
              customDepositRate: b.customDepositRate ?? undefined,
              customLoanRate: b.customLoanRate ?? undefined,
              loanPool: b.loanPool ?? undefined,
              totalDeposits: b.totalDeposits ?? undefined,
              totalLoansOut: b.totalLoansOut ?? undefined,
            };
            buildingCount++;
          }
        }
      }

      // ── 恢复玩家 ──
      let playerCount = 0;
      const playerRows = db.prepare('SELECT * FROM players').all() as any[];
      for (const p of playerRows) {
        const state: PlayerWorldState = {
          entityId: p.entityId,
          nodeId: p.nodeId,
          hunger: p.hunger,
          energy: p.energy,
          happiness: p.happiness,
          alive: !!p.alive,
          actionsToday: p.actionsToday,
          maxActions: p.maxActions,
          pendingRoll: p.pendingRoll,
          turnsPlayed: p.turnsPlayed,
          referralCount: p.referralCount,
        };
        const existingNode = this.nodes.get(state.nodeId);
        if (!existingNode) {
          state.nodeId = this.coordIndex.get('0,0') ?? 0;
        }
        this.players.set(state.entityId, state);
        playerCount++;
      }

      // ── 恢复交易 ──
      const tradeRows = db.prepare('SELECT * FROM trade_offers').all() as any[];
      for (const t of tradeRows) {
        this.tradeOffers.set(t.id, t as TradeOffer);
      }

      // ── 恢复存贷款 ──
      this.playerDeposits = db.prepare('SELECT * FROM player_deposits').all() as PlayerDeposit[];
      this.playerLoans = db.prepare('SELECT * FROM player_loans').all() as PlayerLoan[];

      console.log(`[InfiniteWorld] 已恢复: ${playerCount} 玩家, ${buildingCount} 建筑, ${this.tradeOffers.size} 交易, ${this.playerDeposits.length} 存款, ${this.playerLoans.length} 贷款`);
      return true;
    } catch (e) {
      console.error('[InfiniteWorld] DB加载失败:', e);
      return false;
    }
  }
}
