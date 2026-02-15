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

async function main() {
  console.log('========================================');
  console.log('  EchoWorld - AI智能体商业世界 v0.1.0');
  console.log('  1号世界: 商业规则世界');
  console.log('========================================\n');

  // 1. 创建世界
  const world = new World(WORLD_1_CONFIG);

  // 2. 创建初始AI智能体
  const personalityKeys = Object.keys(AGENT_PERSONALITIES) as Array<keyof typeof AGENT_PERSONALITIES>;
  const initialAgentCount = 5;

  console.log(`[初始化] 创建 ${initialAgentCount} 个AI智能体...\n`);

  for (let i = 0; i < initialAgentCount; i++) {
    const name = AGENT_NAMES[i];
    const personalityKey = personalityKeys[i % personalityKeys.length];
    const personality = AGENT_PERSONALITIES[personalityKey];

    world.createAgent(name, personality);
    console.log(`  - ${name} (${personalityKey}性格)`);
  }

  // 3. 监听世界事件
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

  // 4. 启动API服务器
  const port = parseInt(process.env.PORT || '3000');
  createServer(world, port);

  // 5. 启动世界
  console.log('\n[启动] 世界即将运转...\n');
  world.start();

  // 6. 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n[关闭] 正在停止世界...');
    world.stop();
    const snapshot = world.getFullSnapshot();
    console.log('\n最终世界状态:');
    console.log(`  实体数: ${(snapshot.entities as unknown[]).length}`);
    console.log(`  排行榜:`);
    for (const entry of snapshot.leaderboard.slice(0, 5)) {
      console.log(`    ${entry.name}: 净资产 ${entry.netWorth.toFixed(0)}, 建筑 ${entry.buildings}个`);
    }
    process.exit(0);
  });
}

main().catch(console.error);
