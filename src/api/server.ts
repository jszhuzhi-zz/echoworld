import express from 'express';
import { World } from '../core/World';
import {
  BuildingType,
  ResourceType,
} from '../core/types';

/**
 * API服务器 - 为人类玩家和外部系统提供HTTP接口
 * API Server - Provides HTTP endpoints for human players and external systems
 */
export function createServer(world: World, port = 3000): express.Application {
  const app = express();
  app.use(express.json());

  // ========== 世界信息 ==========

  /** 获取世界状态 */
  app.get('/api/world', (_req, res) => {
    res.json(world.getFullSnapshot());
  });

  /** 获取世界时间 */
  app.get('/api/world/time', (_req, res) => {
    res.json({
      time: world.state.getTime(),
      formatted: world.state.clock.formatTime(),
      running: world.state.clock.isRunning(),
    });
  });

  /** 获取世界统计 */
  app.get('/api/world/stats', (_req, res) => {
    res.json(world.state.getStatistics());
  });

  /** 启动世界 */
  app.post('/api/world/start', (_req, res) => {
    world.start();
    res.json({ status: 'started' });
  });

  /** 停止世界 */
  app.post('/api/world/stop', (_req, res) => {
    world.stop();
    res.json({ status: 'stopped' });
  });

  /** 手动推进 */
  app.post('/api/world/tick', (_req, res) => {
    world.manualTick();
    res.json({ time: world.state.getTime() });
  });

  // ========== 实体管理 ==========

  /** 获取所有实体 */
  app.get('/api/entities', (_req, res) => {
    const entities = world.entities.getAllEntities().map(e => e.getSummary());
    res.json(entities);
  });

  /** 获取排行榜 */
  app.get('/api/entities/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = world.entities.getLeaderboard(limit).map(e => e.getSummary());
    res.json(leaderboard);
  });

  /** 获取单个实体 */
  app.get('/api/entities/:id', (req, res) => {
    const entity = world.entities.getEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    res.json(entity.getSummary());
  });

  /** 创建AI智能体 */
  app.post('/api/agents', (req, res) => {
    const { name, personality, useLLM } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const entity = world.createAgent(name, personality, useLLM);
    res.status(201).json(entity.getSummary());
  });

  /** 创建人类玩家 */
  app.post('/api/players', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const entity = world.createPlayer(name);
    res.status(201).json(entity.getSummary());
  });

  // ========== 建筑 ==========

  /** 获取所有建筑 */
  app.get('/api/buildings', (_req, res) => {
    const buildings = world.buildings.getAllBuildings().map(b => b.getSummary());
    res.json(buildings);
  });

  /** 建造建筑 */
  app.post('/api/buildings', (req, res) => {
    const { ownerId, type, position } = req.body;
    if (!ownerId || !type) {
      return res.status(400).json({ error: 'ownerId and type are required' });
    }
    if (!Object.values(BuildingType).includes(type)) {
      return res.status(400).json({ error: 'Invalid building type' });
    }
    const building = world.buildings.build(ownerId, type, position || { x: 0, y: 0 });
    if (!building) return res.status(400).json({ error: 'Cannot build: insufficient funds or invalid owner' });
    res.status(201).json(building.getSummary());
  });

  /** 升级建筑 */
  app.post('/api/buildings/:id/upgrade', (req, res) => {
    const { requesterId } = req.body;
    const success = world.buildings.upgradeBuilding(req.params.id, requesterId);
    if (!success) return res.status(400).json({ error: 'Cannot upgrade' });
    res.json({ status: 'upgraded' });
  });

  // ========== 市场 ==========

  /** 获取市场信息 */
  app.get('/api/market', (_req, res) => {
    res.json(world.market.getStats());
  });

  /** 获取所有价格 */
  app.get('/api/market/prices', (_req, res) => {
    res.json(world.market.getAllPrices());
  });

  /** 市价购买 */
  app.post('/api/market/buy', (req, res) => {
    const { buyerId, resource, amount } = req.body;
    if (!buyerId || !resource || !amount) {
      return res.status(400).json({ error: 'buyerId, resource, and amount required' });
    }
    const tx = world.market.buyAtMarketPrice(buyerId, resource as ResourceType, amount);
    if (!tx) return res.status(400).json({ error: 'Purchase failed' });
    res.json(tx);
  });

  /** 市价出售 */
  app.post('/api/market/sell', (req, res) => {
    const { sellerId, resource, amount } = req.body;
    if (!sellerId || !resource || !amount) {
      return res.status(400).json({ error: 'sellerId, resource, and amount required' });
    }
    const tx = world.market.sellAtMarketPrice(sellerId, resource as ResourceType, amount);
    if (!tx) return res.status(400).json({ error: 'Sale failed' });
    res.json(tx);
  });

  /** 获取最近交易 */
  app.get('/api/market/transactions', (req, res) => {
    const count = parseInt(req.query.count as string) || 20;
    res.json(world.market.getRecentTransactions(count));
  });

  // ========== 银行 ==========

  /** 获取银行统计 */
  app.get('/api/bank', (_req, res) => {
    res.json(world.bank.getStats());
  });

  /** 申请贷款 */
  app.post('/api/bank/loan', (req, res) => {
    const { entityId, amount } = req.body;
    const entity = world.entities.getEntity(entityId);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    const loan = world.bank.requestLoan(entity, amount);
    if (!loan) return res.status(400).json({ error: 'Loan denied' });
    res.json(loan);
  });

  /** 存款 */
  app.post('/api/bank/deposit', (req, res) => {
    const { entityId, amount } = req.body;
    const entity = world.entities.getEntity(entityId);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    const deposit = world.bank.makeDeposit(entity, amount);
    if (!deposit) return res.status(400).json({ error: 'Deposit failed' });
    res.json(deposit);
  });

  // ========== 规则 ==========

  /** 获取所有规则 */
  app.get('/api/rules', (_req, res) => {
    res.json(world.rules.getSummary());
  });

  /** 获取规则变更历史 */
  app.get('/api/rules/history', (_req, res) => {
    res.json(world.rules.getRuleHistory());
  });

  // ========== 事件 ==========

  /** 获取最近事件 */
  app.get('/api/events', (req, res) => {
    const count = parseInt(req.query.count as string) || 50;
    res.json(world.state.eventBus.getRecentEvents(count));
  });

  // ========== 启动服务器 ==========
  app.listen(port, () => {
    console.log(`[EchoWorld API] 服务器运行在 http://localhost:${port}`);
    console.log(`[EchoWorld API] 可用端点:`);
    console.log(`  GET  /api/world          - 世界完整快照`);
    console.log(`  GET  /api/entities       - 所有实体`);
    console.log(`  GET  /api/market         - 市场信息`);
    console.log(`  GET  /api/bank           - 银行信息`);
    console.log(`  GET  /api/rules          - 世界规则`);
    console.log(`  POST /api/agents         - 创建AI智能体`);
    console.log(`  POST /api/players        - 创建人类玩家`);
    console.log(`  POST /api/world/start    - 启动世界`);
    console.log(`  POST /api/world/stop     - 停止世界`);
  });

  return app;
}
