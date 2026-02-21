import express from 'express';
import path from 'path';
import { World } from '../core/World';
import { BuildingType, ResourceType, EntityType } from '../core/types';
import { userStore } from '../auth/UserStore';
import { authMiddleware, requireRole, optionalAuth } from '../auth/middleware';
import { InfiniteWorld, MASLOW_BUILDINGS } from '../board/InfiniteWorld';

/**
 * API服务器 - 三角色系统: 超级管理员 / 投资用户 / 观察家
 */
export function createServer(world: World, port = 3000): express.Application {
  const app = express();
  app.use(express.json());

  // 无限世界地图
  const infiniteWorld = new InfiniteWorld();

  // 恢复所有用户的游戏实体 (服务器重启后重建)
  for (const user of userStore.getAllUsers()) {
    if (user.role === 'investor' && user.entityId) {
      // 在 world.entities 中恢复实体 (使用原始ID)
      world.entities.restoreEntity(user.entityId, EntityType.HUMAN_PLAYER, user.username);
      infiniteWorld.initPlayer(user.entityId);
    }
  }

  // 确保预置投资者账号有对应的游戏实体
  const testUser = userStore.findByUsername('testplayer');
  if (testUser && testUser.role === 'investor' && !testUser.entityId) {
    const testEntity = world.createPlayer('testplayer');
    userStore.updateUser(testUser.id, { entityId: testEntity.id });
    infiniteWorld.initPlayer(testEntity.id);
  }

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
        infiniteWorld.initPlayer(entity.id);
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
    infiniteWorld.initPlayer(entity.id);
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

  // ==================== 无限世界 API ====================

  /** 马斯洛建筑目录 */
  app.get('/api/world/buildings-catalog', (_req, res) => {
    res.json(MASLOW_BUILDINGS);
  });

  /** 地图可见区域 */
  app.get('/api/world/map', (req, res) => {
    const cx = parseInt(req.query.cx as string) || 0;
    const cy = parseInt(req.query.cy as string) || 0;
    const r  = Math.min(parseInt(req.query.r as string) || 20, 30);
    const nodes = infiniteWorld.getVisibleNodes(cx, cy, r);
    const players = infiniteWorld.getAllPlayerStates().map(p => {
      const entity = world.entities.getEntity(p.entityId);
      return { ...p, name: entity?.name || '???', money: entity?.getSummary().currency ?? 0 };
    });
    res.json({ nodes, players, worldBounds: infiniteWorld.getWorldBounds() });
  });

  /** 我的世界状态 */
  app.get('/api/world/me', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const state = infiniteWorld.getPlayer(user.entityId) || infiniteWorld.initPlayer(user.entityId);
    const node = infiniteWorld.nodes.get(state.nodeId);
    const entity = world.entities.getEntity(user.entityId);
    const nearbyLots = infiniteWorld.getNearbyLots(node?.x ?? 0, node?.y ?? 0, 10);
    res.json({ state, node, entity: entity?.getSummary(), nearbyLots });
  });

  /** 掷骰子 (返回方向选项) */
  app.post('/api/world/roll', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const result = infiniteWorld.rollDice(user.entityId);
    if (!result) return res.status(400).json({ error: '行动次数已用完或角色已死亡' });
    res.json(result);
  });

  /** 选择方向移动 */
  app.post('/api/world/move', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });

    const { directionNodeId } = req.body;
    const moveResult = infiniteWorld.moveToDirection(user.entityId, directionNodeId);
    if (!moveResult) return res.status(400).json({ error: '无法移动，请先掷骰子' });

    // 如果遇到岔路，直接返回（不结算事件）
    if (moveResult.fork) {
      return res.json({
        path: moveResult.path,
        finalNode: moveResult.finalNode,
        stats: moveResult.stats,
        messages: [],
        entity: entity.getSummary(),
        state: infiniteWorld.getPlayer(user.entityId),
        fork: true,
        directions: moveResult.directions,
        remainingSteps: moveResult.remainingSteps,
        passedBuildings: moveResult.passedBuildings,
      });
    }

    // 移动完成，处理格子效果
    const messages: string[] = [];
    for (const evt of moveResult.events) {
      if (evt === 'TAX') {
        const tax = Math.floor(entity.getSummary().currency * 0.05);
        entity.pay(tax);
        messages.push(`缴税 ${tax} CC`);
      } else if (evt === 'WELFARE') {
        entity.receive(100);
        messages.push('领取福利 100 CC');
      } else if (evt === 'RANDOM_EVENT') {
        const r = Math.random();
        if (r < 0.5) {
          const bonus = Math.floor(Math.random() * 300) + 50;
          entity.receive(bonus);
          messages.push(`幸运事件！获得 ${bonus} CC`);
        } else {
          const loss = Math.floor(Math.random() * 150) + 20;
          entity.pay(loss);
          messages.push(`意外损失 ${loss} CC`);
        }
      } else if (evt === 'BUILDING') {
        const b = moveResult.finalNode.building!;
        const tpl = MASLOW_BUILDINGS.find(t => t.type === b.templateType);
        messages.push(`发现 ${b.ownerName} 的 ${b.name} (${tpl?.icon || ''} Lv.${b.level})，可选择消费`);
      } else if (evt === 'DEATH') {
        entity.pay(Math.floor(entity.getSummary().currency * 0.5));
        messages.push('生命值耗尽！损失50%资产，即将重生...');
      } else if (evt === 'HUNGER_WARNING') {
        messages.push('⚠️ 饥饿值过低！请尽快进食');
      } else if (evt === 'ENERGY_WARNING') {
        messages.push('⚠️ 体力不支！请尽快休息');
      }
    }

    res.json({
      path: moveResult.path,
      finalNode: moveResult.finalNode,
      stats: moveResult.stats,
      messages,
      entity: entity.getSummary(),
      state: infiniteWorld.getPlayer(user.entityId),
      fork: false,
      directions: [],
      remainingSteps: 0,
      passedBuildings: moveResult.passedBuildings,
    });
  });

  /** 使用当前位置的建筑 (花钱吃饭/住店等) */
  app.post('/api/world/use-building', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });

    const state = infiniteWorld.getPlayer(user.entityId);
    if (!state) return res.status(400).json({ error: '玩家状态不存在' });

    const result = infiniteWorld.useBuilding(user.entityId, state.nodeId);
    if (!result) return res.status(400).json({ error: '无法使用该设施（可能是自己的建筑或此处无建筑）' });

    // 扣费并转给业主
    if (result.fee > 0) {
      if (!entity.pay(result.fee)) {
        return res.status(400).json({ error: `资金不足，需要 ${result.fee} CC` });
      }
      const owner = world.entities.getEntity(result.building.ownerId);
      if (owner) owner.receive(result.fee);
    }

    const messages = [`使用了 ${result.building.name}，花费 ${result.fee} CC`];
    for (const [stat, val] of Object.entries(result.effects)) {
      const names: Record<string, string> = { hunger: '饱食度', energy: '体力', happiness: '幸福感' };
      messages.push(`${names[stat] || stat} +${val}`);
    }
    if (result.upgraded) {
      messages.push(`🎉 ${result.building.name} 升级到 Lv.${result.building.level}！`);
    }

    res.json({
      messages,
      fee: result.fee,
      effects: result.effects,
      upgraded: result.upgraded,
      building: result.building,
      stats: {
        hunger: state.hunger,
        energy: state.energy,
        happiness: state.happiness,
        alive: state.alive,
      },
      entity: entity.getSummary(),
    });
  });

  /** 在地块上建造 */
  app.post('/api/world/build', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });

    const { nodeId, templateType, customName } = req.body;
    const template = MASLOW_BUILDINGS.find(b => b.type === templateType);
    if (!template) return res.status(400).json({ error: '无效建筑类型' });

    // 检查资金
    if (entity.getSummary().currency < template.cost) {
      return res.status(400).json({ error: `资金不足，需要 ${template.cost} CC` });
    }

    const result = infiniteWorld.buildOnNode(
      user.entityId, nodeId, templateType, entity.name, customName
    );
    if (!result) return res.status(400).json({ error: '该位置无法建造（非空地块或已有建筑）' });

    entity.pay(template.cost);

    res.json({
      message: `建造了 ${result.building.name}，花费 ${template.cost} CC`,
      building: result.building,
      template: result.template,
      entity: entity.getSummary(),
    });
  });

  /** 重生 */
  app.post('/api/world/respawn', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const state = infiniteWorld.respawn(user.entityId);
    if (!state) return res.status(400).json({ error: '重生失败' });
    const entity = world.entities.getEntity(user.entityId);
    res.json({ state, entity: entity?.getSummary(), message: '已在起点重生' });
  });

  /** 消耗健康值换取额外行动次数 */
  app.post('/api/world/buy-action', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const result = infiniteWorld.buyExtraAction(user.entityId);
    if (!result.success) return res.status(400).json({ error: result.message });
    const state = infiniteWorld.getPlayer(user.entityId);
    res.json({ message: result.message, stats: result.stats, state });
  });

  /** 在指定节点消费建筑 (路过消费) */
  app.post('/api/world/use-building-at', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });

    const { nodeId } = req.body;
    if (nodeId === undefined) return res.status(400).json({ error: '缺少 nodeId' });

    const result = infiniteWorld.useBuilding(user.entityId, nodeId);
    if (!result) return res.status(400).json({ error: '无法消费该建筑' });

    entity.pay(result.fee);
    // 业主收费
    const ownerEntity = world.entities.getEntity(result.building.ownerId);
    if (ownerEntity) ownerEntity.receive(result.fee);

    const messages: string[] = [];
    messages.push(`消费了 ${result.building.name}，支付 ${result.fee} CC`);
    const effectDescs = Object.entries(result.effects).map(([k, v]) => {
      const names: Record<string, string> = { hunger: '饥饿', energy: '体力', happiness: '快乐' };
      return `${names[k] || k} +${v}`;
    });
    if (effectDescs.length) messages.push(`效果: ${effectDescs.join(', ')}`);
    if (result.upgraded) messages.push(`🎉 ${result.building.name} 升级到 Lv.${result.building.level}！`);

    const state = infiniteWorld.getPlayer(user.entityId);
    res.json({
      messages,
      entity: entity.getSummary(),
      stats: state ? { hunger: state.hunger, energy: state.energy, happiness: state.happiness, alive: state.alive } : null,
      state,
    });
  });

  /** 管理员: 重置每日行动 */
  app.post('/api/admin/board/reset', authMiddleware, requireRole('admin'), (_req, res) => {
    infiniteWorld.resetDailyActions();
    res.json({ status: 'ok', message: '所有玩家每日行动已重置' });
  });

  /** 管理员: 修改每日行动上限 */
  app.post('/api/admin/board/actions-limit', authMiddleware, requireRole('admin'), (req, res) => {
    const { limit } = req.body;
    if (!limit || limit < 1) return res.status(400).json({ error: '无效上限' });
    infiniteWorld.setMaxActions(limit);
    res.json({ status: 'ok', maxActions: limit });
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
