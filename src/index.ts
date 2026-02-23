import { World } from './core/World';
import { WORLD_1_CONFIG, AGENT_PERSONALITIES, AGENT_NAMES } from './config/default';
import { createServer } from './api/server';
import { closeDB } from './core/Database';

/**
 * EchoWorld - AI智能体商业世界
 *
 * 一个自我进化的虚拟世界，AI智能体和人类共存于商业规则之中。
 * 每个实体都有每日需求与消耗，通过建造基础设施、交易资源来生存和壮大。
 * 世界有自己的货币和金融体系，规则会根据运行状态自动进化。
 */

function initWorld() {
  console.log('========================================');
  console.log('  EchoWorld - AI智能体商业世界 v0.2.0');
  console.log('  1号世界: 商业规则世界');
  console.log('  LLM引擎: 智谱GLM-4-Flash');
  console.log('========================================\n');

  // 1. 创建世界
  const world = new World(WORLD_1_CONFIG);

  // 2. 配置智谱GLM作为AI引擎
  const zhipuApiKey = process.env.ZHIPU_API_KEY || '';
  const zhipuModel = process.env.ZHIPU_MODEL || 'glm-4-flash';
  const useLLM = zhipuApiKey.length > 0;

  if (useLLM) {
    world.configureLLM({
      provider: 'zhipu',
      apiKey: zhipuApiKey,
      model: zhipuModel,
      maxTokens: 800,
      temperature: 0.7,
    });
    console.log(`[LLM] 智谱GLM已配置: ${zhipuModel}`);
  } else {
    console.log('[LLM] 未配置API密钥，使用内置规则引擎');
  }

  // 3. 创建10个AI智能体，全部接入GLM
  const personalityKeys = Object.keys(AGENT_PERSONALITIES) as Array<keyof typeof AGENT_PERSONALITIES>;
  const initialAgentCount = 10;

  console.log(`\n[初始化] 创建 ${initialAgentCount} 个AI智能体 (GLM驱动)...\n`);

  for (let i = 0; i < initialAgentCount; i++) {
    const name = AGENT_NAMES[i];
    const personalityKey = personalityKeys[i % personalityKeys.length];
    const personality = AGENT_PERSONALITIES[personalityKey];

    world.createAgent(name, personality, useLLM);
    console.log(`  - ${name} (${personalityKey}性格) ${useLLM ? '[GLM]' : '[规则]'}`);
  }

  // 4. 监听世界事件
  world.state.eventBus.on('*', (event) => {
    switch (event.type) {
      case 'day_start':
        console.log(`\n📅 === 第${event.data.day}天开始 === ${world.state.clock.formatTime()}`);
        break;
      case 'day_end': {
        const stats = world.state.getStatistics();
        console.log(`📊 第${event.data.day}天结束 - GDP: ${stats.dailyGDP.toFixed(0)}, 基尼系数: ${stats.giniCoefficient.toFixed(3)}`);
        break;
      }
      case 'entity_bankrupt':
        console.log(`💀 ${event.data.entityName} 破产了！存活了${event.data.survivalDays}天`);
        break;
      case 'rule_evolved':
        console.log(`📜 规则进化: ${event.data.ruleName} ${event.data.oldValue} → ${event.data.newValue}`);
        break;
      case 'building_built':
        console.log(`🏗️  新建筑: ${event.data.buildingType} (花费 ${event.data.cost})`);
        break;
    }
  });

  return { world, useLLM };
}

// 初始化世界和服务器
const { world } = initWorld();
const port = parseInt(process.env.PORT || '3000');
const { app, infiniteWorld } = createServer(world, port);

// 启动世界模拟
world.start();
console.log('\n[启动] 世界已运转\n');
console.log(`[数据目录] ${process.env.DATA_DIR || '(默认) ./data'}`);
console.log('  数据库: echoworld.db (SQLite WAL模式)');
console.log('  提示: 设置 DATA_DIR 环境变量可将数据存到代码之外，升级代码不丢数据\n');

// 定期自动保存 (每 5 分钟)
setInterval(() => {
  infiniteWorld.flushToDisk();
  world.entities.saveToDisk();
}, 5 * 60 * 1000);

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[关闭] 正在停止世界...');
  world.stop();
  // 持久化所有数据
  world.state.eventBus.flushToDisk();
  infiniteWorld.flushToDisk();
  world.entities.saveToDisk();
  closeDB();
  console.log('[关闭] 所有数据已保存');
  process.exit(0);
});

// 导出app供CloudBase使用
module.exports = app;
export default app;
