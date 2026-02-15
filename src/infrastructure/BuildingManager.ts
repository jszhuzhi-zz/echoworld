import {
  BuildingType,
  Position,
  WorldEventType,
  EntityStatus,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { EntityManager } from '../entities/EntityManager';
import { Building } from './Building';

/**
 * 建筑管理器 - 管理世界中所有建筑的建造、运营和升级
 * Manages construction, operation, and upgrades of all buildings
 */
export class BuildingManager {
  private buildings: Map<string, Building> = new Map();
  private worldState: WorldState;
  private entityManager: EntityManager;

  constructor(worldState: WorldState, entityManager: EntityManager) {
    this.worldState = worldState;
    this.entityManager = entityManager;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 每天执行所有建筑的生产
    this.worldState.eventBus.on(WorldEventType.DAY_START, () => {
      this.runDailyProduction();
    });

    // 每天扣除维护费用
    this.worldState.eventBus.on(WorldEventType.DAY_END, () => {
      this.collectMaintenance();
    });
  }

  /** 建造新建筑 */
  build(
    ownerId: string,
    type: BuildingType,
    position: Position,
  ): Building | null {
    const entity = this.entityManager.getEntity(ownerId);
    if (!entity || entity.status !== EntityStatus.ACTIVE) return null;

    const config = Building.getBuildingConfig(type);
    if (!entity.pay(config.buildCost)) return null;

    const building = new Building(
      type,
      ownerId,
      position,
      this.worldState.getTime(),
    );

    this.buildings.set(building.id, building);
    entity.ownedBuildings.push(building.id);

    this.worldState.eventBus.emit({
      type: WorldEventType.BUILDING_BUILT,
      data: {
        buildingId: building.id,
        buildingType: type,
        ownerId,
        position,
        cost: config.buildCost,
      },
      timestamp: this.worldState.getTime(),
    });

    return building;
  }

  /** 升级建筑 */
  upgradeBuilding(buildingId: string, requesterId: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building || building.ownerId !== requesterId) return false;

    const entity = this.entityManager.getEntity(requesterId);
    if (!entity) return false;

    const upgradeCost = building.getUpgradeCost();
    if (!entity.pay(upgradeCost)) return false;

    const result = building.upgrade();
    if (!result) return false;

    this.worldState.eventBus.emit({
      type: WorldEventType.BUILDING_UPGRADED,
      data: {
        buildingId: building.id,
        newLevel: building.level,
        ownerId: requesterId,
        cost: upgradeCost,
      },
      timestamp: this.worldState.getTime(),
    });

    return true;
  }

  /** 维修建筑 */
  repairBuilding(buildingId: string, requesterId: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building || building.ownerId !== requesterId) return false;

    const entity = this.entityManager.getEntity(requesterId);
    if (!entity) return false;

    const repairCost = building.getBuildCost() * 0.1;
    if (!entity.pay(repairCost)) return false;

    building.repair(repairCost);
    return true;
  }

  /** 每日运行所有建筑的生产 */
  private runDailyProduction(): void {
    for (const building of this.buildings.values()) {
      const entity = this.entityManager.getEntity(building.ownerId);
      if (!entity || entity.status !== EntityStatus.ACTIVE) continue;

      building.produce(entity.inventory);
    }
  }

  /** 每日收取维护费 */
  private collectMaintenance(): void {
    for (const building of this.buildings.values()) {
      const entity = this.entityManager.getEntity(building.ownerId);
      if (!entity) continue;

      const cost = building.dailyMaintenanceCost * (1 + building.level * 0.1);
      if (!entity.pay(cost)) {
        // 无法支付维护费，耐久度快速降低
        building.durability = Math.max(0, building.durability - 10);
        building.efficiency = building.durability / 100;
      }
    }

    this.worldState.updateStatistics({
      totalBuildings: this.buildings.size,
    });
  }

  /** 获取建筑 */
  getBuilding(buildingId: string): Building | undefined {
    return this.buildings.get(buildingId);
  }

  /** 获取实体拥有的所有建筑 */
  getBuildingsByOwner(ownerId: string): Building[] {
    return Array.from(this.buildings.values())
      .filter(b => b.ownerId === ownerId);
  }

  /** 获取所有建筑 */
  getAllBuildings(): Building[] {
    return Array.from(this.buildings.values());
  }

  /** 获取特定类型的建筑 */
  getBuildingsByType(type: BuildingType): Building[] {
    return Array.from(this.buildings.values())
      .filter(b => b.type === type);
  }

  /** 获取位置附近的建筑 */
  getBuildingsNear(position: Position, radius: number): Building[] {
    return Array.from(this.buildings.values())
      .filter(b => {
        const dx = b.position.x - position.x;
        const dy = b.position.y - position.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
      });
  }
}
