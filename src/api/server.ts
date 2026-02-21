import express from 'express';
import path from 'path';
import { World } from '../core/World';
import { BuildingType, ResourceType } from '../core/types';
import { userStore } from '../auth/UserStore';
import { authMiddleware, requireRole, optionalAuth } from '../auth/middleware';

/**
 * API服务器 - 三角色系统: 超级管理员 / 投资用户 / 观察家
 */
export function createServer(world: World, port = 3000): express.Application {
  const app = express();
  app.use(express.json());

  // CORS
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (_req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // 静态文件
  const publicPath = path.join(__dirname, '../../public');
  app.use(express.static(publicPath));

  // ==================== 认证 API ====================

  /** 注册 */
  app.post('/api/auth/register', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度2-20个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6个字符' });
    }
    // 只允许注册 investor 或 observer
    const userRole = role === 'observer' ? 'observer' : 'investor';
    try {
      const user = userStore.createUser(username, password, userRole);
      const token = userStore.login(username, password);
      // If investor, create a game entity
      let entityId: string | undefined;
      if (userRole === 'investor') {
        const entity = world.createPlayer(username);
        entityId = entity.id;
        userStore.updateUser(user.id, { entityId });
      }
      res.status(201).json({
        token,
        user: { id: user.id, username, role: userRole, entityId },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** 登录 */
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    try {
      const token = userStore.login(username, password);
      const user = userStore.findByUsername(username)!;
      res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role, entityId: user.entityId },
      });
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  /** 获取当前用户信息 */
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      entityId: user.entityId,
    });
  });

  // ==================== 管理员 API ====================

  /** 获取所有用户 */
  app.get('/api/admin/users', authMiddleware, requireRole('admin'), (_req, res) => {
    res.json(userStore.getAllUsers());
  });

  /** 修改用户角色 */
  app.put('/api/admin/users/:id/role', authMiddleware, requireRole('admin'), (req, res) => {
    try {
      userStore.updateUser(req.params.id, { role: req.body.role });
      res.json({ status: 'ok' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** 删除用户 */
  app.delete('/api/admin/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
    userStore.deleteUser(req.params.id);
    res.json({ status: 'deleted' });
  });

  /** 修改世界规则 */
  app.post('/api/admin/rules', authMiddleware, requireRole('admin'), (req, res) => {
    const { ruleName, value } = req.body;
    if (!ruleName || value === undefined) {
      return res.status(400).json({ error: 'ruleName and value required' });
    }
    try {
      world.rules.setRuleValue(ruleName, value);
      res.json({ status: 'ok', ruleName, value });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** 修改货币总量 (给实体发钱/扣钱) */
  app.post('/api/admin/money', authMiddleware, requireRole('admin'), (req, res) => {
    const { entityId, amount } = req.body;
    if (!entityId || amount === undefined) {
      return res.status(400).json({ error: 'entityId and amount required' });
    }
    const entity = world.entities.getEntity(entityId);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    if (amount > 0) {
      entity.receive(amount);
    } else {
      entity.pay(Math.abs(amount));
    }
    res.json(entity.getSummary());
  });

  /** 创建AI智能体 (管理员) */
  app.post('/api/admin/agents', authMiddleware, requireRole('admin'), (req, res) => {
    const { name, personality, useLLM } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const entity = world.createAgent(name, personality, useLLM);
    res.status(201).json(entity.getSummary());
  });

  /** 世界控制 (管理员) */
  app.post('/api/admin/world/:action', authMiddleware, requireRole('admin'), (req, res) => {
    switch (req.params.action) {
      case 'start':
        world.start();
        return res.json({ status: 'started' });
      case 'stop':
        world.stop();
        return res.json({ status: 'stopped' });
      case 'tick':
        world.manualTick();
        return res.json({ time: world.state.getTime() });
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  });

  // ==================== 公共 API (所有角色) ====================

  /** 世界时间 (公开) */
  app.get('/api/world/time', (_req, res) => {
    res.json({
      time: world.state.getTime(),
      formatted: world.state.clock.formatTime(),
      running: world.state.clock.isRunning(),
    });
  });

  /** 世界状态 */
  app.get('/api/world', optionalAuth, (_req, res) => {
    res.json(world.getFullSnapshot());
  });

  /** 世界统计 */
  app.get('/api/world/stats', (_req, res) => {
    res.json(world.state.getStatistics());
  });

  /** 兼容旧接口: 世界控制 (无认证时也可用，方便调试) */
  app.post('/api/world/start', (_req, res) => {
    world.start();
    res.json({ status: 'started' });
  });
  app.post('/api/world/stop', (_req, res) => {
    world.stop();
    res.json({ status: 'stopped' });
  });
  app.post('/api/world/tick', (_req, res) => {
    world.manualTick();
    res.json({ time: world.state.getTime() });
  });

  /** 实体列表 */
  app.get('/api/entities', (_req, res) => {
    res.json(world.entities.getAllEntities().map(e => e.getSummary()));
  });

  /** 排行榜 */
  app.get('/api/entities/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    res.json(world.entities.getLeaderboard(limit).map(e => e.getSummary()));
  });

  /** 单个实体 */
  app.get('/api/entities/:id', (req, res) => {
    const entity = world.entities.getEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    res.json(entity.getSummary());
  });

  /** 建筑列表 */
  app.get('/api/buildings', (_req, res) => {
    res.json(world.buildings.getAllBuildings().map(b => b.getSummary()));
  });

  /** 市场 */
  app.get('/api/market', (_req, res) => {
    res.json(world.market.getStats());
  });
  app.get('/api/market/prices', (_req, res) => {
    res.json(world.market.getAllPrices());
  });
  app.get('/api/market/transactions', (req, res) => {
    const count = parseInt(req.query.count as string) || 20;
    res.json(world.market.getRecentTransactions(count));
  });

  /** 银行 */
  app.get('/api/bank', (_req, res) => {
    res.json(world.bank.getStats());
  });

  /** 规则 */
  app.get('/api/rules', (_req, res) => {
    res.json(world.rules.getSummary());
  });
  app.get('/api/rules/history', (_req, res) => {
    res.json(world.rules.getRuleHistory());
  });

  /** 事件 */
  app.get('/api/events', (req, res) => {
    const count = parseInt(req.query.count as string) || 50;
    res.json(world.state.eventBus.getRecentEvents(count));
  });

  // ==================== 投资用户 API ====================

  /** 投资者操作: 购买资源 */
  app.post('/api/game/buy', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const { resource, amount } = req.body;
    const tx = world.market.buyAtMarketPrice(user.entityId, resource as ResourceType, amount);
    if (!tx) return res.status(400).json({ error: '购买失败: 资金不足或数量无效' });
    res.json(tx);
  });

  /** 投资者操作: 出售资源 */
  app.post('/api/game/sell', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const { resource, amount } = req.body;
    const tx = world.market.sellAtMarketPrice(user.entityId, resource as ResourceType, amount);
    if (!tx) return res.status(400).json({ error: '出售失败: 库存不足' });
    res.json(tx);
  });

  /** 投资者操作: 建造 */
  app.post('/api/game/build', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const { type } = req.body;
    if (!Object.values(BuildingType).includes(type)) {
      return res.status(400).json({ error: '无效的建筑类型' });
    }
    const building = world.buildings.build(user.entityId, type, { x: Math.floor(Math.random() * 50), y: Math.floor(Math.random() * 50) });
    if (!building) return res.status(400).json({ error: '建造失败: 资金不足' });
    res.status(201).json(building.getSummary());
  });

  /** 投资者操作: 升级建筑 */
  app.post('/api/game/buildings/:id/upgrade', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const success = world.buildings.upgradeBuilding(req.params.id, user.entityId);
    if (!success) return res.status(400).json({ error: '升级失败' });
    res.json({ status: 'upgraded' });
  });

  /** 投资者操作: 贷款 */
  app.post('/api/game/loan', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });
    const loan = world.bank.requestLoan(entity, req.body.amount);
    if (!loan) return res.status(400).json({ error: '贷款被拒绝' });
    res.json(loan);
  });

  /** 投资者操作: 存款 */
  app.post('/api/game/deposit', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });
    const deposit = world.bank.makeDeposit(entity, req.body.amount);
    if (!deposit) return res.status(400).json({ error: '存款失败' });
    res.json(deposit);
  });

  /** 投资者: 获取自己的状态 */
  app.get('/api/game/me', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });
    const buildings = world.buildings.getBuildingsByOwner(user.entityId).map(b => b.getSummary());
    res.json({ entity: entity.getSummary(), buildings });
  });

  // ==================== 兼容旧接口 ====================

  app.post('/api/agents', (req, res) => {
    const { name, personality, useLLM } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const entity = world.createAgent(name, personality, useLLM);
    res.status(201).json(entity.getSummary());
  });

  app.post('/api/players', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const entity = world.createPlayer(name);
    res.status(201).json(entity.getSummary());
  });

  app.post('/api/buildings', (req, res) => {
    const { ownerId, type, position } = req.body;
    if (!ownerId || !type) return res.status(400).json({ error: 'ownerId and type required' });
    if (!Object.values(BuildingType).includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const building = world.buildings.build(ownerId, type, position || { x: 0, y: 0 });
    if (!building) return res.status(400).json({ error: 'Build failed' });
    res.status(201).json(building.getSummary());
  });

  app.post('/api/market/buy', (req, res) => {
    const { buyerId, resource, amount } = req.body;
    const tx = world.market.buyAtMarketPrice(buyerId, resource as ResourceType, amount);
    if (!tx) return res.status(400).json({ error: 'Purchase failed' });
    res.json(tx);
  });

  app.post('/api/market/sell', (req, res) => {
    const { sellerId, resource, amount } = req.body;
    const tx = world.market.sellAtMarketPrice(sellerId, resource as ResourceType, amount);
    if (!tx) return res.status(400).json({ error: 'Sale failed' });
    res.json(tx);
  });

  // ==================== 页面路由 ====================

  app.get('/login', (_req, res) => {
    res.sendFile(path.join(publicPath, 'login.html'));
  });
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(publicPath, 'admin.html'));
  });
  app.get('/game', (_req, res) => {
    res.sendFile(path.join(publicPath, 'game.html'));
  });
  app.get('/news', (_req, res) => {
    res.sendFile(path.join(publicPath, 'news.html'));
  });

  // ==================== 启动 ====================
  if (!process.env.DEPLOY_ENV) {
    app.listen(port, '0.0.0.0', () => {
      console.log(`\n[EchoWorld] 服务器运行在 http://0.0.0.0:${port}`);
      console.log(`[EchoWorld] 前端面板: http://localhost:${port}/`);
      console.log(`[EchoWorld] 默认管理员: admin / admin888`);
    });
  }

  return app;
}
