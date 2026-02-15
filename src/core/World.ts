import {
  WorldConfig,
  EntityType,
  WorldEventType,
} from './types';
import { WorldState } from './WorldState';
import { EntityManager } from '../entities/EntityManager';
import { Entity } from '../entities/Entity';
import { Bank } from '../economy/Bank';
import { TaxSystem } from '../economy/TaxSystem';
import { BuildingManager } from '../infrastructure/BuildingManager';
import { Market } from '../market/Market';
import { RuleEngine } from '../rules/RuleEngine';
import { AgentBrain, AgentPersonality } from '../ai/AgentBrain';
import { LLMConnector } from '../ai/AgentBrain';
import { createLLMConnector, LLMProviderConfig } from '../ai/LLMProvider';

/**
 * World - 世界主控制器，协调所有子系统
 * The main world controller that orchestrates all subsystems
 */
export class World {
  readonly state: WorldState;
  readonly entities: EntityManager;
  readonly bank: Bank;
  readonly tax: TaxSystem;
  readonly buildings: BuildingManager;
  readonly market: Market;
  readonly rules: RuleEngine;

  private agentBrains: Map<string, AgentBrain> = new Map();
  private llmConfig: LLMProviderConfig | null = null;
  private tickCount = 0;
  private agentThinkInterval = 4; // AI每4个tick思考一次

  constructor(config: WorldConfig) {
    this.state = new WorldState(config);
    this.entities = new EntityManager(this.state);
    this.bank = new Bank(this.state);
    this.tax = new TaxSystem(this.state, this.entities);
    this.buildings = new BuildingManager(this.state, this.entities);
    this.market = new Market(this.state, this.entities);
    this.rules = new RuleEngine(this.state);

    this.setupTickHandler();
  }

  private setupTickHandler(): void {
    this.state.eventBus.on(WorldEventType.TICK, async () => {
      this.tickCount++;
      if (this.tickCount % this.agentThinkInterval === 0) {
        await this.runAgentThinking();
      }
    });
  }

  /** 启动世界 */
  start(): void {
    console.log(`[EchoWorld] 世界"${this.state.config.name}"启动中...`);
    console.log(`[EchoWorld] 配置: ${this.state.config.tickIntervalMs}ms/tick, ${this.state.config.hoursPerDay}h/day, ${this.state.config.ticksPerHour}ticks/h`);
    this.state.clock.start();
    console.log(`[EchoWorld] 世界已启动 - ${this.state.clock.formatTime()}`);
  }

  /** 停止世界 */
  stop(): void {
    this.state.clock.stop();
    console.log(`[EchoWorld] 世界已停止 - ${this.state.clock.formatTime()}`);
  }

  /** 配置LLM提供者 */
  configureLLM(config: LLMProviderConfig): void {
    this.llmConfig = config;
    console.log(`[EchoWorld] LLM已配置: ${config.provider}/${config.model}`);
  }

  /** 创建AI智能体 */
  createAgent(
    name: string,
    personality?: Partial<AgentPersonality>,
    useLLM = false,
  ): Entity {
    const entity = this.entities.createEntity(EntityType.AI_AGENT, name);

    const brain = new AgentBrain(
      entity,
      this.state,
      this.market,
      this.buildings,
      this.bank,
      personality,
    );

    if (useLLM && this.llmConfig) {
      const connector = createLLMConnector(this.llmConfig);
      brain.setLLMConnector(connector);
    }

    this.agentBrains.set(entity.id, brain);

    console.log(`[EchoWorld] AI智能体"${name}"已创建 (ID: ${entity.id.slice(0, 8)}...)`);
    return entity;
  }

  /** 创建人类玩家 */
  createPlayer(name: string): Entity {
    const entity = this.entities.createEntity(EntityType.HUMAN_PLAYER, name);
    console.log(`[EchoWorld] 人类玩家"${name}"已登录 (ID: ${entity.id.slice(0, 8)}...)`);
    return entity;
  }

  /** 运行所有AI智能体的思考 */
  private async runAgentThinking(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [entityId, brain] of this.agentBrains) {
      const entity = this.entities.getEntity(entityId);
      if (!entity || entity.status !== 'active') continue;

      promises.push(
        brain.think().catch(err => {
          console.error(`[EchoWorld] Agent ${entityId} thinking error:`, err);
        }).then(() => undefined)
      );
    }

    await Promise.all(promises);
  }

  /** 获取世界完整快照 */
  getFullSnapshot(): WorldFullSnapshot {
    return {
      world: this.state.getSnapshot(),
      entities: this.entities.getAllEntities().map(e => e.getSummary()),
      leaderboard: this.entities.getLeaderboard().map(e => ({
        name: e.name,
        netWorth: e.getNetWorth(),
        buildings: e.ownedBuildings.length,
      })),
      market: this.market.getStats(),
      bank: this.bank.getStats(),
      tax: this.tax.getStats(),
      rules: this.rules.getSummary(),
    };
  }

  /** 手动推进世界一个tick */
  manualTick(): void {
    this.state.clock.tick();
  }

  /** 快速推进N个tick */
  async fastForward(ticks: number): Promise<void> {
    for (let i = 0; i < ticks; i++) {
      this.state.clock.tick();
      if (i % this.agentThinkInterval === 0) {
        await this.runAgentThinking();
      }
    }
  }
}

/** 世界完整快照 */
export interface WorldFullSnapshot {
  world: unknown;
  entities: unknown[];
  leaderboard: Array<{
    name: string;
    netWorth: number;
    buildings: number;
  }>;
  market: unknown;
  bank: unknown;
  tax: unknown;
  rules: unknown;
}
