import { World } from './core/World';
import { WORLD_1_CONFIG, AGENT_PERSONALITIES, AGENT_NAMES } from './config/default';
import { createServer } from './api/server';

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
const app = createServer(world, port);

// 启动世界模拟
world.start();
console.log('\n[启动] 世界已运转\n');

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[关闭] 正在停止世界...');
  world.stop();
  const snapshot = world.getFullSnapshot();
  console.log('\n最终世界状态:');
  console.log(`  实体数: ${(snapshot.entities as unknown[]).length}`);
  console.log(`  排行榜:`);
  for (const entry of snapshot.leaderboard.slice(0, 10)) {
    console.log(`    ${entry.name}: 净资产 ${entry.netWorth.toFixed(0)}, 建筑 ${entry.buildings}个`);
  }
  process.exit(0);
});

// 导出app供CloudBase使用
module.exports = app;
export default app;
