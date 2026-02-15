import { WorldEventType } from '../core/types';
import { WorldState } from '../core/WorldState';
import { EntityManager } from '../entities/EntityManager';
import { EntityStatus } from '../core/types';

/**
 * 税收系统 - 管理世界税收与财政再分配
 * Manages world taxation and fiscal redistribution
 */
export class TaxSystem {
  private worldState: WorldState;
  private entityManager: EntityManager;
  private treasury: number = 0;            // 国库
  private taxRate: number;
  private dailyTaxRevenue: number = 0;
  private dailyRedistribution: number = 0;

  constructor(worldState: WorldState, entityManager: EntityManager) {
    this.worldState = worldState;
    this.entityManager = entityManager;
    this.taxRate = worldState.config.taxRate;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 交易税
    this.worldState.eventBus.on(WorldEventType.TRANSACTION, (event) => {
      const totalCost = event.data.totalCost as number;
      const tax = totalCost * this.taxRate;
      this.treasury += tax;
      this.dailyTaxRevenue += tax;
    });

    // 每天结束时进行财政再分配
    this.worldState.eventBus.on(WorldEventType.DAY_END, () => {
      this.redistribute();
      this.dailyTaxRevenue = 0;
      this.dailyRedistribution = 0;
    });
  }

  /** 收取交易税 */
  collectTransactionTax(amount: number): number {
    const tax = amount * this.taxRate;
    this.treasury += tax;
    this.dailyTaxRevenue += tax;
    return tax;
  }

  /** 财政再分配 - 向低收入实体提供补助 */
  private redistribute(): void {
    const activeEntities = this.entityManager.getActiveEntities();
    if (activeEntities.length === 0) return;

    // 用国库的20%进行再分配
    const redistributionPool = this.treasury * 0.2;
    if (redistributionPool < 1) return;

    // 找出低于平均财富50%的实体
    const avgWealth = activeEntities.reduce((s, e) => s + e.getNetWorth(), 0) / activeEntities.length;
    const threshold = avgWealth * 0.5;
    const needyEntities = activeEntities.filter(e => e.getNetWorth() < threshold);

    if (needyEntities.length === 0) return;

    const perEntityAmount = redistributionPool / needyEntities.length;
    for (const entity of needyEntities) {
      entity.receive(perEntityAmount);
      this.dailyRedistribution += perEntityAmount;
    }

    this.treasury -= redistributionPool;
  }

  /** 获取税收统计 */
  getStats(): TaxStats {
    return {
      treasury: this.treasury,
      taxRate: this.taxRate,
      dailyTaxRevenue: this.dailyTaxRevenue,
      dailyRedistribution: this.dailyRedistribution,
    };
  }

  /** 调整税率 */
  setTaxRate(rate: number): void {
    this.taxRate = Math.max(0, Math.min(0.5, rate));
  }

  getTreasury(): number {
    return this.treasury;
  }
}

export interface TaxStats {
  treasury: number;
  taxRate: number;
  dailyTaxRevenue: number;
  dailyRedistribution: number;
}
