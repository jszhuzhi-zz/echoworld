import { v4 as uuidv4 } from 'uuid';
import { WorldEventType, WorldTime } from '../core/types';
import { WorldState } from '../core/WorldState';
import { Entity } from '../entities/Entity';

/**
 * 银行系统 - 管理世界的金融体系
 * Manages the world's financial system: loans, deposits, interest
 */
export class Bank {
  private worldState: WorldState;
  private loans: Map<string, Loan[]> = new Map();
  private deposits: Map<string, Deposit[]> = new Map();
  private totalMoneySupply: number = 0;
  private baseInterestRate: number = 0.05;   // 基础利率 5%
  private loanInterestRate: number = 0.08;   // 贷款利率 8%（每日）
  private depositInterestRate: number = 0.05; // 存款利率 5%（每日）

  constructor(worldState: WorldState) {
    this.worldState = worldState;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 每天结算利息
    this.worldState.eventBus.on(WorldEventType.DAY_END, () => {
      this.settleInterest();
    });
  }

  /** 申请贷款 */
  requestLoan(entity: Entity, amount: number): Loan | null {
    // 信用评估
    const maxLoan = this.calculateMaxLoan(entity);
    if (amount > maxLoan) return null;
    if (amount <= 0) return null;

    const loan: Loan = {
      id: uuidv4(),
      borrowerId: entity.id,
      principal: amount,
      remainingBalance: amount,
      interestRate: this.calculateLoanRate(entity),
      dailyPayment: amount * this.loanInterestRate / 30, // 分30天还
      createdAt: this.worldState.getTime(),
      dueDay: this.worldState.clock.getDay() + 30,
      status: 'active',
    };

    entity.receive(amount);
    this.totalMoneySupply += amount;

    const entityLoans = this.loans.get(entity.id) || [];
    entityLoans.push(loan);
    this.loans.set(entity.id, entityLoans);

    return loan;
  }

  /** 存款 */
  makeDeposit(entity: Entity, amount: number): Deposit | null {
    if (!entity.pay(amount)) return null;

    const deposit: Deposit = {
      id: uuidv4(),
      depositorId: entity.id,
      amount,
      interestRate: this.depositInterestRate,
      createdAt: this.worldState.getTime(),
      accumulatedInterest: 0,
    };

    const entityDeposits = this.deposits.get(entity.id) || [];
    entityDeposits.push(deposit);
    this.deposits.set(entity.id, entityDeposits);

    return deposit;
  }

  /** 取款 */
  withdraw(entity: Entity, depositId: string): number {
    const entityDeposits = this.deposits.get(entity.id);
    if (!entityDeposits) return 0;

    const idx = entityDeposits.findIndex(d => d.id === depositId);
    if (idx === -1) return 0;

    const deposit = entityDeposits[idx];
    const totalReturn = deposit.amount + deposit.accumulatedInterest;
    entity.receive(totalReturn);
    entityDeposits.splice(idx, 1);

    return totalReturn;
  }

  /** 偿还贷款 */
  repayLoan(entity: Entity, loanId: string, amount: number): boolean {
    const entityLoans = this.loans.get(entity.id);
    if (!entityLoans) return false;

    const loan = entityLoans.find(l => l.id === loanId);
    if (!loan || loan.status !== 'active') return false;

    const payment = Math.min(amount, loan.remainingBalance);
    if (!entity.pay(payment)) return false;

    loan.remainingBalance -= payment;
    if (loan.remainingBalance <= 0) {
      loan.status = 'paid';
      entity.creditScore = Math.min(1000, entity.creditScore + 20);
    }

    return true;
  }

  /** 每日利息结算 (利率为每日利率，不再除365) */
  private settleInterest(): void {
    // 贷款利息 (每日 8% 默认)
    for (const [entityId, entityLoans] of this.loans) {
      for (const loan of entityLoans) {
        if (loan.status !== 'active') continue;

        const dailyInterest = loan.remainingBalance * loan.interestRate;
        loan.remainingBalance += dailyInterest;

        // 检查逾期
        if (this.worldState.clock.getDay() > loan.dueDay) {
          loan.status = 'overdue';
        }
      }
    }

    // 存款利息 (每日 5% 默认)
    for (const [, entityDeposits] of this.deposits) {
      for (const deposit of entityDeposits) {
        const dailyInterest = deposit.amount * deposit.interestRate;
        deposit.accumulatedInterest += dailyInterest;
      }
    }
  }

  /** 计算最大贷款额度 */
  private calculateMaxLoan(entity: Entity): number {
    const creditFactor = entity.creditScore / 1000;
    const existingDebt = this.getEntityDebt(entity.id);
    const maxByCredit = entity.getNetWorth() * 2 * creditFactor;
    return Math.max(0, maxByCredit - existingDebt);
  }

  /** 计算个性化贷款利率 */
  private calculateLoanRate(entity: Entity): number {
    const creditFactor = 1 - (entity.creditScore / 1000) * 0.5;
    return this.loanInterestRate * (0.5 + creditFactor);
  }

  /** 获取实体总债务 */
  getEntityDebt(entityId: string): number {
    const entityLoans = this.loans.get(entityId) || [];
    return entityLoans
      .filter(l => l.status === 'active' || l.status === 'overdue')
      .reduce((sum, l) => sum + l.remainingBalance, 0);
  }

  /** 获取实体总存款 */
  getEntityDeposits(entityId: string): number {
    const entityDeposits = this.deposits.get(entityId) || [];
    return entityDeposits.reduce((sum, d) => sum + d.amount + d.accumulatedInterest, 0);
  }

  /** 获取银行统计 */
  getStats(): BankStats {
    let totalLoans = 0;
    let totalDeposits = 0;
    let activeLoans = 0;

    for (const [, entityLoans] of this.loans) {
      for (const loan of entityLoans) {
        if (loan.status === 'active' || loan.status === 'overdue') {
          totalLoans += loan.remainingBalance;
          activeLoans++;
        }
      }
    }

    for (const [, entityDeposits] of this.deposits) {
      for (const deposit of entityDeposits) {
        totalDeposits += deposit.amount + deposit.accumulatedInterest;
      }
    }

    return {
      totalMoneySupply: this.totalMoneySupply,
      totalLoans,
      totalDeposits,
      activeLoans,
      baseInterestRate: this.baseInterestRate,
      loanInterestRate: this.loanInterestRate,
      depositInterestRate: this.depositInterestRate,
    };
  }

  /** 动态调整利率（基于经济状态） */
  adjustInterestRates(inflationRate: number): void {
    if (inflationRate > 0.05) {
      this.baseInterestRate = Math.min(0.15, this.baseInterestRate + 0.01);
    } else if (inflationRate < 0.02) {
      this.baseInterestRate = Math.max(0.01, this.baseInterestRate - 0.01);
    }
    this.loanInterestRate = this.baseInterestRate + 0.03;
    this.depositInterestRate = this.baseInterestRate - 0.02;
  }
}

/** 贷款记录 */
export interface Loan {
  id: string;
  borrowerId: string;
  principal: number;
  remainingBalance: number;
  interestRate: number;
  dailyPayment: number;
  createdAt: WorldTime;
  dueDay: number;
  status: 'active' | 'paid' | 'overdue' | 'defaulted';
}

/** 存款记录 */
export interface Deposit {
  id: string;
  depositorId: string;
  amount: number;
  interestRate: number;
  createdAt: WorldTime;
  accumulatedInterest: number;
}

/** 银行统计 */
export interface BankStats {
  totalMoneySupply: number;
  totalLoans: number;
  totalDeposits: number;
  activeLoans: number;
  baseInterestRate: number;
  loanInterestRate: number;
  depositInterestRate: number;
}
