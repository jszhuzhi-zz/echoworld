import { v4 as uuidv4 } from 'uuid';
import {
  ResourceType,
  Transaction,
  WorldEventType,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { EntityManager } from '../entities/EntityManager';

/**
 * 市场系统 - 管理资源交易、价格发现和供需平衡
 * Manages resource trading, price discovery, and supply-demand balance
 */
export class Market {
  private worldState: WorldState;
  private entityManager: EntityManager;

  /** 当前市场价格 */
  private prices: Map<ResourceType, number>;

  /** 挂单列表 */
  private sellOrders: MarketOrder[] = [];
  private buyOrders: MarketOrder[] = [];

  /** 交易历史 */
  private transactionHistory: Transaction[] = [];

  /** 价格历史（按天） */
  private priceHistory: Map<ResourceType, number[]> = new Map();

  /** 每日交易量 */
  private dailyVolume: Map<ResourceType, number> = new Map();

  constructor(worldState: WorldState, entityManager: EntityManager) {
    this.worldState = worldState;
    this.entityManager = entityManager;

    // 初始价格
    this.prices = new Map([
      [ResourceType.FOOD, 10],
      [ResourceType.MATERIAL, 15],
      [ResourceType.GOODS, 25],
      [ResourceType.ENERGY, 12],
      [ResourceType.LABOR, 8],
    ]);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worldState.eventBus.on(WorldEventType.DAY_START, () => {
      // 记录每日价格
      for (const [resource, price] of this.prices) {
        const history = this.priceHistory.get(resource) || [];
        history.push(price);
        if (history.length > 365) history.shift();
        this.priceHistory.set(resource, history);
      }
      // 重置每日交易量
      this.dailyVolume.clear();
    });

    this.worldState.eventBus.on(WorldEventType.DAY_END, () => {
      // 每天结束时撮合剩余订单并更新价格
      this.matchOrders();
      this.updatePrices();
    });
  }

  /** 创建卖单 */
  createSellOrder(
    sellerId: string,
    resource: ResourceType,
    amount: number,
    pricePerUnit: number,
  ): MarketOrder | null {
    const seller = this.entityManager.getEntity(sellerId);
    if (!seller) return null;

    // 检查卖家是否有足够资源
    if (seller.getResource(resource) < amount) return null;

    // 锁定资源
    seller.removeResource(resource, amount);

    const order: MarketOrder = {
      id: uuidv4(),
      entityId: sellerId,
      type: 'sell',
      resource,
      amount,
      remainingAmount: amount,
      pricePerUnit,
      createdAt: this.worldState.getTime(),
      status: 'active',
    };

    this.sellOrders.push(order);
    this.tryMatchOrder(order);
    return order;
  }

  /** 创建买单 */
  createBuyOrder(
    buyerId: string,
    resource: ResourceType,
    amount: number,
    maxPricePerUnit: number,
  ): MarketOrder | null {
    const buyer = this.entityManager.getEntity(buyerId);
    if (!buyer) return null;

    // 检查买家是否有足够货币
    const totalCost = amount * maxPricePerUnit;
    if (buyer.currency < totalCost) return null;

    // 锁定货币
    buyer.pay(totalCost);

    const order: MarketOrder = {
      id: uuidv4(),
      entityId: buyerId,
      type: 'buy',
      resource,
      amount,
      remainingAmount: amount,
      pricePerUnit: maxPricePerUnit,
      createdAt: this.worldState.getTime(),
      status: 'active',
    };

    this.buyOrders.push(order);
    this.tryMatchOrder(order);
    return order;
  }

  /** 直接市价购买 */
  buyAtMarketPrice(
    buyerId: string,
    resource: ResourceType,
    amount: number,
  ): Transaction | null {
    const buyer = this.entityManager.getEntity(buyerId);
    if (!buyer) return null;

    const price = this.getPrice(resource);
    const totalCost = price * amount;

    if (!buyer.pay(totalCost)) return null;

    // 给予资源（市场作为无限供应方）
    buyer.addResource(resource, amount);

    const transaction: Transaction = {
      id: uuidv4(),
      from: 'market',
      to: buyerId,
      resourceType: resource,
      amount,
      price,
      totalCost,
      timestamp: this.worldState.getTime(),
    };

    this.recordTransaction(transaction);
    return transaction;
  }

  /** 直接市价出售 */
  sellAtMarketPrice(
    sellerId: string,
    resource: ResourceType,
    amount: number,
  ): Transaction | null {
    const seller = this.entityManager.getEntity(sellerId);
    if (!seller) return null;

    if (!seller.removeResource(resource, amount)) return null;

    const price = this.getPrice(resource) * 0.9; // 卖出价低10%
    const totalRevenue = price * amount;
    seller.receive(totalRevenue);

    const transaction: Transaction = {
      id: uuidv4(),
      from: sellerId,
      to: 'market',
      resourceType: resource,
      amount,
      price,
      totalCost: totalRevenue,
      timestamp: this.worldState.getTime(),
    };

    this.recordTransaction(transaction);
    return transaction;
  }

  /** 尝试匹配订单 */
  private tryMatchOrder(newOrder: MarketOrder): void {
    if (newOrder.type === 'buy') {
      // 寻找价格合适的卖单
      const matchingSells = this.sellOrders
        .filter(o => o.resource === newOrder.resource
          && o.status === 'active'
          && o.pricePerUnit <= newOrder.pricePerUnit)
        .sort((a, b) => a.pricePerUnit - b.pricePerUnit);

      for (const sellOrder of matchingSells) {
        if (newOrder.remainingAmount <= 0) break;
        this.executeMatch(sellOrder, newOrder);
      }
    } else {
      // 寻找价格合适的买单
      const matchingBuys = this.buyOrders
        .filter(o => o.resource === newOrder.resource
          && o.status === 'active'
          && o.pricePerUnit >= newOrder.pricePerUnit)
        .sort((a, b) => b.pricePerUnit - a.pricePerUnit);

      for (const buyOrder of matchingBuys) {
        if (newOrder.remainingAmount <= 0) break;
        this.executeMatch(newOrder, buyOrder);
      }
    }
  }

  /** 执行订单匹配 */
  private executeMatch(sellOrder: MarketOrder, buyOrder: MarketOrder): void {
    const tradeAmount = Math.min(sellOrder.remainingAmount, buyOrder.remainingAmount);
    const tradePrice = (sellOrder.pricePerUnit + buyOrder.pricePerUnit) / 2;
    const totalCost = tradeAmount * tradePrice;

    const seller = this.entityManager.getEntity(sellOrder.entityId);
    const buyer = this.entityManager.getEntity(buyOrder.entityId);
    if (!seller || !buyer) return;

    // 完成交易
    seller.receive(totalCost);
    buyer.addResource(buyOrder.resource, tradeAmount);

    // 退还买方多付的部分
    const refund = tradeAmount * (buyOrder.pricePerUnit - tradePrice);
    if (refund > 0) buyer.receive(refund);

    sellOrder.remainingAmount -= tradeAmount;
    buyOrder.remainingAmount -= tradeAmount;

    if (sellOrder.remainingAmount <= 0) sellOrder.status = 'filled';
    if (buyOrder.remainingAmount <= 0) buyOrder.status = 'filled';

    const transaction: Transaction = {
      id: uuidv4(),
      from: sellOrder.entityId,
      to: buyOrder.entityId,
      resourceType: sellOrder.resource,
      amount: tradeAmount,
      price: tradePrice,
      totalCost,
      timestamp: this.worldState.getTime(),
    };

    this.recordTransaction(transaction);
  }

  /** 匹配所有待处理订单 */
  private matchOrders(): void {
    for (const resource of Object.values(ResourceType)) {
      const sells = this.sellOrders.filter(
        o => o.resource === resource && o.status === 'active'
      );
      const buys = this.buyOrders.filter(
        o => o.resource === resource && o.status === 'active'
      );

      for (const sell of sells) {
        for (const buy of buys) {
          if (sell.remainingAmount <= 0) break;
          if (buy.remainingAmount <= 0) continue;
          if (sell.pricePerUnit <= buy.pricePerUnit) {
            this.executeMatch(sell, buy);
          }
        }
      }
    }

    // 清理已完成和过期订单
    this.sellOrders = this.sellOrders.filter(o => o.status === 'active');
    this.buyOrders = this.buyOrders.filter(o => o.status === 'active');
  }

  /** 基于供需动态更新价格 */
  private updatePrices(): void {
    for (const resource of Object.values(ResourceType)) {
      const sellVolume = this.sellOrders
        .filter(o => o.resource === resource && o.status === 'active')
        .reduce((sum, o) => sum + o.remainingAmount, 0);

      const buyVolume = this.buyOrders
        .filter(o => o.resource === resource && o.status === 'active')
        .reduce((sum, o) => sum + o.remainingAmount, 0);

      const currentPrice = this.prices.get(resource) || 10;

      // 供需比影响价格
      if (buyVolume > sellVolume * 1.2) {
        // 需求大于供给，涨价
        this.prices.set(resource, currentPrice * 1.05);
      } else if (sellVolume > buyVolume * 1.2) {
        // 供给大于需求，降价
        this.prices.set(resource, Math.max(1, currentPrice * 0.95));
      }

      this.worldState.eventBus.emit({
        type: WorldEventType.MARKET_PRICE_CHANGE,
        data: {
          resource,
          oldPrice: currentPrice,
          newPrice: this.prices.get(resource),
        },
        timestamp: this.worldState.getTime(),
      });
    }
  }

  /** 记录交易 */
  private recordTransaction(transaction: Transaction): void {
    this.transactionHistory.push(transaction);
    if (this.transactionHistory.length > 10000) {
      this.transactionHistory = this.transactionHistory.slice(-5000);
    }

    const volume = this.dailyVolume.get(transaction.resourceType) || 0;
    this.dailyVolume.set(transaction.resourceType, volume + transaction.amount);

    this.worldState.eventBus.emit({
      type: WorldEventType.TRANSACTION,
      data: { ...transaction },
      timestamp: this.worldState.getTime(),
    });

    this.worldState.updateStatistics({
      totalTransactions: this.transactionHistory.length,
      dailyGDP: (this.worldState.getStatistics().dailyGDP || 0) + transaction.totalCost,
    });
  }

  /** 获取资源当前价格 */
  getPrice(resource: ResourceType): number {
    return this.prices.get(resource) || 10;
  }

  /** 获取所有价格 */
  getAllPrices(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [resource, price] of this.prices) {
      result[resource] = Math.round(price * 100) / 100;
    }
    return result;
  }

  /** 获取价格历史 */
  getPriceHistory(resource: ResourceType): number[] {
    return this.priceHistory.get(resource) || [];
  }

  /** 获取最近交易 */
  getRecentTransactions(count = 20): Transaction[] {
    return this.transactionHistory.slice(-count);
  }

  /** 获取市场统计 */
  getStats(): MarketStats {
    return {
      prices: this.getAllPrices(),
      activeSellOrders: this.sellOrders.filter(o => o.status === 'active').length,
      activeBuyOrders: this.buyOrders.filter(o => o.status === 'active').length,
      dailyVolume: Object.fromEntries(this.dailyVolume),
      totalTransactions: this.transactionHistory.length,
    };
  }
}

/** 市场订单 */
export interface MarketOrder {
  id: string;
  entityId: string;
  type: 'buy' | 'sell';
  resource: ResourceType;
  amount: number;
  remainingAmount: number;
  pricePerUnit: number;
  createdAt: unknown;
  status: 'active' | 'filled' | 'cancelled';
}

/** 市场统计 */
export interface MarketStats {
  prices: Record<string, number>;
  activeSellOrders: number;
  activeBuyOrders: number;
  dailyVolume: Record<string, number>;
  totalTransactions: number;
}
