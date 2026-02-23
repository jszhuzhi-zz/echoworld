import Database from 'better-sqlite3';
import * as path from 'path';
import { DATA_DIR, ensureDataDir } from './dataDir';

const DB_FILE = path.join(DATA_DIR, 'echoworld.db');

let _db: Database.Database | null = null;

/** 获取 / 初始化 SQLite 数据库单例 */
export function getDB(): Database.Database {
  if (_db) return _db;

  ensureDataDir();
  _db = new Database(DB_FILE);

  // 性能优化
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('cache_size = -8000'); // 8MB
  _db.pragma('busy_timeout = 5000');

  initTables(_db);

  console.log(`[DB] SQLite 已打开: ${DB_FILE}`);
  return _db;
}

/** 关闭数据库 (优雅关闭时调用) */
export function closeDB(): void {
  if (_db) {
    _db.close();
    _db = null;
    console.log('[DB] SQLite 已关闭');
  }
}

function initTables(db: Database.Database): void {
  db.exec(`
    -- 玩家地图状态
    CREATE TABLE IF NOT EXISTS players (
      entityId    TEXT PRIMARY KEY,
      nodeId      INTEGER NOT NULL DEFAULT 0,
      hunger      REAL    NOT NULL DEFAULT 100,
      energy      REAL    NOT NULL DEFAULT 100,
      happiness   REAL    NOT NULL DEFAULT 100,
      alive       INTEGER NOT NULL DEFAULT 1,
      actionsToday INTEGER NOT NULL DEFAULT 0,
      maxActions  INTEGER NOT NULL DEFAULT 20,
      pendingRoll INTEGER,
      turnsPlayed INTEGER NOT NULL DEFAULT 0,
      referralCount INTEGER NOT NULL DEFAULT 0
    );

    -- 实体经济状态
    CREATE TABLE IF NOT EXISTS entities (
      id             TEXT PRIMARY KEY,
      currency       REAL    NOT NULL DEFAULT 0,
      creditScore    REAL    NOT NULL DEFAULT 500,
      reputation     REAL    NOT NULL DEFAULT 50,
      survivalDays   INTEGER NOT NULL DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'active',
      ownedBuildings TEXT    NOT NULL DEFAULT '[]',
      inventory      TEXT    NOT NULL DEFAULT '{}',
      dailyIncome    REAL    NOT NULL DEFAULT 0,
      dailyExpense   REAL    NOT NULL DEFAULT 0
    );

    -- 建筑 (按坐标索引，重启后按坐标恢复到节点)
    CREATE TABLE IF NOT EXISTS buildings (
      nodeId            INTEGER NOT NULL,
      x                 INTEGER NOT NULL,
      y                 INTEGER NOT NULL,
      templateType      TEXT    NOT NULL,
      ownerId           TEXT    NOT NULL,
      ownerName         TEXT    NOT NULL,
      name              TEXT    NOT NULL,
      level             INTEGER NOT NULL DEFAULT 1,
      usageCount        INTEGER NOT NULL DEFAULT 0,
      referralCredits   INTEGER NOT NULL DEFAULT 0,
      listingPrice      REAL,
      customDepositRate REAL,
      customLoanRate    REAL,
      loanPool          REAL,
      totalDeposits     REAL,
      totalLoansOut     REAL,
      PRIMARY KEY (x, y)
    );

    -- 交易报价
    CREATE TABLE IF NOT EXISTS trade_offers (
      id           TEXT PRIMARY KEY,
      nodeId       INTEGER NOT NULL,
      buildingName TEXT    NOT NULL,
      buyerId      TEXT    NOT NULL,
      buyerName    TEXT    NOT NULL,
      sellerId     TEXT    NOT NULL,
      sellerName   TEXT    NOT NULL,
      price        REAL    NOT NULL,
      tax          REAL    NOT NULL,
      netPrice     REAL    NOT NULL,
      createdAt    REAL    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending'
    );

    -- 银行存款
    CREATE TABLE IF NOT EXISTS player_deposits (
      id                  TEXT PRIMARY KEY,
      entityId            TEXT    NOT NULL,
      nodeId              INTEGER NOT NULL,
      amount              REAL    NOT NULL,
      interestRate        REAL    NOT NULL,
      accumulatedInterest REAL    NOT NULL DEFAULT 0,
      createdDay          INTEGER NOT NULL DEFAULT 0
    );

    -- 银行贷款
    CREATE TABLE IF NOT EXISTS player_loans (
      id               TEXT PRIMARY KEY,
      entityId         TEXT    NOT NULL,
      nodeId           INTEGER NOT NULL,
      principal        REAL    NOT NULL,
      remainingBalance REAL    NOT NULL,
      interestRate     REAL    NOT NULL,
      createdDay       INTEGER NOT NULL DEFAULT 0,
      status           TEXT    NOT NULL DEFAULT 'active'
    );

    -- 世界元数据 (键值对)
    CREATE TABLE IF NOT EXISTS world_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_buildings_owner   ON buildings(ownerId);
    CREATE INDEX IF NOT EXISTS idx_trade_status      ON trade_offers(status);
    CREATE INDEX IF NOT EXISTS idx_deposits_entity   ON player_deposits(entityId);
    CREATE INDEX IF NOT EXISTS idx_loans_entity      ON player_loans(entityId);
  `);
}
