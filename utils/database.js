'use strict';

const mysql = require('mysql2/promise');
const logger = require('./logger');

let pool = null;

/**
 * Returns the shared MySQL connection pool, creating it on first call.
 * The street_cred table is auto-created if it does not exist.
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
 * Auto-creates the street_cred table and scan progress table if they don't exist.
 */
async function ensureSchema(p) {
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

  logger.info('[DB] street_cred schema verified');
}

module.exports = { getPool };
