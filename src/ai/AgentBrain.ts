import {
  ResourceType,
  BuildingType,
  WorldEventType,
  EntityStatus,
} from '../core/types';
import { WorldState, WorldStatistics } from '../core/WorldState';
import { Entity, EntitySummary } from '../entities/Entity';
import { Market } from '../market/Market';
import { BuildingManager } from '../infrastructure/BuildingManager';
import { BuildingSummary } from '../infrastructure/Building';
import { Bank } from '../economy/Bank';

/**
 * AI智能体大脑 - 基于世界状态做出自主决策
 * AI Agent Brain - Makes autonomous decisions based on world state
 *
 * 每个AI智能体都有自己的大脑，可以接入外部LLM进行复杂决策，
 * 也可以使用内置的规则引擎进行快速决策。
 */
export class AgentBrain {
  private entity: Entity;
  private worldState: WorldState;
  private market: Market;
  private buildingManager: BuildingManager;
  private bank: Bank;

  /** 决策策略 */
  private strategy: AgentStrategy;

  /** LLM连接器（可选） */
  private llmConnector: LLMConnector | null = null;

  /** 行动历史 */
  private actionHistory: AgentAction[] = [];

  /** 性格特征 */
  private personality: AgentPersonality;

  constructor(
    entity: Entity,
    worldState: WorldState,
    market: Market,
    buildingManager: BuildingManager,
    bank: Bank,
    personality?: Partial<AgentPersonality>,
  ) {
    this.entity = entity;
    this.worldState = worldState;
    this.market = market;
    this.buildingManager = buildingManager;
    this.bank = bank;

    this.personality = {
      riskTolerance: personality?.riskTolerance ?? 0.5,
      greed: personality?.greed ?? 0.5,
      socialAwareness: personality?.socialAwareness ?? 0.5,
      innovation: personality?.innovation ?? 0.5,
      patience: personality?.patience ?? 0.5,
    };

    this.strategy = this.determineStrategy();
  }

  /** 设置LLM连接器 */
  setLLMConnector(connector: LLMConnector): void {
    this.llmConnector = connector;
  }

  /** 执行一轮决策（每tick调用） */
  async think(): Promise<AgentAction[]> {
    if (this.entity.status !== EntityStatus.ACTIVE) return [];

    const actions: AgentAction[] = [];
    const context = this.buildContext();

    // 如果有LLM连接器，使用LLM决策
    if (this.llmConnector) {
      const llmActions = await this.consultLLM(context);
      actions.push(...llmActions);
    } else {
      // 使用内置规则引擎决策
      actions.push(...this.ruleBasedDecision(context));
    }

    // 执行决策
    for (const action of actions) {
      this.executeAction(action);
    }

    this.actionHistory.push(...actions);
    return actions;
  }

  /** 构建决策上下文 */
  private buildContext(): DecisionContext {
    const buildings = this.buildingManager.getBuildingsByOwner(this.entity.id);
    return {
      self: this.entity.getSummary(),
      worldDay: this.worldState.clock.getDay(),
      marketPrices: this.market.getAllPrices(),
      ownedBuildings: buildings.map(b => b.getSummary()),
      bankDebt: this.bank.getEntityDebt(this.entity.id),
      bankDeposits: this.bank.getEntityDeposits(this.entity.id),
      recentActions: this.actionHistory.slice(-10),
      worldStats: this.worldState.getStatistics(),
      strategy: this.strategy,
    };
  }

  /** 基于规则的决策引擎 */
  private ruleBasedDecision(ctx: DecisionContext): AgentAction[] {
    const actions: AgentAction[] = [];

    // 1. 生存优先：满足基本需求
    actions.push(...this.survivalDecisions(ctx));

    // 2. 发展建设
    actions.push(...this.buildingDecisions(ctx));

    // 3. 市场交易
    actions.push(...this.tradingDecisions(ctx));

    // 4. 金融操作
    actions.push(...this.financialDecisions(ctx));

    return actions;
  }

  /** 生存决策 - 确保基本需求满足 */
  private survivalDecisions(ctx: DecisionContext): AgentAction[] {
    const actions: AgentAction[] = [];

    for (const need of this.entity.needs) {
      const current = this.entity.getResource(need.type);
      if (current < need.amount * 2) {
        // 储备不足2天，去市场购买
        const buyAmount = need.amount * 3 - current;
        const price = this.market.getPrice(need.type);

        if (this.entity.currency >= price * buyAmount) {
          actions.push({
            type: 'buy_resource',
            params: {
              resource: need.type,
              amount: buyAmount,
              maxPrice: price * 1.1,
            },
            reason: `Need ${need.type}: only ${current} left, need ${need.amount}/day`,
          });
        }
      }
    }

    return actions;
  }

  /** 建筑决策 - 投资建设基础设施 */
  private buildingDecisions(ctx: DecisionContext): AgentAction[] {
    const actions: AgentAction[] = [];
    const buildings = ctx.ownedBuildings;

    // 维修耐久度低的建筑
    for (const building of buildings) {
      if (building.durability < 40) {
        actions.push({
          type: 'repair_building',
          params: { buildingId: building.id },
          reason: `Building ${building.name} durability low: ${building.durability}%`,
        });
      }
    }

    // 考虑建造新建筑
    if (this.entity.currency > 1500 && buildings.length < 5) {
      const buildingType = this.chooseBuildingType(ctx);
      if (buildingType) {
        actions.push({
          type: 'build',
          params: {
            buildingType,
            position: { x: this.entity.position.x, y: this.entity.position.y },
          },
          reason: `Investing in new ${buildingType}, current wealth: ${this.entity.currency}`,
        });
      }
    }

    // 考虑升级建筑
    for (const building of buildings) {
      if (building.level < 3 && this.entity.currency > building.level * 800) {
        actions.push({
          type: 'upgrade_building',
          params: { buildingId: building.id },
          reason: `Upgrading ${building.name} from level ${building.level}`,
        });
        break; // 一次只升级一个
      }
    }

    return actions;
  }

  /** 交易决策 */
  private tradingDecisions(ctx: DecisionContext): AgentAction[] {
    const actions: AgentAction[] = [];

    // 出售多余资源
    for (const [resource, amount] of this.entity.inventory) {
      const need = this.entity.needs.find(n => n.type === resource);
      const reserve = need ? need.amount * 5 : 0;

      if (amount > reserve + 10) {
        const sellAmount = Math.floor((amount - reserve) * 0.5);
        actions.push({
          type: 'sell_resource',
          params: {
            resource,
            amount: sellAmount,
          },
          reason: `Excess ${resource}: ${amount} (reserve: ${reserve})`,
        });
      }
    }

    return actions;
  }

  /** 金融决策 */
  private financialDecisions(ctx: DecisionContext): AgentAction[] {
    const actions: AgentAction[] = [];

    // 如果现金过多，存一部分
    if (this.entity.currency > 3000 && ctx.bankDeposits < this.entity.currency * 0.3) {
      const depositAmount = Math.floor(this.entity.currency * 0.2);
      actions.push({
        type: 'deposit',
        params: { amount: depositAmount },
        reason: `Banking excess cash: ${depositAmount}`,
      });
    }

    // 如果需要资金且信用良好，考虑贷款
    if (
      this.entity.currency < 500
      && this.entity.creditScore > 400
      && ctx.bankDebt < this.entity.getNetWorth() * 0.5
      && this.personality.riskTolerance > 0.4
    ) {
      actions.push({
        type: 'request_loan',
        params: { amount: 1000 },
        reason: `Low on cash (${this.entity.currency}), requesting loan`,
      });
    }

    return actions;
  }

  /** 选择建造什么类型的建筑 */
  private chooseBuildingType(ctx: DecisionContext): BuildingType | null {
    const ownedTypes = ctx.ownedBuildings.map(b => b.type);
    const prices = ctx.marketPrices;

    // 优先建造能满足自身需求的建筑
    if (!ownedTypes.includes(BuildingType.FARM)) return BuildingType.FARM;
    if (!ownedTypes.includes(BuildingType.HOUSE)) return BuildingType.HOUSE;

    // 根据市场价格选择高价资源的生产建筑
    if (prices[ResourceType.GOODS] > 30 && !ownedTypes.includes(BuildingType.FACTORY)) {
      return BuildingType.FACTORY;
    }
    if (prices[ResourceType.ENERGY] > 15 && !ownedTypes.includes(BuildingType.RESTAURANT)) {
      return BuildingType.RESTAURANT;
    }

    // 根据性格选择
    if (this.personality.greed > 0.7) return BuildingType.MARKET;
    if (this.personality.innovation > 0.7) return BuildingType.FACTORY;

    return BuildingType.SHOP;
  }

  /** 执行具体行动 */
  private executeAction(action: AgentAction): void {
    switch (action.type) {
      case 'buy_resource':
        this.market.buyAtMarketPrice(
          this.entity.id,
          action.params.resource as ResourceType,
          action.params.amount as number,
        );
        break;

      case 'sell_resource':
        this.market.sellAtMarketPrice(
          this.entity.id,
          action.params.resource as ResourceType,
          action.params.amount as number,
        );
        break;

      case 'build':
        this.buildingManager.build(
          this.entity.id,
          action.params.buildingType as BuildingType,
          action.params.position as { x: number; y: number },
        );
        break;

      case 'upgrade_building':
        this.buildingManager.upgradeBuilding(
          action.params.buildingId as string,
          this.entity.id,
        );
        break;

      case 'repair_building':
        this.buildingManager.repairBuilding(
          action.params.buildingId as string,
          this.entity.id,
        );
        break;

      case 'deposit':
        this.bank.makeDeposit(this.entity, action.params.amount as number);
        break;

      case 'request_loan':
        this.bank.requestLoan(this.entity, action.params.amount as number);
        break;
    }

    this.worldState.eventBus.emit({
      type: WorldEventType.ENTITY_ACTION,
      data: {
        entityId: this.entity.id,
        entityName: this.entity.name,
        action: action.type,
        params: action.params,
        reason: action.reason,
      },
      timestamp: this.worldState.getTime(),
    });
  }

  /** 向LLM咨询决策 */
  private async consultLLM(context: DecisionContext): Promise<AgentAction[]> {
    if (!this.llmConnector) return [];

    const prompt = this.buildLLMPrompt(context);
    try {
      const response = await this.llmConnector.query(prompt);
      return this.parseLLMResponse(response);
    } catch {
      // LLM不可用时回退到规则引擎
      return this.ruleBasedDecision(context);
    }
  }

  /** 构建给LLM的提示 */
  private buildLLMPrompt(ctx: DecisionContext): string {
    return `你是EchoWorld中的AI智能体"${this.entity.name}"。
当前世界第${ctx.worldDay}天。

你的状态:
- 货币: ${ctx.self.currency}
- 净资产: ${ctx.self.netWorth}
- 信用评分: ${ctx.self.creditScore}
- 声望: ${ctx.self.reputation}
- 库存: ${JSON.stringify(ctx.self.inventory)}
- 建筑: ${ctx.ownedBuildings.length}个
- 债务: ${ctx.bankDebt}
- 存款: ${ctx.bankDeposits}

市场价格: ${JSON.stringify(ctx.marketPrices)}

世界统计:
- 总实体数: ${ctx.worldStats.totalEntities}
- 平均财富: ${ctx.worldStats.averageWealth}
- 基尼系数: ${ctx.worldStats.giniCoefficient}

你的性格: 风险偏好=${this.personality.riskTolerance}, 贪婪=${this.personality.greed},
社会意识=${this.personality.socialAwareness}, 创新=${this.personality.innovation}

请以JSON数组格式返回你要执行的行动。可用行动类型:
- buy_resource: {resource, amount, maxPrice}
- sell_resource: {resource, amount}
- build: {buildingType, position}
- upgrade_building: {buildingId}
- repair_building: {buildingId}
- deposit: {amount}
- request_loan: {amount}

只返回JSON数组，不要其他内容。`;
  }

  /** 解析LLM响应 */
  private parseLLMResponse(response: string): AgentAction[] {
    try {
      const parsed = JSON.parse(response);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: Record<string, unknown>) => ({
        type: item.type as string,
        params: (item.params || {}) as Record<string, unknown>,
        reason: (item.reason as string) || 'LLM decision',
      }));
    } catch {
      return [];
    }
  }

  /** 确定初始策略 */
  private determineStrategy(): AgentStrategy {
    if (this.personality.greed > 0.7) return 'aggressive_growth';
    if (this.personality.patience > 0.7) return 'steady_accumulation';
    if (this.personality.socialAwareness > 0.7) return 'community_builder';
    if (this.personality.innovation > 0.7) return 'innovator';
    return 'balanced';
  }

  /** 获取行动历史 */
  getActionHistory(): AgentAction[] {
    return [...this.actionHistory];
  }

  /** 获取性格 */
  getPersonality(): AgentPersonality {
    return { ...this.personality };
  }
}

/** 决策上下文 */
export interface DecisionContext {
  self: EntitySummary;
  worldDay: number;
  marketPrices: Record<string, number>;
  ownedBuildings: BuildingSummary[];
  bankDebt: number;
  bankDeposits: number;
  recentActions: AgentAction[];
  worldStats: WorldStatistics;
  strategy: AgentStrategy;
}

/** 智能体行动 */
export interface AgentAction {
  type: string;
  params: Record<string, unknown>;
  reason: string;
}

/** 智能体策略 */
export type AgentStrategy =
  | 'aggressive_growth'      // 激进增长
  | 'steady_accumulation'    // 稳健积累
  | 'community_builder'      // 社区建设
  | 'innovator'              // 创新者
  | 'balanced';              // 平衡型

/** 智能体性格特征 */
export interface AgentPersonality {
  riskTolerance: number;      // 风险偏好 0-1
  greed: number;              // 贪婪度 0-1
  socialAwareness: number;    // 社会意识 0-1
  innovation: number;         // 创新力 0-1
  patience: number;           // 耐心 0-1
}

/** LLM连接器接口 */
export interface LLMConnector {
  query(prompt: string): Promise<string>;
  getModel(): string;
}
