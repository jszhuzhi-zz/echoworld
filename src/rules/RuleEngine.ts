import { v4 as uuidv4 } from 'uuid';
import { WorldEventType } from '../core/types';
import { WorldState, WorldStatistics } from '../core/WorldState';

/**
 * 规则引擎 - 世界规则的自我进化和学习系统
 * Rule Engine - Self-evolving and self-learning world rule system
 *
 * 规则会根据世界运行状态自动调整，包括：
 * - 经济参数（税率、利率、基础收入）
 * - 市场规则（价格波动范围、交易限制）
 * - 建筑规则（建造限制、维护成本）
 * - 生存规则（需求量、消耗速度）
 */
export class RuleEngine {
  private worldState: WorldState;
  private rules: Map<string, WorldRule> = new Map();
  private ruleHistory: RuleChange[] = [];
  private evaluationInterval: number = 0;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
    this.initializeDefaultRules();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worldState.eventBus.on(WorldEventType.DAY_END, () => {
      this.evaluationInterval++;
      // 每7天评估一次规则
      if (this.evaluationInterval >= 7) {
        this.evaluationInterval = 0;
        this.evaluateAndEvolve();
      }
    });
  }

  /** 初始化默认规则 */
  private initializeDefaultRules(): void {
    const defaults: WorldRule[] = [
      {
        id: uuidv4(),
        name: 'tax_rate',
        category: 'economy',
        description: '交易税率 - 每笔交易需缴纳的税款比例',
        value: 0.05,
        minValue: 0.01,
        maxValue: 0.30,
        adjustStep: 0.01,
        evaluator: 'gini_based',
        version: 1,
      },
      {
        id: uuidv4(),
        name: 'basic_income',
        category: 'economy',
        description: '每日基础收入 - 每个活跃实体每天获得的基础货币',
        value: 100,
        minValue: 10,
        maxValue: 500,
        adjustStep: 10,
        evaluator: 'survival_based',
        version: 1,
      },
      {
        id: uuidv4(),
        name: 'food_consumption_rate',
        category: 'survival',
        description: '食物消耗率 - 每日基础食物需求',
        value: 3,
        minValue: 1,
        maxValue: 10,
        adjustStep: 0.5,
        evaluator: 'population_based',
        version: 1,
      },
      {
        id: uuidv4(),
        name: 'building_decay_rate',
        category: 'infrastructure',
        description: '建筑衰减率 - 建筑每日耐久度减少值',
        value: 2,
        minValue: 0.5,
        maxValue: 10,
        adjustStep: 0.5,
        evaluator: 'economy_health',
        version: 1,
      },
      {
        id: uuidv4(),
        name: 'max_price_volatility',
        category: 'market',
        description: '最大价格波动率 - 市场价格每日最大变化百分比',
        value: 0.10,
        minValue: 0.02,
        maxValue: 0.30,
        adjustStep: 0.02,
        evaluator: 'market_stability',
        version: 1,
      },
      {
        id: uuidv4(),
        name: 'bankruptcy_protection_days',
        category: 'economy',
        description: '破产保护天数 - 实体破产后的保护期',
        value: 3,
        minValue: 0,
        maxValue: 10,
        adjustStep: 1,
        evaluator: 'bankruptcy_rate',
        version: 1,
      },
      {
        id: uuidv4(),
        name: 'max_loan_ratio',
        category: 'finance',
        description: '最大贷款比例 - 相对于净资产的最大贷款额度',
        value: 2.0,
        minValue: 0.5,
        maxValue: 5.0,
        adjustStep: 0.25,
        evaluator: 'financial_stability',
        version: 1,
      },
    ];

    for (const rule of defaults) {
      this.rules.set(rule.name, rule);
    }
  }

  /** 评估并进化规则 */
  private evaluateAndEvolve(): void {
    const stats = this.worldState.getStatistics();

    for (const [, rule] of this.rules) {
      const adjustment = this.evaluateRule(rule, stats);
      if (adjustment !== 0) {
        this.applyRuleChange(rule, adjustment, stats);
      }
    }
  }

  /** 评估单条规则 */
  private evaluateRule(rule: WorldRule, stats: WorldStatistics): number {
    switch (rule.evaluator) {
      case 'gini_based':
        return this.evaluateGiniBased(rule, stats);
      case 'survival_based':
        return this.evaluateSurvivalBased(rule, stats);
      case 'population_based':
        return this.evaluatePopulationBased(rule, stats);
      case 'economy_health':
        return this.evaluateEconomyHealth(rule, stats);
      case 'market_stability':
        return this.evaluateMarketStability(rule, stats);
      case 'bankruptcy_rate':
        return this.evaluateBankruptcyRate(rule, stats);
      case 'financial_stability':
        return this.evaluateFinancialStability(rule, stats);
      default:
        return 0;
    }
  }

  /** 基于基尼系数调整（贫富差距） */
  private evaluateGiniBased(rule: WorldRule, stats: WorldStatistics): number {
    // 基尼系数过高，增加税率以缩小差距
    if (stats.giniCoefficient > 0.6) return rule.adjustStep;
    // 基尼系数适中，保持不变
    if (stats.giniCoefficient > 0.3) return 0;
    // 基尼系数很低，可能需要降低税率以激励发展
    return -rule.adjustStep;
  }

  /** 基于生存率调整 */
  private evaluateSurvivalBased(rule: WorldRule, stats: WorldStatistics): number {
    // 如果太多实体接近破产，增加基础收入
    if (stats.averageWealth < 200) return rule.adjustStep;
    if (stats.averageWealth > 2000) return -rule.adjustStep;
    return 0;
  }

  /** 基于人口调整 */
  private evaluatePopulationBased(rule: WorldRule, stats: WorldStatistics): number {
    if (stats.totalEntities > 50) return rule.adjustStep * 0.5;
    if (stats.totalEntities < 10) return -rule.adjustStep * 0.5;
    return 0;
  }

  /** 基于经济健康度调整 */
  private evaluateEconomyHealth(rule: WorldRule, stats: WorldStatistics): number {
    if (stats.dailyGDP < 100) return -rule.adjustStep; // 经济低迷，降低建筑衰减
    if (stats.dailyGDP > 5000) return rule.adjustStep;  // 经济过热
    return 0;
  }

  /** 基于市场稳定性调整 */
  private evaluateMarketStability(_rule: WorldRule, _stats: WorldStatistics): number {
    // 可以基于价格变化历史判断
    return 0;
  }

  /** 基于破产率调整 */
  private evaluateBankruptcyRate(rule: WorldRule, stats: WorldStatistics): number {
    if (stats.totalEntities === 0) return 0;
    // 破产实体占比高，增加保护
    return 0;
  }

  /** 基于金融稳定性调整 */
  private evaluateFinancialStability(rule: WorldRule, stats: WorldStatistics): number {
    if (stats.totalCurrencyCirculating > stats.totalEntities * 10000) {
      return -rule.adjustStep; // 货币泛滥，收紧贷款
    }
    return 0;
  }

  /** 应用规则变更 */
  private applyRuleChange(
    rule: WorldRule,
    adjustment: number,
    stats: WorldStatistics,
  ): void {
    const oldValue = rule.value;
    rule.value = Math.max(rule.minValue, Math.min(rule.maxValue, rule.value + adjustment));
    rule.version++;

    if (oldValue === rule.value) return;

    const change: RuleChange = {
      id: uuidv4(),
      ruleName: rule.name,
      oldValue,
      newValue: rule.value,
      reason: `Auto-adjusted by ${rule.evaluator} evaluator`,
      worldDay: this.worldState.clock.getDay(),
      worldStats: { ...stats },
    };

    this.ruleHistory.push(change);

    this.worldState.eventBus.emit({
      type: WorldEventType.RULE_EVOLVED,
      data: {
        ruleName: rule.name,
        oldValue,
        newValue: rule.value,
        reason: change.reason,
        version: rule.version,
      },
      timestamp: this.worldState.getTime(),
    });
  }

  /** 获取规则当前值 */
  getRuleValue(name: string): number {
    return this.rules.get(name)?.value ?? 0;
  }

  /** 获取所有规则 */
  getAllRules(): WorldRule[] {
    return Array.from(this.rules.values());
  }

  /** 获取规则变更历史 */
  getRuleHistory(): RuleChange[] {
    return [...this.ruleHistory];
  }

  /** 手动添加/覆盖规则 */
  setRule(rule: WorldRule): void {
    this.rules.set(rule.name, rule);
  }

  /** 修改规则值 (管理员用) */
  setRuleValue(name: string, value: number): void {
    const rule = this.rules.get(name);
    if (!rule) throw new Error(`规则 "${name}" 不存在`);
    const clamped = Math.max(rule.minValue, Math.min(rule.maxValue, value));
    rule.value = clamped;
    rule.version++;
  }

  /** 获取规则摘要 */
  getSummary(): RuleEngineSummary {
    const rules: Record<string, { value: number; version: number }> = {};
    for (const [name, rule] of this.rules) {
      rules[name] = { value: rule.value, version: rule.version };
    }
    return {
      totalRules: this.rules.size,
      totalChanges: this.ruleHistory.length,
      rules,
      recentChanges: this.ruleHistory.slice(-10),
    };
  }
}

/** 世界规则 */
export interface WorldRule {
  id: string;
  name: string;
  category: string;
  description: string;
  value: number;
  minValue: number;
  maxValue: number;
  adjustStep: number;
  evaluator: string;
  version: number;
}

/** 规则变更记录 */
export interface RuleChange {
  id: string;
  ruleName: string;
  oldValue: number;
  newValue: number;
  reason: string;
  worldDay: number;
  worldStats: WorldStatistics;
}

/** 规则引擎摘要 */
export interface RuleEngineSummary {
  totalRules: number;
  totalChanges: number;
  rules: Record<string, { value: number; version: number }>;
  recentChanges: RuleChange[];
}
