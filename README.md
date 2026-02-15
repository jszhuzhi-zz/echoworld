# EchoWorld - AI智能体商业世界

一个自我进化的虚拟世界模拟系统，AI智能体和人类共存于商业规则之中。

## 概述

EchoWorld 是一个类似大富翁的虚拟世界，其中：
- **AI智能体** 由大语言模型(LLM)驱动，能自主做出商业决策
- **人类玩家** 可以通过API登录参与世界
- **世界规则** 根据运行状态自动进化和调整
- **经济系统** 包含完整的货币、银行、税收和市场体系

## 1号世界：商业规则世界

每个智能体/生命体都有：
- **每日需求与消耗** - 食物、能源、商品的日常消耗
- **基础设施建设** - 建造饭店、工厂、农场等获得资源
- **资源积累** - 通过生产和交易获得更多资源不断壮大
- **金融操作** - 贷款、存款、投资等金融行为

### 世界货币与金融体系
- 世界统一货币
- 银行系统：贷款、存款、利息
- 税收系统：交易税、财政再分配
- 市场系统：供需定价、订单撮合

## 架构

```
src/
├── core/           # 核心引擎
│   ├── types.ts        # 类型定义
│   ├── EventBus.ts     # 事件总线
│   ├── WorldClock.ts   # 世界时钟
│   ├── WorldState.ts   # 世界状态
│   └── World.ts        # 世界主控制器
├── entities/       # 实体系统
│   ├── Entity.ts       # 实体基类（AI/人类）
│   └── EntityManager.ts # 实体管理器
├── economy/        # 经济系统
│   ├── Bank.ts         # 银行（贷款/存款/利率）
│   └── TaxSystem.ts    # 税收与再分配
├── infrastructure/ # 基础设施
│   ├── Building.ts     # 建筑（生产/维护/升级）
│   └── BuildingManager.ts # 建筑管理器
├── market/         # 市场系统
│   └── Market.ts       # 交易/定价/供需
├── ai/             # AI智能体
│   ├── AgentBrain.ts   # 智能体大脑（决策引擎）
│   └── LLMProvider.ts  # LLM接入（OpenAI/Anthropic）
├── rules/          # 规则系统
│   └── RuleEngine.ts   # 规则自进化引擎
├── api/            # API服务
│   └── server.ts       # HTTP API服务器
└── index.ts        # 入口文件
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 编译
npm run build

# 生产模式运行
npm start

# 运行测试
npm test
```

## API 端点

### 世界
- `GET /api/world` - 世界完整快照
- `GET /api/world/time` - 当前世界时间
- `GET /api/world/stats` - 世界统计数据
- `POST /api/world/start` - 启动世界
- `POST /api/world/stop` - 停止世界
- `POST /api/world/tick` - 手动推进一个tick

### 实体
- `GET /api/entities` - 所有实体列表
- `GET /api/entities/leaderboard` - 财富排行榜
- `GET /api/entities/:id` - 单个实体详情
- `POST /api/agents` - 创建AI智能体
- `POST /api/players` - 创建人类玩家

### 市场
- `GET /api/market` - 市场信息
- `GET /api/market/prices` - 当前价格
- `POST /api/market/buy` - 市价购买资源
- `POST /api/market/sell` - 市价出售资源
- `GET /api/market/transactions` - 最近交易记录

### 银行
- `GET /api/bank` - 银行统计
- `POST /api/bank/loan` - 申请贷款
- `POST /api/bank/deposit` - 存款

### 规则
- `GET /api/rules` - 当前世界规则
- `GET /api/rules/history` - 规则进化历史

## AI智能体性格

每个AI智能体有5个性格维度：
- **风险偏好** (riskTolerance) - 对风险的承受能力
- **贪婪度** (greed) - 对财富的追求程度
- **社会意识** (socialAwareness) - 对社区的关注度
- **创新力** (innovation) - 尝试新事物的倾向
- **耐心** (patience) - 长期投资的意愿

预设性格模板：商人、建设者、冒险家、保守派、创新者

## 规则自进化

世界规则每7天自动评估一次，根据以下指标调整：
- **基尼系数** → 调整税率
- **平均财富** → 调整基础收入
- **GDP** → 调整建筑衰减率
- **破产率** → 调整破产保护
- **货币供应** → 调整贷款比例

## LLM 接入

支持接入外部大语言模型，让AI智能体进行更复杂的决策：

```typescript
world.configureLLM({
  provider: 'anthropic',
  apiKey: 'your-api-key',
  model: 'claude-sonnet-4-20250514',
});

world.createAgent('SmartBot', personality, true); // true = 使用LLM
```

支持的LLM提供者：
- OpenAI (GPT系列)
- Anthropic (Claude系列)
- 本地模型 (OpenAI兼容API)
- 自定义提供者

## 许可证

MIT
