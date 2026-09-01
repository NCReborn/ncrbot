'use strict';

const mysql = require('mysql2/promise');
const logger = require('./logger');

let pool = null;

/**
 * Returns the shared MySQL connection pool, creating it on first call.
 */
async function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host:     process.env.MYSQL_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQL_PORT || '3306', 10),
    user:     process.env.MYSQL_USER     || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'ncrbot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await ensureSchema(pool);

  return pool;
}

/**
 * Ensures all required tables exist and performs safe schema migrations.
 */
async function ensureSchema(p) {

  // ───────────────────────────────────────────────────────────────
  // STREET CRED TABLE
  // ───────────────────────────────────────────────────────────────
  await p.execute(`
    CREATE TABLE IF NOT EXISTS street_cred (
      user_id        VARCHAR(20)  NOT NULL,
      guild_id       VARCHAR(20)  NOT NULL,
      messages       INT          DEFAULT 0,
      effective_score DOUBLE      DEFAULT 0,
      tier           INT          DEFAULT 0,
      status         ENUM('ACTIVE','DORMANT','NEW') DEFAULT 'NEW',
      last_message_at DATETIME    NULL,
      joined_at      DATETIME     NULL,
      created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // ───────────────────────────────────────────────────────────────
  // STREET CRED SCAN TABLE
  // ───────────────────────────────────────────────────────────────
  await p.execute(`
    CREATE TABLE IF NOT EXISTS street_cred_scan (
      guild_id      VARCHAR(20)  NOT NULL,
      channel_id    VARCHAR(20)  NOT NULL,
      completed     TINYINT(1)   DEFAULT 0,
      messages_read INT          DEFAULT 0,
      updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, channel_id)
    )
  `);

  // ───────────────────────────────────────────────────────────────
  // STREET CRED CONFIG TABLES (PER-GUILD SETTINGS)
  // ───────────────────────────────────────────────────────────────
  await p.execute(`
    CREATE TABLE IF NOT EXISTS street_cred_config (
      guild_id           VARCHAR(20)  NOT NULL,
      system_name        VARCHAR(100) NOT NULL DEFAULT 'Street Creed',
      dormancy_days      INT          NOT NULL DEFAULT 120,
      tenure_divisor     DOUBLE       NOT NULL DEFAULT 10,
      base_multiplier    DOUBLE       NOT NULL DEFAULT 1.75,
      levelup_channel_id VARCHAR(20)  NULL,
      created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id)
    )
  `);

  await p.execute(`
    CREATE TABLE IF NOT EXISTS street_cred_tiers (
      guild_id    VARCHAR(20)  NOT NULL,
      tier_key    INT          NOT NULL,
      tier_name   VARCHAR(100) NOT NULL,
      threshold   DOUBLE       NOT NULL,
      role_id     VARCHAR(20)  NULL,
      created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, tier_key),
      INDEX idx_street_cred_tiers_guild_threshold (guild_id, threshold)
    )
  `);

  // ───────────────────────────────────────────────────────────────
  // MESSAGE ANALYTICS TABLE
  // ───────────────────────────────────────────────────────────────
  await p.execute(`
    CREATE TABLE IF NOT EXISTS message_analytics (
      message_id   VARCHAR(20)  NOT NULL,
      user_id      VARCHAR(20)  NOT NULL,
      guild_id     VARCHAR(20)  NOT NULL,
      channel_id   VARCHAR(20)  NOT NULL,
      created_at   DATETIME     NOT NULL,
      PRIMARY KEY (message_id)
    )
  `);

  // ───────────────────────────────────────────────────────────────
  // ANALYTICS SCAN TABLE
  // ───────────────────────────────────────────────────────────────
  await p.execute(`
    CREATE TABLE IF NOT EXISTS analytics_scan (
      guild_id      VARCHAR(20)  NOT NULL,
      channel_id    VARCHAR(20)  NOT NULL,
      completed     TINYINT(1)   DEFAULT 0,
      messages_read INT          DEFAULT 0,
      updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, channel_id)
    )
  `);

  // ───────────────────────────────────────────────────────────────
  // SNAPSMITH TABLE (BASE STRUCTURE)
  // ───────────────────────────────────────────────────────────────
  await p.execute(`
    CREATE TABLE IF NOT EXISTS snapsmith (
      user_id       VARCHAR(20)  NOT NULL,
      guild_id      VARCHAR(20)  NOT NULL,
      is_active     TINYINT(1)   DEFAULT 0,
      is_banned     TINYINT(1)   DEFAULT 0,
      granted_at    DATETIME     NULL,
      expires_at    DATETIME     NULL,
      created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id),
      INDEX idx_expires (guild_id, expires_at)
    )
  `);

  // ───────────────────────────────────────────────────────────────
  // SNAPSMITH MIGRATIONS (ADD NEW BAN FIELDS)
  // ───────────────────────────────────────────────────────────────

  const [columns] = await p.execute(`SHOW COLUMNS FROM snapsmith`);

  const colNames = columns.map(c => c.Field);

  async function addColumnIfMissing(name, definition) {
    if (!colNames.includes(name)) {
      await p.execute(`ALTER TABLE snapsmith ADD COLUMN ${name} ${definition}`);
      logger.info(`[DB] snapsmith schema updated: added column ${name}`);
    }
  }

  await addColumnIfMissing('ban_reason', 'TEXT NULL');
  await addColumnIfMissing('banned_by', 'VARCHAR(50) NULL');
  await addColumnIfMissing('banned_at', 'DATETIME NULL');

  logger.info('[DB] street_cred and snapsmith schemas verified');
}

module.exports = { getPool };
