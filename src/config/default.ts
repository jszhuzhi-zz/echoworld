import { WorldConfig } from '../core/types';

/**
 * 1号世界 - 商业规则世界（类大富翁）
 * World #1 - Commerce Rules World (Monopoly-like)
 */
export const WORLD_1_CONFIG: WorldConfig = {
  name: 'EchoWorld #1 - 商业世界',
  tickIntervalMs: 1000,        // 每秒一个tick
  hoursPerDay: 24,              // 每天24小时
  ticksPerHour: 10,             // 每小时10个tick（1天=240tick=4分钟真实时间）
  startingCurrency: 1000,       // 初始资金1000
  dailyBasicIncome: 100,        // 每日基础收入100
  taxRate: 0.05,                // 5%交易税
  maxEntities: 100,             // 最多100个实体
  mapWidth: 50,                 // 地图宽50
  mapHeight: 50,                // 地图高50
};

/**
 * 预设的AI智能体性格模板（10种，对应10个初始智能体）
 */
export const AGENT_PERSONALITIES = {
  /** 商人 - 高贪婪度，善于交易 */
  merchant: {
    riskTolerance: 0.6,
    greed: 0.8,
    socialAwareness: 0.3,
    innovation: 0.4,
    patience: 0.5,
  },
  /** 建设者 - 专注基建 */
  builder: {
    riskTolerance: 0.4,
    greed: 0.3,
    socialAwareness: 0.7,
    innovation: 0.6,
    patience: 0.8,
  },
  /** 冒险家 - 高风险高回报 */
  adventurer: {
    riskTolerance: 0.9,
    greed: 0.6,
    socialAwareness: 0.2,
    innovation: 0.8,
    patience: 0.2,
  },
  /** 保守派 - 稳健发展 */
  conservative: {
    riskTolerance: 0.2,
    greed: 0.3,
    socialAwareness: 0.5,
    innovation: 0.3,
    patience: 0.9,
  },
  /** 创新者 - 追求新事物 */
  innovator: {
    riskTolerance: 0.7,
    greed: 0.4,
    socialAwareness: 0.5,
    innovation: 0.9,
    patience: 0.4,
  },
  /** 银行家 - 金融操作 */
  banker: {
    riskTolerance: 0.5,
    greed: 0.7,
    socialAwareness: 0.4,
    innovation: 0.3,
    patience: 0.7,
  },
  /** 农场主 - 自给自足 */
  farmer: {
    riskTolerance: 0.3,
    greed: 0.2,
    socialAwareness: 0.6,
    innovation: 0.4,
    patience: 0.9,
  },
  /** 投机者 - 短线操作 */
  speculator: {
    riskTolerance: 0.95,
    greed: 0.9,
    socialAwareness: 0.1,
    innovation: 0.5,
    patience: 0.1,
  },
  /** 慈善家 - 重社区 */
  philanthropist: {
    riskTolerance: 0.4,
    greed: 0.1,
    socialAwareness: 0.95,
    innovation: 0.5,
    patience: 0.6,
  },
  /** 全能型 - 平衡发展 */
  balanced: {
    riskTolerance: 0.5,
    greed: 0.5,
    socialAwareness: 0.5,
    innovation: 0.5,
    patience: 0.5,
  },
};

/**
 * 默认AI智能体名称池（中文）
 */
export const AGENT_NAMES = [
  '李商隐', '王财通', '赵建国', '钱多多', '孙策略',
  '周富贵', '吴创新', '郑经营', '冯达人', '陈稳健',
  '楚先知', '卫投资', '蒋管理', '沈金融', '韩市场',
  '杨勤奋', '朱储蓄', '秦发展', '许创业', '何机遇',
];
