'use strict';

const logger = require('../utils/logger');
const { getPool } = require('../utils/database');

/**
 * Lightweight message scan — loops through all text channels and stores
 * individual message metadata (id, user, channel, timestamp) for analytics.
 * No role operations, no tier calculations.
 *
 * @param {Guild}    guild
 * @param {Function} onProgress — called with (channelsDone, channelTotal, messagesRead)
 */
async function runMessageScan(guild, onProgress) {
  const pool = await getPool();

  const channels = guild.channels.cache.filter(c =>
    c.isTextBased() && !c.isThread() && c.viewable
  );
  const channelList = [...channels.values()];
  const total = channelList.length;

  // Seed the analytics_scan table with any not-yet-seen channels
  for (const ch of channelList) {
    await pool.execute(
      `INSERT IGNORE INTO analytics_scan (guild_id, channel_id) VALUES (?, ?)`,
      [guild.id, ch.id]
    );
  }

  let channelsDone = 0;
  let totalMessages = 0;

  for (const ch of channelList) {
    // Skip already-completed channels
    const [scanRows] = await pool.execute(
      'SELECT completed FROM analytics_scan WHERE guild_id = ? AND channel_id = ?',
      [guild.id, ch.id]
    );
    if (scanRows.length > 0 && scanRows[0].completed) {
      channelsDone++;
      if (onProgress) onProgress(channelsDone, total, totalMessages);
      continue;
    }

    let lastId = null;
    let channelMessages = 0;

    logger.info(`[ANALYTICS] Scanning channel ${ch.name} (${ch.id})...`);

    try {
      while (true) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const batch = await ch.messages.fetch(fetchOptions);
        if (batch.size === 0) break;

        // Collect rows from this batch
        const rows = [];
        for (const [, msg] of batch) {
          if (msg.author.bot) continue;
          rows.push([msg.id, msg.author.id, guild.id, ch.id, new Date(msg.createdAt)]);
        }

        // Batch insert all rows at once
        if (rows.length > 0) {
          const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(', ');
          const flatValues = rows.flat();
          await pool.execute(
            `INSERT IGNORE INTO message_analytics (message_id, user_id, guild_id, channel_id, created_at) VALUES ${placeholders}`,
            flatValues
          );
          channelMessages += rows.length;
        }

        lastId = batch.last().id;

        // Persist partial progress every 1,000 messages
        if (channelMessages % 1000 === 0) {
          await pool.execute(
            'UPDATE analytics_scan SET messages_read = ? WHERE guild_id = ? AND channel_id = ?',
            [channelMessages, guild.id, ch.id]
          );
        }

        if (batch.size < 100) break;
      }
    } catch (err) {
      logger.warn(`[ANALYTICS] Scan: error reading channel ${ch.id}: ${err.message}`);
    }

    totalMessages += channelMessages;
    await pool.execute(
      'UPDATE analytics_scan SET completed = 1, messages_read = ? WHERE guild_id = ? AND channel_id = ?',
      [channelMessages, guild.id, ch.id]
    );

    channelsDone++;
    if (onProgress) onProgress(channelsDone, total, totalMessages);
  }

  return { channelsDone, totalMessages };
}

/**
 * Reset analytics scan progress for a guild (allows full rescan).
 * Also clears the message_analytics table for the guild.
 *
 * @param {string} guildId
 */
async function resetScan(guildId) {
  const pool = await getPool();
  await pool.execute(
    'UPDATE analytics_scan SET completed = 0, messages_read = 0 WHERE guild_id = ?',
    [guildId]
  );
  await pool.execute(
    'DELETE FROM message_analytics WHERE guild_id = ?',
    [guildId]
  );
}

/**
 * Get members joined per month for a given year.
 *
 * @param {string} guildId
 * @param {number} year
 * @returns {Array<{month: string, count: number}>}
 */
async function getMembersJoinedByMonth(guildId, year) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(joined_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM street_cred
      WHERE guild_id = ? AND YEAR(joined_at) = ?
      GROUP BY month
      ORDER BY month`,
    [guildId, year]
  );
  return rows;
}

/**
 * Get total members joined year-to-date (current year).
 *
 * @param {string} guildId
 * @returns {number}
 */
async function getMembersJoinedYTD(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM street_cred
      WHERE guild_id = ? AND YEAR(joined_at) = YEAR(CURDATE())`,
    [guildId]
  );
  return rows[0]?.count ?? 0;
}

/**
 * Get messages per month for a given year.
 *
 * @param {string} guildId
 * @param {number} year
 * @returns {Array<{month: string, count: number}>}
 */
async function getMessagesByMonth(guildId, year) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM message_analytics
      WHERE guild_id = ? AND YEAR(created_at) = ?
      GROUP BY month
      ORDER BY month`,
    [guildId, year]
  );
  return rows;
}

/**
 * Get total messages year-to-date (current year).
 *
 * @param {string} guildId
 * @returns {number}
 */
async function getMessagesYTD(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM message_analytics
      WHERE guild_id = ? AND YEAR(created_at) = YEAR(CURDATE())`,
    [guildId]
  );
  return rows[0]?.count ?? 0;
}

/**
 * Get average monthly messages across all recorded months.
 *
 * @param {string} guildId
 * @returns {number}
 */
async function getAverageMonthlyMessages(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT DATE_FORMAT(created_at, '%Y-%m')) AS months
       FROM message_analytics
      WHERE guild_id = ?`,
    [guildId]
  );
  const { total, months } = rows[0];
  if (!months || months === 0) return 0;
  return Math.round(total / months);
}

/**
 * Get activity breakdown (ACTIVE, DORMANT, NEW) from street_cred.
 *
 * @param {string} guildId
 * @returns {{active: number, dormant: number, new: number, total: number}}
 */
async function getActivityBreakdown(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT
       SUM(status = 'ACTIVE')  AS active,
       SUM(status = 'DORMANT') AS dormant,
       SUM(status = 'NEW')     AS \`new\`,
       COUNT(*)                AS total
       FROM street_cred
      WHERE guild_id = ?`,
    [guildId]
  );
  const r = rows[0];
  return {
    active:  Number(r.active  ?? 0),
    dormant: Number(r.dormant ?? 0),
    new:     Number(r.new     ?? 0),
    total:   Number(r.total   ?? 0),
  };
}

/**
 * Get total messages stored in message_analytics for a guild.
 *
 * @param {string} guildId
 * @returns {number}
 */
async function getTotalMessages(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS count FROM message_analytics WHERE guild_id = ?',
    [guildId]
  );
  return rows[0]?.count ?? 0;
}

/**
 * Get the busiest month (most messages) across all time.
 *
 * @param {string} guildId
 * @returns {{month: string, count: number} | null}
 */
async function getBusiestMonth(guildId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM message_analytics
      WHERE guild_id = ?
      GROUP BY month
      ORDER BY count DESC
      LIMIT 1`,
    [guildId]
  );
  return rows[0] || null;
}

/**
 * Get the top N channels by message count.
 *
 * @param {string} guildId
 * @param {number} limit
 * @returns {Array<{channel_id: string, count: number}>}
 */
async function getTopChannels(guildId, limit = 5) {
  const pool = await getPool();
  const safeLimit = Math.min(25, Math.max(1, parseInt(limit, 10) || 5));
  const [rows] = await pool.execute(
    `SELECT channel_id, COUNT(*) AS count
       FROM message_analytics
      WHERE guild_id = ?
      GROUP BY channel_id
      ORDER BY count DESC
      LIMIT ${safeLimit}`,
    [guildId]
  );
  return rows;
}

/**
 * Forward-track a single message into message_analytics.
 * Called from messageCreate.js alongside streetCredService.trackMessage().
 *
 * @param {Message} message — discord.js Message object
 */
async function trackMessageAnalytics(message) {
  try {
    if (!message.guild || message.author.bot) return;
    const pool = await getPool();
    await pool.execute(
      `INSERT IGNORE INTO message_analytics (message_id, user_id, guild_id, channel_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [message.id, message.author.id, message.guild.id, message.channelId, new Date(message.createdAt)]
    );
  } catch (err) {
    logger.error(`[ANALYTICS] trackMessageAnalytics error: ${err.message}`);
  }
}

module.exports = {
  runMessageScan,
  resetScan,
  getMembersJoinedByMonth,
  getMembersJoinedYTD,
  getMessagesByMonth,
  getMessagesYTD,
  getAverageMonthlyMessages,
  getActivityBreakdown,
  getTotalMessages,
  getBusiestMonth,
  getTopChannels,
  trackMessageAnalytics,
};
