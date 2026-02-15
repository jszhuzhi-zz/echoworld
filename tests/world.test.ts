import { World } from '../src/core/World';
import { WorldConfig, EntityType, ResourceType, BuildingType } from '../src/core/types';

const TEST_CONFIG: WorldConfig = {
  name: 'Test World',
  tickIntervalMs: 100,
  hoursPerDay: 24,
  ticksPerHour: 2,
  startingCurrency: 1000,
  dailyBasicIncome: 100,
  taxRate: 0.05,
  maxEntities: 50,
  mapWidth: 20,
  mapHeight: 20,
};

describe('EchoWorld', () => {
  let world: World;

  beforeEach(() => {
    world = new World(TEST_CONFIG);
  });

  afterEach(() => {
    world.stop();
  });

  describe('World Creation', () => {
    it('should create a world with correct config', () => {
      expect(world.state.config.name).toBe('Test World');
      expect(world.state.config.startingCurrency).toBe(1000);
    });

    it('should initialize with zero entities', () => {
      expect(world.entities.getAllEntities()).toHaveLength(0);
    });
  });

  describe('Entity Management', () => {
    it('should create an AI agent', () => {
      const agent = world.createAgent('TestBot');
      expect(agent.name).toBe('TestBot');
      expect(agent.type).toBe(EntityType.AI_AGENT);
      expect(agent.currency).toBe(1000);
    });

    it('should create a human player', () => {
      const player = world.createPlayer('Alice');
      expect(player.name).toBe('Alice');
      expect(player.type).toBe(EntityType.HUMAN_PLAYER);
    });

    it('should track multiple entities', () => {
      world.createAgent('Bot1');
      world.createAgent('Bot2');
      world.createPlayer('Player1');
      expect(world.entities.getAllEntities()).toHaveLength(3);
    });
  });

  describe('Entity Needs & Consumption', () => {
    it('should have default needs', () => {
      const agent = world.createAgent('TestBot');
      expect(agent.needs.length).toBeGreaterThan(0);
      expect(agent.needs.some(n => n.type === ResourceType.FOOD)).toBe(true);
    });

    it('should consume resources from inventory', () => {
      const agent = world.createAgent('TestBot');
      agent.addResource(ResourceType.FOOD, 10);
      agent.addResource(ResourceType.ENERGY, 10);
      agent.addResource(ResourceType.GOODS, 10);

      const result = agent.consumeDaily();
      expect(result.satisfied.length).toBeGreaterThan(0);
      expect(agent.getResource(ResourceType.FOOD)).toBeLessThan(10);
    });

    it('should report unsatisfied needs when resources are insufficient', () => {
      const agent = world.createAgent('TestBot');
      // No resources added
      const result = agent.consumeDaily();
      expect(result.unsatisfied.length).toBeGreaterThan(0);
    });
  });

  describe('Market', () => {
    it('should have initial prices for all resources', () => {
      const prices = world.market.getAllPrices();
      expect(prices[ResourceType.FOOD]).toBeGreaterThan(0);
      expect(prices[ResourceType.MATERIAL]).toBeGreaterThan(0);
      expect(prices[ResourceType.GOODS]).toBeGreaterThan(0);
    });

    it('should allow market price purchases', () => {
      const agent = world.createAgent('Buyer');
      const tx = world.market.buyAtMarketPrice(agent.id, ResourceType.FOOD, 5);
      expect(tx).not.toBeNull();
      expect(agent.getResource(ResourceType.FOOD)).toBe(5);
      expect(agent.currency).toBeLessThan(1000);
    });

    it('should reject purchases when funds are insufficient', () => {
      const agent = world.createAgent('PoorBuyer');
      agent.currency = 0;
      const tx = world.market.buyAtMarketPrice(agent.id, ResourceType.FOOD, 100);
      expect(tx).toBeNull();
    });

    it('should allow selling resources', () => {
      const agent = world.createAgent('Seller');
      agent.addResource(ResourceType.FOOD, 20);
      const initialCurrency = agent.currency;

      const tx = world.market.sellAtMarketPrice(agent.id, ResourceType.FOOD, 10);
      expect(tx).not.toBeNull();
      expect(agent.getResource(ResourceType.FOOD)).toBe(10);
      expect(agent.currency).toBeGreaterThan(initialCurrency);
    });
  });

  describe('Buildings', () => {
    it('should build a farm', () => {
      const agent = world.createAgent('Farmer');
      const farm = world.buildings.build(agent.id, BuildingType.FARM, { x: 5, y: 5 });

      expect(farm).not.toBeNull();
      expect(farm!.type).toBe(BuildingType.FARM);
      expect(agent.ownedBuildings).toContain(farm!.id);
      expect(agent.currency).toBeLessThan(1000);
    });

    it('should reject building when funds insufficient', () => {
      const agent = world.createAgent('PoorBuilder');
      agent.currency = 10;
      const building = world.buildings.build(agent.id, BuildingType.FACTORY, { x: 0, y: 0 });
      expect(building).toBeNull();
    });

    it('should upgrade a building', () => {
      const agent = world.createAgent('Upgrader');
      agent.currency = 5000;
      const farm = world.buildings.build(agent.id, BuildingType.FARM, { x: 1, y: 1 });
      expect(farm).not.toBeNull();

      const success = world.buildings.upgradeBuilding(farm!.id, agent.id);
      expect(success).toBe(true);
      expect(farm!.level).toBe(2);
    });
  });

  describe('Bank', () => {
    it('should issue a loan', () => {
      const agent = world.createAgent('Borrower');
      const loan = world.bank.requestLoan(agent, 500);
      expect(loan).not.toBeNull();
      expect(agent.currency).toBe(1500); // 1000 starting + 500 loan
    });

    it('should accept deposits', () => {
      const agent = world.createAgent('Depositor');
      const deposit = world.bank.makeDeposit(agent, 300);
      expect(deposit).not.toBeNull();
      expect(agent.currency).toBe(700);
    });
  });

  describe('Rules', () => {
    it('should have default rules', () => {
      const rules = world.rules.getAllRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return rule values', () => {
      const taxRate = world.rules.getRuleValue('tax_rate');
      expect(taxRate).toBe(0.05);
    });
  });

  describe('World Simulation', () => {
    it('should advance time with manual tick', () => {
      const timeBefore = world.state.getTime();
      world.manualTick();
      const timeAfter = world.state.getTime();
      expect(timeAfter.tick).toBe(timeBefore.tick + 1);
    });

    it('should fast forward multiple ticks', async () => {
      world.createAgent('FastBot');
      await world.fastForward(10);
      expect(world.state.getTime().tick).toBe(10);
    });

    it('should generate a full snapshot', () => {
      world.createAgent('SnapshotBot');
      const snapshot = world.getFullSnapshot();
      expect(snapshot.world).toBeDefined();
      expect(snapshot.entities).toHaveLength(1);
      expect(snapshot.market).toBeDefined();
      expect(snapshot.bank).toBeDefined();
      expect(snapshot.rules).toBeDefined();
    });
  });
});
