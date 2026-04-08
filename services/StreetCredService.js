'use strict';

const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { getPool } = require('../utils/database');
const streetCredConfig = require('../config/streetCredConfig.json');
const { CHANNELS, HELPER_ROLES } = require('../config/constants');

const TIERS = [100, 90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 1];
const THRESHOLDS = streetCredConfig.thresholds;
const ROLE_MAP = streetCredConfig.roles; // tier -> roleId
const DORMANCY_DAYS = streetCredConfig.dormancyDays;
const TENURE_DIVISOR = streetCredConfig.formula.tenureDivisor;
const BASE_MULTIPLIER = streetCredConfig.formula.baseMultiplier;

// ─── Pure calculation helpers ─────────────────────────────────────────────────

/**
 * Returns how many complete months have elapsed since joinedAt.
 * @param {Date} joinedAt
 * @returns {number}
 */
function tenureMonths(joinedAt) {
  const now = new Date();
  const years  = now.getFullYear()  - joinedAt.getFullYear();
  const months = now.getMonth()     - joinedAt.getMonth();
  return Math.max(0, years * 12 + months);
}

/**
 * Tenure multiplier: 1.0 + (tenureMonths / tenureDivisor)
 * @param {number} months
 * @returns {number}
 */
function tenureMultiplier(months) {
  return BASE_MULTIPLIER + (months / TENURE_DIVISOR);
}

/**
 * Effective score = messageCount * tenureMultiplier
 * @param {number} messageCount
 * @param {number} months
 * @returns {number}
 */
function effectiveScore(messageCount, months) {
  return messageCount * tenureMultiplier(months);
}

/**
 * Map an effective score to the highest matching Street Creed tier.
 * Returns 0 for lurkers with no messages (below SC-1 threshold).
 * @param {number} score
 * @returns {number}
 */
function getTier(score) {
  for (const tier of TIERS) {
    if (score >= Number(THRESHOLDS[tier])) return tier;
  }
  return 0;
}

// ─── Role management ──────────────────────────────────────────────────────────

/**
 * Returns all Street Creed role IDs from config as a Set.
 */
function allStreetCredRoleIds() {
  return new Set(Object.values(ROLE_MAP));
}

/**
 * Remove every Street Creed role from a guild member, then assign the one
 * correct role (if tier >= 1). Handles the duplicate-cleanup requirement.
 * @param {GuildMember} member
 * @param {number} tier  — 0 means "no role" (lurker/unranked)
 */
async function applyTierRole(member, tier) {
  try {
    const scRoleIds = allStreetCredRoleIds();

    // Strip all Street Creed roles the member currently holds
    const toRemove = member.roles.cache.filter(r => scRoleIds.has(r.id));
    if (toRemove.size > 0) {
      await member.roles.remove([...toRemove.keys()], 'Street Creed tier update');
    }

    // Assign the correct tier role (none for tier 0 — lurker/unranked)
    if (tier >= 1) {
      const roleId = ROLE_MAP[String(tier)];
      if (roleId && !roleId.startsWith('PLACEHOLDER')) {
        await member.roles.add(roleId, `Street Creed tier ${tier}`);
      }
    }
  } catch (err) {
    logger.error(`[STREET_CRED] applyTierRole failed for ${member.id}: ${err.message}`);
  }
}

/**
 * Remove all Street Creed roles from a member (used for dormancy / mass strip).
 * @param {GuildMember} member
 */
async function removeAllStreetCredRoles(member) {
  try {
    const scRoleIds = allStreetCredRoleIds();
    const toRemove = member.roles.cache.filter(r => scRoleIds.has(r.id));
    if (toRemove.size > 0) {
      await member.roles.remove([...toRemove.keys()], 'Street Creed role strip');
    }
  } catch (err) {
    logger.error(`[STREET_CRED] removeAllStreetCredRoles failed for ${member.id}: ${err.message}`);
  }
}

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Fetch (or create) a member's street_cred row.
 * @returns {Object}
 */
async function getOrCreateRecord(userId, guildId, joinedAt) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM street_cred WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  if (rows.length > 0) return rows[0];

  await pool.execute(
    `INSERT IGNORE INTO street_cred (user_id, guild_id, joined_at) VALUES (?, ?, ?)`,
    [userId, guildId, joinedAt ? new Date(joinedAt) : null]
  );
  const [newRows] = await pool.execute(
    'SELECT * FROM street_cred WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  return newRows[0];
}

/**
 * Recalculate and persist effective_score + tier for a record using current
 * joined_at. Optionally bumps message count.
 * @param {string} userId
 * @param {string} guildId
 * @param {Object} opts
 * @param {number}  [opts.incrementMessages=0]
 * @param {Date}    [opts.lastMessageAt]
 * @param {Date}    [opts.joinedAt]        — only used for INSERT
 * @returns {{tier: number, score: number, messages: number, changed: boolean}}
 */
async function recalculate(userId, guildId, opts = {}) {
  const { incrementMessages = 0, lastMessageAt, joinedAt } = opts;
  const pool = await getPool();

  // Fetch current record
  const rec = await getOrCreateRecord(userId, guildId, joinedAt);

  const newMessages = rec.messages + incrementMessages;
  const recJoinedAt = rec.joined_at ? new Date(rec.joined_at) : (joinedAt ? new Date(joinedAt) : new Date());
  const months   = tenureMonths(recJoinedAt);
  const score    = effectiveScore(newMessages, months);
  const newTier  = getTier(score);
  const changed  = newTier !== rec.tier;

  const now = new Date();
  const newStatus = lastMessageAt ? 'ACTIVE' : rec.status;

  await pool.execute(
    `UPDATE street_cred
        SET messages = ?,
            effective_score = ?,
            tier = ?,
            status = ?,
            last_message_at = COALESCE(?, last_message_at),
            joined_at = COALESCE(joined_at, ?)
      WHERE user_id = ? AND guild_id = ?`,
    [
      newMessages,
      score,
      newTier,
      newStatus,
      lastMessageAt ? new Date(lastMessageAt) : null,
      joinedAt ? new Date(joinedAt) : null,
      userId,
      guildId,
    ]
  );

  return { tier: newTier, score, messages: newMessages, changed, prevTier: rec.tier };
}

// ─── Forward-tracking (called from messageCreate) ─────────────────────────────

/**
 * Lightweight, fire-and-forget Street Creed update triggered by every
 * non-bot guild message.
 * @param {Message} message  — discord.js Message object
 */
async function trackMessage(message) {
  try {
    const { author, guild, member } = message;
    if (!guild || !member) return null;

    const userId  = author.id;
    const guildId = guild.id;
    const joinedAt = member.joinedAt;

    const result = await recalculate(userId, guildId, {
      incrementMessages: 1,
      lastMessageAt: new Date(),
      joinedAt,
    });

    if (result.changed || result.prevTier === 0) {
      // Re-fetch the member in case the cache is stale
      const freshMember = await guild.members.fetch(userId).catch(() => member);
      await applyTierRole(freshMember, result.tier);

      if (result.changed && result.tier > result.prevTier && result.prevTier !== 0) {
        logger.info(
          `[STREET_CRED] ${author.tag} levelled up: SC-${result.prevTier} → SC-${result.tier} ` +
          `(score: ${result.score.toFixed(0)}, messages: ${result.messages})`
        );
      }
    }

    // If member was DORMANT, reactivate
    const pool = await getPool();
    const [rows] = await pool.execute(
      'SELECT status FROM street_cred WHERE user_id = ? AND guild_id = ?',
      [userId, guildId]
    );
    if (rows.length > 0 && rows[0].status === 'DORMANT') {
      await pool.execute(
        'UPDATE street_cred SET status = ? WHERE user_id = ? AND guild_id = ?',
        ['ACTIVE', userId, guildId]
      );
      const freshMember = await guild.members.fetch(userId).catch(() => member);
      await applyTierRole(freshMember, result.tier);
      logger.info(`[STREET_CRED] ${author.tag} reactivated from DORMANT`);
    }

    return result;
  } catch (err) {
    logger.error(`[STREET_CRED] trackMessage error: ${err.message}`);
    return null;
  }
}

// ─── Dormancy check (called from daily cron) ──────────────────────────────────

/**
 * Set ACTIVE members whose last_message_at is older than dormancyDays to
 * DORMANT and remove their Street Creed roles.
 * @param {Guild} guild
 */
async function runDormancyCheck(guild) {
  try {
    const pool = await getPool();
    const cutoff = new Date(Date.now() - DORMANCY_DAYS * 24 * 60 * 60 * 1000);

    const [rows] = await pool.execute(
      `SELECT user_id FROM street_cred
        WHERE guild_id = ? AND status = 'ACTIVE' AND last_message_at < ?`,
      [guild.id, cutoff]
    );

    if (rows.length === 0) {
      logger.info('[STREET_CRED] Dormancy check: no members to set dormant');
      return;
    }

    let dormantCount = 0;
    for (const row of rows) {
      try {
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) await removeAllStreetCredRoles(member);

        await pool.execute(
          `UPDATE street_cred SET status = 'DORMANT' WHERE user_id = ? AND guild_id = ?`,
          [row.user_id, guild.id]
        );
        dormantCount++;

        // Check if the dormant member holds any helper roles and alert #admin-chat
        if (member) {
          const matchedRoles = Object.entries(HELPER_ROLES)
            .filter(([, roleId]) => member.roles.cache.has(roleId))
            .map(([roleName]) => roleName);

          if (matchedRoles.length > 0) {
            try {
              const adminChannel = guild.channels.cache.get(CHANNELS.ADMIN_CHAT)
                ?? await guild.client.channels.fetch(CHANNELS.ADMIN_CHAT).catch(() => null);

              if (adminChannel) {
                const embed = new EmbedBuilder()
                  .setColor(0xe74c3c)
                  .setTitle('⚠️ Dormant Helper Alert')
                  .setDescription(
                    `<@${row.user_id}> has been marked as **DORMANT** and holds the following helper role(s): **${matchedRoles.join(', ')}**.\n\n` +
                    `They have not sent a message in over ${DORMANCY_DAYS} days. Consider reviewing their helper role assignment.`
                  )
                  .setFooter({ text: 'Street Cred Dormancy System' })
                  .setTimestamp();

                await adminChannel.send({ embeds: [embed] });
                logger.info(`[STREET_CRED] Dormant helper alert sent for ${row.user_id} (roles: ${matchedRoles.join(', ')})`);
              } else {
                logger.warn('[STREET_CRED] Dormant helper alert: admin-chat channel not found');
              }
            } catch (alertErr) {
              logger.warn(`[STREET_CRED] Dormant helper alert failed for ${row.user_id}: ${alertErr.message}`);
            }
          }
        }
      } catch (err) {
        logger.warn(`[STREET_CRED] Dormancy: failed for ${row.user_id}: ${err.message}`);
      }
    }

    logger.info(`[STREET_CRED] Dormancy check complete: ${dormantCount} members set to DORMANT`);
  } catch (err) {
    logger.error(`[STREET_CRED] runDormancyCheck error: ${err.message}`);
  }
}

// ─── Admin: retroactive scan ──────────────────────────────────────────────────

/**
 * Phase 1: Strip all Street Creed roles from all guild members.
 * @param {Guild} guild
 * @param {Function} onProgress  — called with (stripped, total)
 */
async function stripAllRoles(guild, onProgress) {
  const scRoleIds = allStreetCredRoleIds();
  const members = await guild.members.fetch();
  const withRoles = members.filter(m => m.roles.cache.some(r => scRoleIds.has(r.id)));
  const total = withRoles.size;
  let stripped = 0;

  for (const [, member] of withRoles) {
    await removeAllStreetCredRoles(member);
    stripped++;
    if (onProgress) onProgress(stripped, total);
  }
  return { stripped, total };
}

/**
 * Phase 2–4: Scan all readable text channels, count messages per user, then
 * recalculate tiers and apply roles. Crash-safe via street_cred_scan table.
 * @param {Guild}    guild
 * @param {Function} onChannelProgress  — called with (channelsDone, channelTotal, messagesRead)
 * @param {Function} onAssignProgress   — called with (assigned, total)
 */
async function runRetroactiveScan(guild, onChannelProgress, onAssignProgress) {
  const pool = await getPool();

  // Gather text channels
  const channels = guild.channels.cache.filter(c =>
    c.isTextBased() && !c.isThread() && c.viewable
  );
  const channelList = [...channels.values()];
  const total = channelList.length;

  // Seed the scan table with any not-yet-seen channels
  for (const ch of channelList) {
    await pool.execute(
      `INSERT IGNORE INTO street_cred_scan (guild_id, channel_id) VALUES (?, ?)`,
      [guild.id, ch.id]
    );
  }

  // Map userId -> { messages, lastMessageAt }
  const counts = new Map();
  let channelsDone = 0;
  let totalMessages = 0;

  for (const ch of channelList) {
    // Skip already-completed channels
    const [scanRows] = await pool.execute(
      'SELECT completed FROM street_cred_scan WHERE guild_id = ? AND channel_id = ?',
      [guild.id, ch.id]
    );
    if (scanRows.length > 0 && scanRows[0].completed) {
      channelsDone++;
      if (onChannelProgress) onChannelProgress(channelsDone, total, totalMessages);
      continue;
    }

    let lastId = null;
    let channelMessages = 0;

    try {
      while (true) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const batch = await ch.messages.fetch(fetchOptions);
        if (batch.size === 0) break;

        for (const [, msg] of batch) {
          if (msg.author.bot) continue;
          const entry = counts.get(msg.author.id) || { messages: 0, lastMessageAt: null };
          entry.messages++;
          if (!entry.lastMessageAt || msg.createdAt > entry.lastMessageAt) {
            entry.lastMessageAt = msg.createdAt;
          }
          counts.set(msg.author.id, entry);
          channelMessages++;
        }

        lastId = batch.last().id;

        // Persist partial progress every 1,000 messages
        if (channelMessages % 1000 === 0) {
          await pool.execute(
            'UPDATE street_cred_scan SET messages_read = ? WHERE guild_id = ? AND channel_id = ?',
            [channelMessages, guild.id, ch.id]
          );
        }

        if (batch.size < 100) break;
      }
    } catch (err) {
      logger.warn(`[STREET_CRED] Scan: error reading channel ${ch.id}: ${err.message}`);
    }

    totalMessages += channelMessages;
    await pool.execute(
      'UPDATE street_cred_scan SET completed = 1, messages_read = ? WHERE guild_id = ? AND channel_id = ?',
      [channelMessages, guild.id, ch.id]
    );

    channelsDone++;
    if (onChannelProgress) onChannelProgress(channelsDone, total, totalMessages);
  }

  // Phase 3: Calculate and persist tiers
  for (const [userId, data] of counts) {
    try {
      let member = null;
      try {
        member = await guild.members.fetch(userId);
      } catch (_) { /* user left */ }

      const joinedAt = member ? member.joinedAt : null;
      await pool.execute(
        `INSERT INTO street_cred (user_id, guild_id, messages, effective_score, tier, status, last_message_at, joined_at)
         VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?)
         ON DUPLICATE KEY UPDATE
           messages = VALUES(messages),
           effective_score = VALUES(effective_score),
           tier = VALUES(tier),
           last_message_at = VALUES(last_message_at),
           joined_at = COALESCE(joined_at, VALUES(joined_at))`,
        [
          userId,
          guild.id,
          data.messages,
          0, // will be recalculated below
          0,
          data.lastMessageAt ? new Date(data.lastMessageAt) : null,
          joinedAt ? new Date(joinedAt) : null,
        ]
      );
    } catch (err) {
      logger.warn(`[STREET_CRED] Scan: DB insert failed for ${userId}: ${err.message}`);
    }
  }

  // Recalculate effective scores & tiers from DB data
  const [allRecords] = await pool.execute(
    'SELECT user_id, messages, joined_at FROM street_cred WHERE guild_id = ?',
    [guild.id]
  );
  for (const rec of allRecords) {
    const ja = rec.joined_at ? new Date(rec.joined_at) : new Date();
    const months = tenureMonths(ja);
    const score  = effectiveScore(rec.messages, months);
    const tier   = getTier(score);
    await pool.execute(
      'UPDATE street_cred SET effective_score = ?, tier = ? WHERE user_id = ? AND guild_id = ?',
      [score, tier, rec.user_id, guild.id]
    );
  }

  // Phase 4: Assign roles
  const cutoff = new Date(Date.now() - DORMANCY_DAYS * 24 * 60 * 60 * 1000);
  const [activeCandidates] = await pool.execute(
    `SELECT user_id, tier, last_message_at FROM street_cred WHERE guild_id = ? AND messages > 0`,
    [guild.id]
  );

  let assigned = 0;
  const assignTotal = activeCandidates.length;
  for (const rec of activeCandidates) {
    try {
      const member = await guild.members.fetch(rec.user_id).catch(() => null);
      if (!member) continue;

      const isActive = rec.last_message_at && new Date(rec.last_message_at) >= cutoff;
      if (isActive) {
        await applyTierRole(member, rec.tier);
        await pool.execute(
          `UPDATE street_cred SET status = 'ACTIVE' WHERE user_id = ? AND guild_id = ?`,
          [rec.user_id, guild.id]
        );
      } else {
        await pool.execute(
          `UPDATE street_cred SET status = 'DORMANT' WHERE user_id = ? AND guild_id = ?`,
          [rec.user_id, guild.id]
        );
      }
      assigned++;
      if (onAssignProgress) onAssignProgress(assigned, assignTotal);
    } catch (err) {
      logger.warn(`[STREET_CRED] Scan: assign failed for ${rec.user_id}: ${err.message}`);
    }
  }

  return { channelsDone, totalMessages, totalUsers: counts.size, assigned };
}

// ─── Admin: manual override ───────────────────────────────────────────────────

/**
 * Override a member's message count and recalculate.
 * @param {string} userId
 * @param {string} guildId
 * @param {number} messageCount
 * @param {Date}   joinedAt
 * @returns {{tier, score, messages}}
 */
async function adminSync(userId, guildId, messageCount, joinedAt) {
  const pool = await getPool();
  const months = tenureMonths(joinedAt ? new Date(joinedAt) : new Date());
  const score  = effectiveScore(messageCount, months);
  const tier   = getTier(score);

  await pool.execute(
    `INSERT INTO street_cred (user_id, guild_id, messages, effective_score, tier, joined_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       messages = VALUES(messages),
       effective_score = VALUES(effective_score),
       tier = VALUES(tier),
       joined_at = COALESCE(joined_at, VALUES(joined_at))`,
    [userId, guildId, messageCount, score, tier, joinedAt ? new Date(joinedAt) : null]
  );

  return { tier, score, messages: messageCount };
}

/**
 * Recalculate all tiers for a guild from current DB data.
 * @param {string} guildId
 * @returns {number} count of records updated
 */
async function recalculateAll(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT user_id, messages, joined_at FROM street_cred WHERE guild_id = ?',
    [guildId]
  );
  let updated = 0;
  for (const row of rows) {
    const ja = row.joined_at ? new Date(row.joined_at) : new Date();
    const months = tenureMonths(ja);
    const score  = effectiveScore(row.messages, months);
    const tier   = getTier(score);
    await pool.execute(
      'UPDATE street_cred SET effective_score = ?, tier = ? WHERE user_id = ? AND guild_id = ?',
      [score, tier, row.user_id, guildId]
    );
    updated++;
  }
  return updated;
}

// ─── Profile / leaderboard queries ───────────────────────────────────────────

/**
 * Fetch a single member's Street Creed record.
 */
async function getProfile(userId, guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM street_cred WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  return rows[0] || null;
}

/**
 * Fetch top members ordered by effective_score.
 * @param {string}  guildId
 * @param {number}  page        — 1-indexed
 * @param {number}  pageSize
 * @param {boolean} activeOnly  — if true, only ACTIVE members
 * @returns {{ rows: Array, totalCount: number }}
 */
async function getLeaderboard(guildId, page = 1, pageSize = 10, activeOnly = true) {
  const pool = await getPool();
  const offset = (page - 1) * pageSize;

  const whereClause = activeOnly ? "WHERE guild_id = ? AND status = 'ACTIVE'" : 'WHERE guild_id = ?';

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM street_cred ${whereClause}`,
    [guildId]
  );
  const totalCount = countRows[0].cnt;

  const safeLimit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));
  const safeOffset = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, parseInt(offset, 10) || 0));

  const [rows] = await pool.execute(
    `SELECT user_id, tier, effective_score, messages, status
       FROM street_cred
      ${whereClause}
      ORDER BY effective_score DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [guildId]
  );

  return { rows, totalCount };
}

/**
 * Returns all ACTIVE members for a guild, ordered by effective_score DESC.
 * Used by the "Members only" leaderboard filter to allow in-memory filtering
 * and pagination after excluding staff by Discord role.
 * @param {string} guildId
 * @returns {Array}
 */
async function getAllActive(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT user_id, tier, effective_score, messages, status
       FROM street_cred
      WHERE guild_id = ? AND status = 'ACTIVE'
      ORDER BY effective_score DESC`,
    [guildId]
  );
  return rows;
}

/**
 * Returns a member's rank (1-indexed) in the leaderboard.
 */
async function getUserRank(userId, guildId, activeOnly = true) {
  const pool = await getPool();
  const whereClause = activeOnly ? "guild_id = ? AND status = 'ACTIVE'" : 'guild_id = ?';
  const [rows] = await pool.execute(
      `SELECT COUNT(*) + 1 AS \`rank\` FROM street_cred
      WHERE ${whereClause} AND effective_score > (
        SELECT COALESCE(effective_score, 0) FROM street_cred WHERE user_id = ? AND guild_id = ?
      )`,
    [guildId, userId, guildId]
  );
  return rows[0]?.rank ?? null;
}

/**
 * Returns admin status stats for a guild.
 */
async function getStatusStats(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'ACTIVE')  AS active,
       SUM(status = 'DORMANT') AS dormant,
       SUM(status = 'NEW')     AS newMembers,
       MAX(effective_score)    AS topScore
     FROM street_cred
     WHERE guild_id = ?`,
    [guildId]
  );
  const [scanRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(completed = 1) AS completed
     FROM street_cred_scan
     WHERE guild_id = ?`,
    [guildId]
  );
  return { members: rows[0], scan: scanRows[0] };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Returns the effective score threshold for the next tier above currentTier.
 * Returns null if already at max tier.
 */
function nextTierThreshold(currentTier) {
  const idx = TIERS.indexOf(currentTier);
  if (idx === 0) return null; // already at SC-100 (max tier)
  if (idx === -1) return Number(THRESHOLDS[1]); // tier 0 (unranked) → show progress to SC-1
  return Number(THRESHOLDS[TIERS[idx - 1]]);
}

/**
 * Returns the effective score threshold for the current tier.
 */
function currentTierThreshold(tier) {
  return tier >= 1 ? Number(THRESHOLDS[tier]) : 0;
}

module.exports = {
  // Calculations
  tenureMonths,
  tenureMultiplier,
  effectiveScore,
  getTier,
  nextTierThreshold,
  currentTierThreshold,
  // Role management
  applyTierRole,
  removeAllStreetCredRoles,
  allStreetCredRoleIds,
  // DB helpers
  getOrCreateRecord,
  recalculate,
  // Forward tracking
  trackMessage,
  // Dormancy
  runDormancyCheck,
  // Admin
  stripAllRoles,
  runRetroactiveScan,
  adminSync,
  recalculateAll,
  // Queries
  getProfile,
  getLeaderboard,
  getAllActive,
  getUserRank,
  getStatusStats,
  // Config
  TIERS,
  THRESHOLDS,
  ROLE_MAP,
  DORMANCY_DAYS,
};
