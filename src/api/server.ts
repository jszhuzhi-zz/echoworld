import express from 'express';
import path from 'path';
import { World } from '../core/World';
import { BuildingType, ResourceType, EntityType, WorldEventType } from '../core/types';
import { userStore } from '../auth/UserStore';
import { authMiddleware, requireRole, optionalAuth } from '../auth/middleware';
import { InfiniteWorld, MASLOW_BUILDINGS } from '../board/InfiniteWorld';

/** Server-side i18n helper */
const S_I18N: Record<string, Record<string, string>> = {
  zh: {
    tax_paid: '缴税 %s CC', welfare: '领取福利 100 CC',
    lucky: '幸运事件！获得 %s CC', loss: '意外损失 %s CC',
    found_bld: '发现 %s 的 %s (%s Lv.%s)，可选择消费',
    death: '角色死亡！%s CC 已转入世界国库。角色不可复活。',
    hunger_warn: '⚠️ 饥饿值过低！请尽快进食', energy_warn: '⚠️ 体力不支！请尽快休息',
    used_bld: '使用了 %s，花费 %s CC', consumed_bld: '消费了 %s，支付 %s CC',
    stat_hunger: '饱食度', stat_energy: '体力', stat_happy: '幸福感',
    effect_prefix: '效果', upgraded: '🎉 %s 升级到 Lv.%s！',
    built: '建造了 %s (%s,%s)，花费 %s CC',
    death_confirm: '角色已永久死亡，剩余财富已转入世界国库',
    recharge_amt: '充值 %s CC', first_bonus: '🎉 首充赠送 %s CC！', received: '到账 %s CC',
    rec_hunger: '花费 %s CC 恢复饥饿 +%s',
    no_entity: '未绑定游戏角色', no_char: '角色不存在', dead: '角色已死亡',
    no_move: '行动次数已用完或角色已死亡', cant_move: '无法移动，请先掷骰子',
    no_fund: '资金不足，需要 %s CC', no_use: '无法使用该设施',
    bad_type: '无效建筑类型', cant_build: '该位置无法建造（非空地块或已有建筑）',
    demolished: '已拆除 %s，返还 %s CC', cant_demolish: '无法拆除（不是你的建筑或位置无效）',
    not_dead: '角色尚未死亡', hunger_full: '饥饿值已满', no_nodeId: '缺少 nodeId',
    cant_consume: '无法消费该建筑', reset_ok: '所有玩家每日行动已重置',
    rech_range: '充值金额 1-100000 CC',
    offer_sent: '出价 %s CC 购买 %s (含税 %s CC)，等待卖家确认',
    offer_accepted: '交易完成！%s 已转让，支付 %s CC (税 %s CC)',
    offer_rejected: '出价被拒绝', offer_invalid: '无效出价',
    offer_no_fund: '资金不足', offer_exists: '已有待处理出价',
    offer_not_found: '出价不存在', offer_not_yours: '无权操作此出价',
    offer_received: '收到 %s 的出价 %s CC 购买你的 %s',
    seller_accept: '%s 已出售给 %s，收入 %s CC (税后)',
    offer_price_low: '出价须大于0',
    // Auth
    email_required: '请输入邮箱地址',
    email_invalid: '邮箱格式不正确',
    email_exists: '该邮箱已注册',
    nickname_required: '请输入昵称',
    nickname_len: '昵称长度2-20个字符',
    nickname_exists: '该昵称已被使用',
    pwd_required: '请输入密码',
    pwd_len: '密码至少6个字符',
    code_required: '请输入验证码',
    code_invalid: '验证码错误或已过期',
    code_sent: '验证码已发送至 %s',
    code_frequent: '请求过于频繁，请稍后再试',
    login_failed: '邮箱或密码错误',
    login_empty: '请输入邮箱和密码',
  },
  en: {
    tax_paid: 'Tax paid %s CC', welfare: 'Welfare received 100 CC',
    lucky: 'Lucky! Gained %s CC', loss: 'Unexpected loss %s CC',
    found_bld: 'Found %s\'s %s (%s Lv.%s), can consume',
    death: 'Character died! %s CC transferred to treasury. Cannot revive.',
    hunger_warn: '⚠️ Hunger critical! Eat soon', energy_warn: '⚠️ Energy low! Rest soon',
    used_bld: 'Used %s, cost %s CC', consumed_bld: 'Consumed %s, paid %s CC',
    stat_hunger: 'Hunger', stat_energy: 'Energy', stat_happy: 'Happiness',
    effect_prefix: 'Effects', upgraded: '🎉 %s upgraded to Lv.%s!',
    built: 'Built %s (%s,%s), cost %s CC',
    death_confirm: 'Character permanently dead, remaining wealth transferred to treasury',
    recharge_amt: 'Recharged %s CC', first_bonus: '🎉 First purchase bonus %s CC!', received: 'Received %s CC',
    rec_hunger: 'Spent %s CC, hunger +%s',
    no_entity: 'No game character linked', no_char: 'Character not found', dead: 'Character is dead',
    no_move: 'No actions left or character dead', cant_move: 'Cannot move, roll dice first',
    no_fund: 'Insufficient funds, need %s CC', no_use: 'Cannot use this facility',
    bad_type: 'Invalid building type', cant_build: 'Cannot build here (not empty lot or already occupied)',
    demolished: 'Demolished %s, refunded %s CC', cant_demolish: 'Cannot demolish (not your building or invalid)',
    not_dead: 'Character not dead yet', hunger_full: 'Hunger is full', no_nodeId: 'Missing nodeId',
    cant_consume: 'Cannot consume this building', reset_ok: 'All daily actions reset',
    rech_range: 'Recharge 1-100000 CC',
    offer_sent: 'Offered %s CC for %s (incl. tax %s CC), awaiting seller',
    offer_accepted: 'Trade complete! %s transferred, paid %s CC (tax %s CC)',
    offer_rejected: 'Offer rejected', offer_invalid: 'Invalid offer',
    offer_no_fund: 'Insufficient funds', offer_exists: 'Pending offer exists',
    offer_not_found: 'Offer not found', offer_not_yours: 'Not authorized',
    offer_received: 'Received %s CC offer from %s for your %s',
    seller_accept: '%s sold to %s, received %s CC (after tax)',
    offer_price_low: 'Price must be > 0',
    // Auth
    email_required: 'Email is required',
    email_invalid: 'Invalid email format',
    email_exists: 'Email already registered',
    nickname_required: 'Nickname is required',
    nickname_len: 'Nickname must be 2-20 characters',
    nickname_exists: 'Nickname already taken',
    pwd_required: 'Password is required',
    pwd_len: 'Password must be at least 6 characters',
    code_required: 'Verification code is required',
    code_invalid: 'Invalid or expired verification code',
    code_sent: 'Code sent to %s',
    code_frequent: 'Too many requests, please wait',
    login_failed: 'Incorrect email or password',
    login_empty: 'Email and password are required',
  },
};
function st(lang: string, key: string, ...args: (string|number)[]): string {
  const dict = S_I18N[lang] || S_I18N.zh;
  let s = dict[key] || S_I18N.zh[key] || key;
  for (const a of args) s = s.replace('%s', String(a));
  return s;
}
function getLang(req: express.Request): string {
  return (req.headers['x-lang'] as string) || 'zh';
}

/**
 * API服务器 - 三角色系统: 超级管理员 / 投资用户 / 观察家
 *
 * 经济系统: 世界初始总财富=0，每新增用户+1100CC (用户1000+邀请奖励100)
 * 用户死亡不可复活，财富归管理者国库
 */
export function createServer(world: World, port = 3000): express.Application {
  const app = express();
  app.use(express.json());

  // 无限世界地图
  const infiniteWorld = new InfiniteWorld();

  // === 无限世界 - 定时恢复 ===
  let _lastHour = -1;
  let _lastDay = -1;

  // 监听 tick 事件: 每日重置行动 & 饥饿衰减
  world.state.eventBus.on(WorldEventType.TICK, (event) => {
    const time = (event.data as any).time;
    if (!time) return;
    // 每日开始: 重置行动, 饥饿衰减 -10, 幸福感 -5
    if (time.day !== _lastDay) {
      _lastDay = time.day;
      infiniteWorld.resetDailyActions();
    }
  });

  // 体力恢复基于真实时间: 每真实小时恢复 +5 体力
  setInterval(() => {
    infiniteWorld.hourlyRecovery();
  }, 60 * 60 * 1000);

  // === 管理员国库实体 ===
  const adminUser = userStore.findByUsername('admin');
  let treasuryEntityId: string | null = null;
  if (adminUser) {
    if (!adminUser.entityId) {
      const treasuryEntity = world.entities.createEntity(EntityType.HUMAN_PLAYER, '世界国库');
      // 国库初始0资金
      (treasuryEntity as any).currency = 0;
      treasuryEntityId = treasuryEntity.id;
      userStore.updateUser(adminUser.id, { entityId: treasuryEntity.id });
    } else {
      world.entities.restoreEntity(adminUser.entityId, EntityType.HUMAN_PLAYER, '世界国库');
      treasuryEntityId = adminUser.entityId;
      // 恢复后国库资金从持久化中恢复，这里不重置
    }
  }

  /** 获取国库实体 */
  function getTreasury() {
    if (!treasuryEntityId) return null;
    return world.entities.getEntity(treasuryEntityId);
  }

  // 恢复所有用户的游戏实体 (服务器重启后重建)
  for (const user of userStore.getAllUsers()) {
    if (user.role === 'investor' && user.entityId) {
      world.entities.restoreEntity(user.entityId, EntityType.HUMAN_PLAYER, user.username);
      infiniteWorld.initPlayer(user.entityId);
    }
  }

  // 确保预置投资者账号有对应的游戏实体
  const testUser = userStore.findByUsername('testplayer');
  if (testUser && testUser.role === 'investor' && !testUser.entityId) {
    const testEntity = world.createPlayer('testplayer');
    // 新用户初始1000CC (createPlayer已通过config设置)
    userStore.updateUser(testUser.id, { entityId: testEntity.id });
    infiniteWorld.initPlayer(testEntity.id);
  }

  // CORS
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Lang');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (_req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // 静态文件
  const publicPath = path.join(__dirname, '../../public');
  app.use(express.static(publicPath));

  // ==================== 认证 API ====================

  /** 发送邮箱验证码 */
  app.post('/api/auth/send-code', (req, res) => {
    const lang = getLang(req);
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: st(lang, 'email_required') });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: st(lang, 'email_invalid') });

    try {
      const code = userStore.generateVerificationCode(email);
      // In production, send email via SMTP/service. Here we log + return for demo.
      console.log(`[EchoWorld] Verification code for ${email}: ${code}`);
      res.json({ message: st(lang, 'code_sent', email), _devCode: code });
    } catch (err: any) {
      if (err.message === 'CODE_TOO_FREQUENT') {
        return res.status(429).json({ error: st(lang, 'code_frequent') });
      }
      res.status(500).json({ error: err.message });
    }
  });

  /** 检查昵称是否可用 */
  app.post('/api/auth/check-nickname', (req, res) => {
    const lang = getLang(req);
    const { nickname } = req.body;
    if (!nickname || nickname.length < 2 || nickname.length > 20) {
      return res.json({ available: false, error: st(lang, 'nickname_len') });
    }
    const existing = userStore.findByNickname(nickname);
    res.json({ available: !existing, error: existing ? st(lang, 'nickname_exists') : undefined });
  });

  /** 注册 (邮箱+验证码+昵称) */
  app.post('/api/auth/register', (req, res) => {
    const lang = getLang(req);
    const { email, nickname, password, code, referralCode } = req.body;

    // Validation
    if (!email) return res.status(400).json({ error: st(lang, 'email_required') });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: st(lang, 'email_invalid') });
    if (!nickname) return res.status(400).json({ error: st(lang, 'nickname_required') });
    if (nickname.length < 2 || nickname.length > 20) return res.status(400).json({ error: st(lang, 'nickname_len') });
    if (!password) return res.status(400).json({ error: st(lang, 'pwd_required') });
    if (password.length < 6) return res.status(400).json({ error: st(lang, 'pwd_len') });
    if (!code) return res.status(400).json({ error: st(lang, 'code_required') });

    // Verify email code
    if (!userStore.verifyCode(email, code)) {
      return res.status(400).json({ error: st(lang, 'code_invalid') });
    }

    // 注册统一为 investor
    const userRole: 'investor' = 'investor';

    // 查找邀请者
    let inviterUserId: string | undefined;
    if (referralCode) {
      const inviter = userStore.findByReferralCode(referralCode);
      if (inviter) inviterUserId = inviter.id;
    }

    try {
      const user = userStore.createUser(email, nickname, password, userRole, inviterUserId);
      const token = userStore.login(email, password);

      let entityId: string | undefined;
      if (userRole === 'investor') {
        const entity = world.createPlayer(nickname);
        entityId = entity.id;
        userStore.updateUser(user.id, { entityId });
        infiniteWorld.initPlayer(entity.id);

        // 邀请奖励: 100CC → 邀请者 (无邀请者则 → 国库)
        const INVITE_BONUS = 100;
        if (inviterUserId) {
          const inviterUser = userStore.findById(inviterUserId);
          if (inviterUser?.entityId) {
            const inviterEntity = world.entities.getEntity(inviterUser.entityId);
            if (inviterEntity) {
              inviterEntity.receive(INVITE_BONUS);
              infiniteWorld.addReferralCredit(inviterUser.entityId);
            }
          }
        } else {
          const treasury = getTreasury();
          if (treasury) treasury.receive(INVITE_BONUS);
        }
      }

      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, nickname: user.nickname, username: user.nickname, role: userRole, entityId, referralCode: user.referralCode },
      });
    } catch (err: any) {
      const msg = err.message;
      if (msg === 'EMAIL_EXISTS') return res.status(400).json({ error: st(lang, 'email_exists') });
      if (msg === 'NICKNAME_EXISTS') return res.status(400).json({ error: st(lang, 'nickname_exists') });
      res.status(400).json({ error: msg });
    }
  });

  /** 登录 (邮箱+密码, 兼容旧用户名) */
  app.post('/api/auth/login', (req, res) => {
    const lang = getLang(req);
    const { email, password, username } = req.body;
    const loginId = email || username; // backward compat
    if (!loginId || !password) {
      return res.status(400).json({ error: st(lang, 'login_empty') });
    }
    try {
      const token = userStore.login(loginId, password);
      const user = userStore.findByEmail(loginId) || userStore.findByUsername(loginId);
      if (!user) return res.status(401).json({ error: st(lang, 'login_failed') });
      res.json({
        token,
        user: {
          id: user.id, email: user.email, nickname: user.nickname, username: user.nickname,
          role: user.role, entityId: user.entityId, referralCode: user.referralCode,
          hasRecharged: user.hasRecharged ?? false,
        },
      });
    } catch (err: any) {
      const msg = err.message;
      if (msg === 'LOGIN_FAILED') return res.status(401).json({ error: st(lang, 'login_failed') });
      res.status(401).json({ error: msg });
    }
  });

  /** 获取当前用户信息 */
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      username: user.nickname,
      role: user.role,
      entityId: user.entityId,
      referralCode: user.referralCode,
      hasRecharged: user.hasRecharged ?? false,
      totalRecharged: user.totalRecharged ?? 0,
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

  /** 投资者操作: 取款 */
  app.post('/api/game/withdraw', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });
    const total = world.bank.withdraw(entity, req.body.depositId);
    if (total === 0) return res.status(400).json({ error: '取款失败' });
    res.json({ amount: total, entity: entity.getSummary() });
  });

  /** 投资者操作: 还贷 */
  app.post('/api/game/repay', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: '未绑定游戏角色' });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: '角色不存在' });
    const ok = world.bank.repayLoan(entity, req.body.loanId, req.body.amount);
    if (!ok) return res.status(400).json({ error: '还款失败' });
    res.json({ message: '还款成功', entity: entity.getSummary() });
  });

  /** 获取所有银行类建筑 */
  app.get('/api/world/banks', (_req, res) => {
    const banks = infiniteWorld.getBankBuildings();
    res.json(banks.map(b => ({
      nodeId: b.nodeId,
      name: b.building.name,
      type: b.building.templateType,
      owner: b.building.ownerName,
      level: b.building.level,
      depositRate: b.building.customDepositRate ?? 0.05,
      loanRate: b.building.customLoanRate ?? 0.08,
      loanPool: b.building.loanPool ?? 0,
      totalDeposits: b.building.totalDeposits ?? 0,
      totalLoansOut: b.building.totalLoansOut ?? 0,
    })));
  });

  /** 银行业主: 设置利率 */
  app.post('/api/world/bank/set-rates', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const { nodeId, depositRate, loanRate } = req.body;
    const ok = infiniteWorld.setBankRates(user.entityId, nodeId, depositRate, loanRate);
    if (!ok) return res.status(400).json({ error: lang === 'zh' ? '无法设置利率' : 'Cannot set rates' });
    res.json({ message: lang === 'zh' ? '利率设置成功' : 'Rates updated' });
  });

  /** 银行业主: 注入资金池 */
  app.post('/api/world/bank/fund-pool', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });
    const { nodeId, amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: lang === 'zh' ? '金额无效' : 'Invalid amount' });
    if (!entity.pay(amount)) return res.status(400).json({ error: st(lang, 'no_fund', amount) });
    const pool = infiniteWorld.depositToLoanPool(user.entityId, nodeId, amount);
    if (pool === 0) { entity.receive(amount); return res.status(400).json({ error: lang === 'zh' ? '操作失败' : 'Failed' }); }
    res.json({ message: lang === 'zh' ? `已注入 ${amount} CC 到资金池` : `Funded ${amount} CC to loan pool`, pool, entity: entity.getSummary() });
  });

  /** 用户在银行建筑存款 */
  app.post('/api/world/bank/deposit', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });
    const { nodeId, amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: lang === 'zh' ? '金额无效' : 'Invalid amount' });
    if (!entity.pay(amount)) return res.status(400).json({ error: st(lang, 'no_fund', amount) });
    const result = infiniteWorld.bankDeposit(user.entityId, nodeId, amount);
    if (!result) { entity.receive(amount); return res.status(400).json({ error: lang === 'zh' ? '存款失败' : 'Deposit failed' }); }
    // 同时记录到 Bank 系统
    world.bank.makeDeposit(entity, 0); // 已扣款，记录即可
    res.json({
      message: lang === 'zh' ? `存入 ${amount} CC，日利率 ${(result.depositRate * 100).toFixed(1)}%` : `Deposited ${amount} CC at ${(result.depositRate * 100).toFixed(1)}% daily`,
      depositRate: result.depositRate,
      entity: entity.getSummary(),
    });
  });

  /** 用户在银行建筑贷款 */
  app.post('/api/world/bank/loan', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });
    const { nodeId, amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: lang === 'zh' ? '金额无效' : 'Invalid amount' });
    const isPaidUser = user.hasRecharged ?? false;
    const result = infiniteWorld.bankLoan(user.entityId, nodeId, amount, isPaidUser);
    if (!result) return res.status(400).json({
      error: lang === 'zh' ? '贷款失败（额度不足或资金池不够）' : 'Loan denied (limit exceeded or insufficient pool)',
    });
    entity.receive(amount);
    // 记录到 Bank 系统
    world.bank.requestLoan(entity, 0); // 已发放，记录即可
    const riskWarn = lang === 'zh'
      ? `⚠️ 金融风险提示: 日利率 ${(result.loanRate * 100).toFixed(1)}%，请及时还款避免债务增长`
      : `⚠️ Risk: ${(result.loanRate * 100).toFixed(1)}% daily rate. Repay timely to avoid debt growth`;
    res.json({
      message: lang === 'zh' ? `贷款 ${amount} CC，日利率 ${(result.loanRate * 100).toFixed(1)}%` : `Loan ${amount} CC at ${(result.loanRate * 100).toFixed(1)}% daily`,
      riskWarning: riskWarn,
      loanRate: result.loanRate,
      remainingPool: result.remaining,
      entity: entity.getSummary(),
    });
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
    if (!user?.entityId) return res.status(400).json({ error: st(getLang(req), 'no_entity') });
    const state = infiniteWorld.getPlayer(user.entityId) || infiniteWorld.initPlayer(user.entityId);
    const node = infiniteWorld.nodes.get(state.nodeId);
    const entity = world.entities.getEntity(user.entityId);
    const nearbyLots = infiniteWorld.getNearbyBuildable(node?.x ?? 0, node?.y ?? 0, 10);
    res.json({ state, node, entity: entity?.getSummary(), nearbyLots });
  });

  /** 掷骰子 (返回方向选项) */
  app.post('/api/world/roll', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(getLang(req), 'no_entity') });
    const result = infiniteWorld.rollDice(user.entityId);
    if (!result) return res.status(400).json({ error: st(getLang(req), 'no_move') });
    res.json(result);
  });

  /** 选择方向移动 */
  app.post('/api/world/move', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(getLang(req), 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(getLang(req), 'no_char') });

    const { directionNodeId } = req.body;
    const moveResult = infiniteWorld.moveToDirection(user.entityId, directionNodeId);
    if (!moveResult) return res.status(400).json({ error: st(getLang(req), 'cant_move') });

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
    const lang = getLang(req);
    const messages: string[] = [];
    for (const evt of moveResult.events) {
      if (evt === 'TAX') {
        const tax = Math.floor(entity.getSummary().currency * 0.05);
        entity.pay(tax);
        const treasury = getTreasury();
        if (treasury) treasury.receive(tax);
        messages.push(st(lang, 'tax_paid', tax));
      } else if (evt === 'WELFARE') {
        entity.receive(100);
        messages.push(st(lang, 'welfare'));
      } else if (evt === 'RANDOM_EVENT') {
        const r = Math.random();
        if (r < 0.5) {
          const bonus = Math.floor(Math.random() * 300) + 50;
          entity.receive(bonus);
          messages.push(st(lang, 'lucky', bonus));
        } else {
          const loss = Math.floor(Math.random() * 150) + 20;
          entity.pay(loss);
          messages.push(st(lang, 'loss', loss));
        }
      } else if (evt === 'BUILDING') {
        const b = moveResult.finalNode.building!;
        const tpl = MASLOW_BUILDINGS.find(t => t.type === b.templateType);
        messages.push(st(lang, 'found_bld', b.ownerName, b.name, tpl?.icon || '', b.level));
      } else if (evt === 'DEATH') {
        const deathWealth = entity.getSummary().currency;
        if (deathWealth > 0) {
          entity.pay(deathWealth);
          const treasury = getTreasury();
          if (treasury) treasury.receive(deathWealth);
        }
        messages.push(st(lang, 'death', deathWealth));
      } else if (evt === 'HUNGER_WARNING') {
        messages.push(st(lang, 'hunger_warn'));
      } else if (evt === 'ENERGY_WARNING') {
        messages.push(st(lang, 'energy_warn'));
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
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });

    const state = infiniteWorld.getPlayer(user.entityId);
    if (!state) return res.status(400).json({ error: st(lang, 'no_entity') });

    const result = infiniteWorld.useBuilding(user.entityId, state.nodeId);
    if (!result) return res.status(400).json({ error: st(lang, 'no_use') });

    // 扣费并转给业主
    if (result.fee > 0) {
      if (!entity.pay(result.fee)) {
        return res.status(400).json({ error: st(lang, 'no_fund', result.fee) });
      }
      const owner = world.entities.getEntity(result.building.ownerId);
      if (owner) owner.receive(result.fee);
    }

    const statNames: Record<string, string> = { hunger: st(lang, 'stat_hunger'), energy: st(lang, 'stat_energy'), happiness: st(lang, 'stat_happy') };
    const messages = [st(lang, 'used_bld', result.building.name, result.fee)];
    for (const [stat, val] of Object.entries(result.effects)) {
      messages.push(`${statNames[stat] || stat} +${val}`);
    }
    if (result.upgraded) {
      messages.push(st(lang, 'upgraded', result.building.name, result.building.level));
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
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });

    const { nodeId, templateType, customName } = req.body;
    const template = MASLOW_BUILDINGS.find(b => b.type === templateType);
    if (!template) return res.status(400).json({ error: st(lang, 'bad_type') });

    if (entity.getSummary().currency < template.cost) {
      return res.status(400).json({ error: st(lang, 'no_fund', template.cost) });
    }

    const result = infiniteWorld.buildOnNode(
      user.entityId, nodeId, templateType, entity.name, customName
    );
    if (!result) return res.status(400).json({ error: st(lang, 'cant_build') });

    entity.pay(template.cost);

    const node = infiniteWorld.nodes.get(nodeId)!;
    res.json({
      message: st(lang, 'built', result.building.name, node.x, node.y, template.cost),
      building: result.building,
      template: result.template,
      entity: entity.getSummary(),
    });
  });

  /** 拆除建筑 (所有者拆除，返还30%费用) */
  app.post('/api/world/demolish', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });

    const { nodeId } = req.body;
    const result = infiniteWorld.demolishBuilding(user.entityId, nodeId);
    if (!result) return res.status(400).json({ error: st(lang, 'cant_demolish') });

    entity.receive(result.refund);
    res.json({
      message: st(lang, 'demolished', result.template.name, result.refund),
      entity: entity.getSummary(),
    });
  });

  /** 死亡确认 (不可复活，财富归国库) */
  app.post('/api/world/confirm-death', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const state = infiniteWorld.getPlayer(user.entityId);
    if (!state || state.alive) return res.status(400).json({ error: st(lang, 'not_dead') });

    const entity = world.entities.getEntity(user.entityId);
    if (entity) {
      const remaining = entity.getSummary().currency;
      if (remaining > 0) {
        entity.pay(remaining);
        const treasury = getTreasury();
        if (treasury) treasury.receive(remaining);
      }
    }

    res.json({
      message: st(lang, 'death_confirm'),
      transferredToTreasury: entity?.getSummary().currency ?? 0,
    });
  });

  /** 充值购买CC币 */
  app.post('/api/world/recharge', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });

    const state = infiniteWorld.getPlayer(user.entityId);
    if (state && !state.alive) return res.status(400).json({ error: st(lang, 'dead') });

    const { amount } = req.body;
    if (!amount || amount < 1 || amount > 100000) {
      return res.status(400).json({ error: st(lang, 'rech_range') });
    }

    const isFirstRecharge = !(user.hasRecharged ?? false);
    const bonus = isFirstRecharge ? Math.floor(amount * 0.5) : 0;
    const totalCC = amount + bonus;

    entity.receive(totalCC);

    userStore.updateUser(user.id, {
      hasRecharged: true,
      totalRecharged: (user.totalRecharged ?? 0) + amount,
    });

    const messages = [st(lang, 'recharge_amt', amount)];
    if (bonus > 0) messages.push(st(lang, 'first_bonus', bonus));
    messages.push(st(lang, 'received', totalCC));

    res.json({
      messages,
      amount,
      bonus,
      totalCC,
      isFirstRecharge,
      entity: entity.getSummary(),
    });
  });

  /** 世界经济概览 */
  app.get('/api/world/economy', (req, res) => {
    const treasury = getTreasury();
    const allEntities = world.entities.getAllEntities();
    let totalWealth = 0;
    for (const e of allEntities) {
      totalWealth += e.getSummary().currency;
    }
    const playerCount = userStore.getAllUsers().filter(u => u.role === 'investor').length;

    res.json({
      totalWorldWealth: totalWealth,
      treasuryBalance: treasury?.getSummary().currency ?? 0,
      playerCount,
      theoreticalWealth: playerCount * 1100, // 每个玩家进入世界产生1100CC
    });
  });

  /** 花费CC恢复饥饿 (比建筑消费贵) */
  app.post('/api/world/recover-hunger', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });
    const state = infiniteWorld.getPlayer(user.entityId);
    if (!state?.alive) return res.status(400).json({ error: st(lang, 'dead') });

    const cost = 80;
    const recovery = 20;
    if (entity.getSummary().currency < cost) {
      return res.status(400).json({ error: st(lang, 'no_fund', cost) });
    }
    if (state.hunger >= 100) {
      return res.status(400).json({ error: st(lang, 'hunger_full') });
    }

    entity.pay(cost);
    const treasury = getTreasury();
    if (treasury) treasury.receive(cost);
    state.hunger = Math.min(100, state.hunger + recovery);

    res.json({
      message: st(lang, 'rec_hunger', cost, recovery),
      stats: { hunger: state.hunger, energy: state.energy, happiness: state.happiness, alive: state.alive },
      entity: entity.getSummary(),
      state,
    });
  });

  /** 消耗健康值换取额外行动次数 */
  app.post('/api/world/buy-action', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(getLang(req), 'no_entity') });
    const lang = getLang(req);
    const result = infiniteWorld.buyExtraAction(user.entityId);
    if (!result.success) {
      let errMsg = result.message;
      if (lang === 'en') {
        if (errMsg.includes('已死亡')) errMsg = 'Character is dead';
        else if (errMsg.includes('不足')) errMsg = 'Insufficient health (need Energy≥10 & Hunger≥5)';
      }
      return res.status(400).json({ error: errMsg });
    }
    const state = infiniteWorld.getPlayer(user.entityId);
    let msg = result.message;
    if (lang === 'en') {
      msg = `Spent 10 Energy + 5 Hunger, Action +10 (${state?.actionsToday ?? 0}/${state?.maxActions ?? 20})`;
    }
    res.json({ message: msg, stats: result.stats, state });
  });

  /** 在指定节点消费建筑 (路过消费) */
  app.post('/api/world/use-building-at', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });

    const { nodeId } = req.body;
    if (nodeId === undefined) return res.status(400).json({ error: st(lang, 'no_nodeId') });

    const result = infiniteWorld.useBuilding(user.entityId, nodeId);
    if (!result) return res.status(400).json({ error: st(lang, 'cant_consume') });

    entity.pay(result.fee);
    const ownerEntity = world.entities.getEntity(result.building.ownerId);
    if (ownerEntity) ownerEntity.receive(result.fee);

    const statNames: Record<string, string> = { hunger: st(lang, 'stat_hunger'), energy: st(lang, 'stat_energy'), happiness: st(lang, 'stat_happy') };
    const messages: string[] = [];
    messages.push(st(lang, 'consumed_bld', result.building.name, result.fee));
    const effectDescs = Object.entries(result.effects).map(([k, v]) => {
      return `${statNames[k] || k} +${v}`;
    });
    if (effectDescs.length) messages.push(`${st(lang, 'effect_prefix')}: ${effectDescs.join(', ')}`);
    if (result.upgraded) messages.push(st(lang, 'upgraded', result.building.name, result.building.level));

    const state = infiniteWorld.getPlayer(user.entityId);
    res.json({
      messages,
      entity: entity.getSummary(),
      stats: state ? { hunger: state.hunger, energy: state.energy, happiness: state.happiness, alive: state.alive } : null,
      state,
    });
  });

  // ============ 资产交易 API ============

  /** 设置/取消挂牌出售价格 */
  app.post('/api/world/trade/set-price', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });

    const { nodeId, price } = req.body;
    const ok = infiniteWorld.setListingPrice(user.entityId, nodeId, price ?? null);
    if (!ok) return res.status(400).json({ error: st(lang, 'offer_invalid') || 'Invalid' });

    const node = infiniteWorld.nodes.get(nodeId);
    const bName = node?.building?.name || '?';
    if (price && price > 0) {
      res.json({ message: lang === 'zh' ? `${bName} 已挂牌出售，价格 ${price} CC` : `${bName} listed for ${price} CC` });
    } else {
      res.json({ message: lang === 'zh' ? `${bName} 已取消挂牌` : `${bName} delisted` });
    }
  });

  /** 出价购买建筑 */
  app.post('/api/world/trade/offer', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });
    const entity = world.entities.getEntity(user.entityId);
    if (!entity) return res.status(404).json({ error: st(lang, 'no_char') });

    const { nodeId, price } = req.body;
    if (!price || price <= 0) return res.status(400).json({ error: st(lang, 'offer_price_low') });
    if (entity.getSummary().currency < price) return res.status(400).json({ error: st(lang, 'offer_no_fund') });

    const offer = infiniteWorld.createTradeOffer(user.entityId, entity.name, nodeId, price);
    if (!offer) return res.status(400).json({ error: st(lang, 'offer_invalid') });

    const node = infiniteWorld.nodes.get(nodeId);
    const bName = node?.building?.name || '?';

    res.json({
      offer,
      message: st(lang, 'offer_sent', price, bName, offer.tax),
    });
  });

  /** 获取我的交易 (收到的 + 发出的) */
  app.get('/api/world/trade/my-offers', authMiddleware, requireRole('investor'), (req, res) => {
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: 'no entity' });
    infiniteWorld.cleanExpiredOffers();
    const received = infiniteWorld.getPendingOffersForSeller(user.entityId);
    const sent = infiniteWorld.getPendingOffersFromBuyer(user.entityId);
    res.json({ received, sent });
  });

  /** 接受出价 */
  app.post('/api/world/trade/accept', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });

    const { offerId } = req.body;
    const offer = infiniteWorld.tradeOffers.get(offerId);
    if (!offer) return res.status(404).json({ error: st(lang, 'offer_not_found') });
    if (offer.sellerId !== user.entityId) return res.status(403).json({ error: st(lang, 'offer_not_yours') });

    // Check buyer has enough funds
    const buyerEntity = world.entities.getEntity(offer.buyerId);
    if (!buyerEntity || buyerEntity.getSummary().currency < offer.price) {
      offer.status = 'rejected';
      return res.status(400).json({ error: st(lang, 'offer_no_fund') });
    }

    // Execute trade
    const result = infiniteWorld.acceptTradeOffer(offerId, user.entityId);
    if (!result) return res.status(400).json({ error: st(lang, 'offer_invalid') });

    // Transfer funds: buyer pays price, seller receives netPrice, tax to treasury
    buyerEntity.pay(offer.price);
    const sellerEntity = world.entities.getEntity(offer.sellerId);
    if (sellerEntity) sellerEntity.receive(offer.netPrice);
    const treasury = getTreasury();
    if (treasury) treasury.receive(offer.tax);

    res.json({
      offer: result.offer,
      building: result.building,
      message: st(lang, 'seller_accept', result.building.name, offer.buyerName, offer.netPrice),
    });
  });

  /** 拒绝出价 */
  app.post('/api/world/trade/reject', authMiddleware, requireRole('investor'), (req, res) => {
    const lang = getLang(req);
    const user = userStore.findById(req.user!.userId);
    if (!user?.entityId) return res.status(400).json({ error: st(lang, 'no_entity') });

    const { offerId } = req.body;
    const ok = infiniteWorld.rejectTradeOffer(offerId, user.entityId);
    if (!ok) return res.status(400).json({ error: st(lang, 'offer_not_found') });

    res.json({ message: st(lang, 'offer_rejected') });
  });

  /** 管理员: 重置每日行动 */
  app.post('/api/admin/board/reset', authMiddleware, requireRole('admin'), (req, res) => {
    infiniteWorld.resetDailyActions();
    res.json({ status: 'ok', message: st(getLang(req), 'reset_ok') });
  });

  /** 管理员: 修改每日行动上限 */
  app.post('/api/admin/board/actions-limit', authMiddleware, requireRole('admin'), (req, res) => {
    const { limit } = req.body;
    if (!limit || limit < 1) return res.status(400).json({ error: '无效上限' });
    infiniteWorld.setMaxActions(limit);
    res.json({ status: 'ok', maxActions: limit });
  });

  /** 管理员: 复活玩家 */
  app.post('/api/admin/revive', authMiddleware, requireRole('admin'), (req, res) => {
    const { entityId } = req.body;
    if (!entityId) return res.status(400).json({ error: '缺少 entityId' });
    const ok = infiniteWorld.revivePlayer(entityId);
    if (!ok) return res.status(400).json({ error: '复活失败（玩家不存在或未死亡）' });
    const entity = world.entities.getEntity(entityId);
    res.json({ status: 'ok', message: `${entity?.name || entityId} 已复活`, entity: entity?.getSummary() });
  });

  /** 管理员: 国库转账给成员 */
  app.post('/api/admin/treasury-transfer', authMiddleware, requireRole('admin'), (req, res) => {
    const { entityId, amount } = req.body;
    if (!entityId || !amount || amount <= 0) return res.status(400).json({ error: '参数无效' });
    const treasury = getTreasury();
    if (!treasury) return res.status(400).json({ error: '国库不存在' });
    const tBal = treasury.getSummary().currency;
    if (tBal < amount) return res.status(400).json({ error: `国库余额不足 (${tBal} CC)` });
    const target = world.entities.getEntity(entityId);
    if (!target) return res.status(404).json({ error: '目标实体不存在' });
    treasury.pay(amount);
    target.receive(amount);
    res.json({
      status: 'ok',
      message: `已从国库转 ${amount} CC 给 ${target.name}`,
      treasury: treasury.getSummary().currency,
      target: target.getSummary(),
    });
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
