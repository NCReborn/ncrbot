'use strict';

const logger = require('../utils/logger');
const { getPool } = require('../utils/database');
const snapsmithConfig = require('../config/snapsmithConfig.json');

const ROLE_ID = snapsmithConfig.role;
const RIPPERDOC_ROLE = snapsmithConfig.ripperdocRole;
const SHOWCASE_CHANNEL = snapsmithConfig.showcaseChannel;
const GRANT_DURATION_DAYS = snapsmithConfig.grantDurationDays;

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Get or create a SnapSmith record for a user.
 * @param {string} userId
 * @param {string} guildId
 * @returns {Object} The SnapSmith record
 */
async function getOrCreateSnapSmith(userId, guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM snapsmith WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  if (rows.length > 0) return rows[0];

  await pool.execute(
    `INSERT IGNORE INTO snapsmith (user_id, guild_id) VALUES (?, ?)`,
    [userId, guildId]
  );
  const [newRows] = await pool.execute(
    'SELECT * FROM snapsmith WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  return newRows[0];
}

/**
 * Get a SnapSmith record.
 * @param {string} userId
 * @param {string} guildId
 * @returns {Object|null}
 */
async function getSnapSmith(userId, guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM snapsmith WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  return rows[0] || null;
}

/**
 * Check if a user is banned from SnapSmith role.
 * @param {string} userId
 * @param {string} guildId
 * @returns {boolean}
 */
async function isBanned(userId, guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT is_banned FROM snapsmith WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  return rows.length > 0 && rows[0].is_banned === 1;
}

/**
 * Ban a user from receiving SnapSmith role.
 * @param {string} userId
 * @param {string} guildId
 */
async function banUser(userId, guildId) {
  const pool = await getPool();
  const rec = await getOrCreateSnapSmith(userId, guildId);
  await pool.execute(
    'UPDATE snapsmith SET is_banned = 1 WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  logger.info(`[SNAPSMITH] User ${userId} banned from SnapSmith`);
}

/**
 * Unban a user from SnapSmith role.
 * @param {string} userId
 * @param {string} guildId
 */
async function unbanUser(userId, guildId) {
  const pool = await getPool();
  const rec = await getOrCreateSnapSmith(userId, guildId);
  await pool.execute(
    'UPDATE snapsmith SET is_banned = 0 WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  logger.info(`[SNAPSMITH] User ${userId} unbanned from SnapSmith`);
}

// ─── Grant and management ──────────────────────────────────────────────────────

/**
 * Grant SnapSmith role to a user with 30-day expiration.
 * @param {string} userId
 * @param {string} guildId
 * @param {GuildMember} member
 * @returns {{success: boolean, message: string}}
 */
async function grantSnapSmith(userId, guildId, member) {
  try {
    // Check if banned
    const banned = await isBanned(userId, guildId);
    if (banned) {
      return { success: false, message: '❌ This user is banned from receiving the SnapSmith role.' };
    }

    // Get or create record
    const rec = await getOrCreateSnapSmith(userId, guildId);

    // Set expiration to 30 days from now
    const expiresAt = new Date(Date.now() + GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    const pool = await getPool();
    await pool.execute(
      `UPDATE snapsmith 
       SET granted_at = ?, expires_at = ?, is_active = 1, is_banned = 0 
       WHERE user_id = ? AND guild_id = ?`,
      [now, expiresAt, userId, guildId]
    );

    // Assign role
    if (member && member.roles) {
      try {
        await member.roles.add(ROLE_ID, 'SnapSmith grant by Ripperdoc');
      } catch (err) {
        logger.error(`[SNAPSMITH] Failed to assign role to ${userId}: ${err.message}`);
        return { success: false, message: `❌ Failed to assign role: ${err.message}` };
      }
    }

    logger.info(`[SNAPSMITH] Granted to ${userId} by a Ripperdoc (expires: ${expiresAt.toISOString()})`);
    return { 
      success: true, 
      message: `✅ SnapSmith role granted to <@${userId}> for 30 days!`,
      expiresAt
    };
  } catch (err) {
    logger.error(`[SNAPSMITH] grantSnapSmith error: ${err.message}`);
    return { success: false, message: `❌ Error granting role: ${err.message}` };
  }
}

/**
 * Manually remove SnapSmith role from a user (Ripperdoc+ command).
 * @param {string} userId
 * @param {string} guildId
 * @param {GuildMember} member
 * @returns {{success: boolean, message: string}}
 */
async function removeSnapSmith(userId, guildId, member) {
  try {
    const pool = await getPool();

    // Mark as inactive
    await pool.execute(
      `UPDATE snapsmith 
       SET is_active = 0, expires_at = NULL 
       WHERE user_id = ? AND guild_id = ?`,
      [userId, guildId]
    );

    // Remove role
    if (member && member.roles) {
      try {
        await member.roles.remove(ROLE_ID, 'SnapSmith removed by Ripperdoc');
      } catch (err) {
        logger.error(`[SNAPSMITH] Failed to remove role from ${userId}: ${err.message}`);
      }
    }

    logger.info(`[SNAPSMITH] Removed from ${userId} by a Ripperdoc`);
    return { 
      success: true, 
      message: `✅ SnapSmith role removed from <@${userId}>` 
    };
  } catch (err) {
    logger.error(`[SNAPSMITH] removeSnapSmith error: ${err.message}`);
    return { success: false, message: `❌ Error removing role: ${err.message}` };
  }
}

// ─── Timer refresh (triggered on showcase submissions) ──────────────────────────

/**
 * Refresh the SnapSmith timer when a user posts in the showcase channel.
 * Extends expiration by another 30 days.
 * @param {string} userId
 * @param {string} guildId
 * @returns {boolean} Whether the timer was refreshed
 */
async function refreshSnapSmithTimer(userId, guildId) {
  try {
    const rec = await getSnapSmith(userId, guildId);

    // Only refresh if user has active SnapSmith
    if (!rec || rec.is_active !== 1) {
      return false;
    }

    const expiresAt = new Date(Date.now() + GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const pool = await getPool();

    await pool.execute(
      `UPDATE snapsmith 
       SET expires_at = ? 
       WHERE user_id = ? AND guild_id = ?`,
      [expiresAt, userId, guildId]
    );

    logger.info(`[SNAPSMITH] Timer refreshed for ${userId} (new expiration: ${expiresAt.toISOString()})`);
    return true;
  } catch (err) {
    logger.error(`[SNAPSMITH] refreshSnapSmithTimer error: ${err.message}`);
    return false;
  }
}

// ─── Expiration check (called from daily cron) ──────────────────────────────────

/**
 * Check for expired SnapSmith roles and remove them.
 * Called periodically (e.g., daily) from cron job.
 * @param {Guild} guild
 */
async function runExpirationCheck(guild) {
  try {
    const pool = await getPool();
    const now = new Date();

    // Find all expired active SnapSmith records
    const [rows] = await pool.execute(
      `SELECT user_id FROM snapsmith 
       WHERE guild_id = ? AND is_active = 1 AND expires_at IS NOT NULL AND expires_at < ?`,
      [guild.id, now]
    );

    if (rows.length === 0) {
      logger.info('[SNAPSMITH] Expiration check: no expired entries');
      return;
    }

    let expiredCount = 0;
    for (const row of rows) {
      try {
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          await member.roles.remove(ROLE_ID, 'SnapSmith expired');
        }

        await pool.execute(
          `UPDATE snapsmith SET is_active = 0, expires_at = NULL 
           WHERE user_id = ? AND guild_id = ?`,
          [row.user_id, guild.id]
        );

        expiredCount++;
        logger.info(`[SNAPSMITH] Expired role removed from ${row.user_id}`);
      } catch (err) {
        logger.warn(`[SNAPSMITH] Expiration: failed for ${row.user_id}: ${err.message}`);
      }
    }

    logger.info(`[SNAPSMITH] Expiration check complete: ${expiredCount} roles removed`);
  } catch (err) {
    logger.error(`[SNAPSMITH] runExpirationCheck error: ${err.message}`);
  }
}

// ─── Retroactive initialization ────────────────────────────────────────────────

/**
 * Initialize SnapSmith system for all current users with the role.
 * Sets their expiration to 30 days from now.
 * @param {Guild} guild
 */
async function initializeCurrentSnapSmiths(guild) {
  try {
    const role = guild.roles.cache.get(ROLE_ID);
    if (!role) {
      logger.error('[SNAPSMITH] SnapSmith role not found in guild');
      return { success: false, message: 'SnapSmith role not found' };
    }

    const members = await guild.members.fetch();
    const snapSmiths = members.filter(m => m.roles.cache.has(ROLE_ID));
    const expiresAt = new Date(Date.now() + GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const pool = await getPool();

    let initialized = 0;
    for (const [, member] of snapSmiths) {
      try {
        await getOrCreateSnapSmith(member.id, guild.id);
        await pool.execute(
          `UPDATE snapsmith 
           SET is_active = 1, granted_at = ?, expires_at = ? 
           WHERE user_id = ? AND guild_id = ?`,
          [now, expiresAt, member.id, guild.id]
        );
        initialized++;
      } catch (err) {
        logger.warn(`[SNAPSMITH] Init failed for ${member.id}: ${err.message}`);
      }
    }

    logger.info(`[SNAPSMITH] Initialized ${initialized} current SnapSmiths`);
    return { success: true, initialized };
  } catch (err) {
    logger.error(`[SNAPSMITH] initializeCurrentSnapSmiths error: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// ─── Utility functions ─────────────────────────────────────────────────────────

/**
 * Calculate remaining days for a user's SnapSmith role.
 * @param {Date} expiresAt
 * @returns {number} Days remaining (0 if expired)
 */
function daysRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const remaining = new Date(expiresAt) - new Date();
  const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/**
 * Format remaining time for display.
 * @param {Date} expiresAt
 * @returns {string}
 */
function formatTimeRemaining(expiresAt) {
  if (!expiresAt) return 'Not set';
  const days = daysRemaining(expiresAt);
  if (days === 0) return 'Expired';
  if (days === 1) return '1 day';
  return `${days} days`;
}

module.exports = {
  // Queries
  getSnapSmith,
  getOrCreateSnapSmith,
  isBanned,
  // Management
  grantSnapSmith,
  removeSnapSmith,
  banUser,
  unbanUser,
  refreshSnapSmithTimer,
  // Maintenance
  runExpirationCheck,
  initializeCurrentSnapSmiths,
  // Utilities
  daysRemaining,
  formatTimeRemaining,
  // Config
  ROLE_ID,
  RIPPERDOC_ROLE,
  SHOWCASE_CHANNEL,
  GRANT_DURATION_DAYS,
};
