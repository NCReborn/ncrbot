'use strict';

const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { getPool } = require('../utils/database');
const streetCredDefaults = require('../config/streetCredConfig.json');
const { CHANNELS, HELPER_ROLES } = require('../config/constants');
const { getGuildChannelId } = require('../utils/guildConfig');

const CONFIG_CACHE_TTL_MS = 60 * 1000;
const guildConfigCache = new Map();

function sortTiers(a, b) {
  if (a.threshold !== b.threshold) return a.threshold - b.threshold;
  return a.tierKey - b.tierKey;
}

function normalizeTier(tier) {
  if (!tier) return null;

  const tierKey = Number(tier.tierKey ?? tier.tier_key);
  const threshold = Number(tier.threshold);
  if (!Number.isFinite(tierKey) || !Number.isFinite(threshold)) return null;

  const tierNameRaw = tier.tierName ?? tier.tier_name;
  const tierName = typeof tierNameRaw === 'string' && tierNameRaw.trim()
    ? tierNameRaw.trim()
    : `Level ${tierKey}`;

  const roleIdRaw = tier.roleId ?? tier.role_id;
  const roleId = roleIdRaw ? String(roleIdRaw) : null;

  return { tierKey, tierName, threshold, roleId };
}

function buildDefaultTiers() {
  const thresholds = streetCredDefaults.thresholds || {};
  const roles = streetCredDefaults.roles || {};

  const tiers = Object.keys(thresholds)
    .map((key) => {
      const tierKey = Number(key);
      const threshold = Number(thresholds[key]);
      if (!Number.isFinite(tierKey) || !Number.isFinite(threshold)) return null;
      return {
        tierKey,
        tierName: `SC-${tierKey}`,
        threshold,
        roleId: roles[key] || null,
      };
    })
    .filter(Boolean)
    .sort(sortTiers);

  return tiers;
}

const DEFAULT_TIERS = buildDefaultTiers();
const DEFAULT_CONFIG = {
  systemName: 'Street Creed',
  dormancyDays: Number(streetCredDefaults.dormancyDays) || 120,
  formula: {
    tenureDivisor: Number(streetCredDefaults.formula?.tenureDivisor) || 10,
    baseMultiplier: Number(streetCredDefaults.formula?.baseMultiplier) || 1.75,
  },
  levelupChannelId: null,
};

function buildTierMaps(tiers) {
  const byKey = new Map();
  const roleMap = {};

  for (const tier of tiers) {
    byKey.set(tier.tierKey, tier);
    if (tier.roleId) roleMap[String(tier.tierKey)] = tier.roleId;
  }

  return { byKey, roleMap };
}

function invalidateGuildConfigCache(guildId) {
  guildConfigCache.delete(String(guildId));
}

function getSortedTiersDescending(tiers) {
  return [...tiers].sort((a, b) => {
    if (a.threshold !== b.threshold) return b.threshold - a.threshold;
    return b.tierKey - a.tierKey;
  });
}

async function getGuildConfig(guildId, opts = {}) {
  const key = String(guildId);
  if (!opts.noCache) {
    const cached = guildConfigCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const pool = await getPool();
  const [[configRow]] = await pool.execute(
    `SELECT guild_id, system_name, dormancy_days, tenure_divisor, base_multiplier, levelup_channel_id
       FROM street_cred_config
      WHERE guild_id = ?`,
    [key]
  );

  const [tierRows] = await pool.execute(
    `SELECT guild_id, tier_key, tier_name, threshold, role_id
       FROM street_cred_tiers
      WHERE guild_id = ?`,
    [key]
  );

  const hasConfigOverride = Boolean(configRow);
  const hasTierOverride = tierRows.length > 0;

  const systemName = configRow?.system_name || DEFAULT_CONFIG.systemName;
  const dormancyDays = Number(configRow?.dormancy_days ?? DEFAULT_CONFIG.dormancyDays);
  const formula = {
    tenureDivisor: Number(configRow?.tenure_divisor ?? DEFAULT_CONFIG.formula.tenureDivisor),
    baseMultiplier: Number(configRow?.base_multiplier ?? DEFAULT_CONFIG.formula.baseMultiplier),
  };
  const levelupChannelId = configRow?.levelup_channel_id ? String(configRow.levelup_channel_id) : null;

  const tiers = (hasTierOverride
    ? tierRows.map(normalizeTier).filter(Boolean)
    : DEFAULT_TIERS.map((tier) => ({ ...tier })))
    .sort(sortTiers);

  const { byKey, roleMap } = buildTierMaps(tiers);

  const value = {
    guildId: key,
    source: hasConfigOverride || hasTierOverride ? 'guild_override' : 'defaults',
    systemName,
    dormancyDays,
    formula,
    levelupChannelId,
    tiers,
    tiersDescending: getSortedTiersDescending(tiers),
    tierByKey: byKey,
    roleMap,
  };

  guildConfigCache.set(key, {
    value,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  });

  return value;
}

async function ensureGuildConfigRow(guildId) {
  const pool = await getPool();
  await pool.execute(
    `INSERT IGNORE INTO street_cred_config
      (guild_id, system_name, dormancy_days, tenure_divisor, base_multiplier, levelup_channel_id)
     VALUES (?, ?, ?, ?, ?, ?)` ,
    [
      String(guildId),
      DEFAULT_CONFIG.systemName,
      DEFAULT_CONFIG.dormancyDays,
      DEFAULT_CONFIG.formula.tenureDivisor,
      DEFAULT_CONFIG.formula.baseMultiplier,
      null,
    ]
  );
}

async function setGuildConfigFields(guildId, partialFields = {}) {
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(partialFields, 'systemName')) {
    const value = String(partialFields.systemName).trim();
    if (!value || value.length > 100) {
      throw new Error('systemName must be between 1 and 100 characters');
    }
    updates.push('system_name = ?');
    params.push(value);
  }
  if (Object.prototype.hasOwnProperty.call(partialFields, 'dormancyDays')) {
    const value = Number(partialFields.dormancyDays);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error('dormancyDays must be an integer >= 1');
    }
    updates.push('dormancy_days = ?');
    params.push(value);
  }
  if (Object.prototype.hasOwnProperty.call(partialFields, 'tenureDivisor')) {
    const value = Number(partialFields.tenureDivisor);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('tenureDivisor must be > 0');
    }
    updates.push('tenure_divisor = ?');
    params.push(value);
  }
  if (Object.prototype.hasOwnProperty.call(partialFields, 'baseMultiplier')) {
    const value = Number(partialFields.baseMultiplier);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('baseMultiplier must be > 0');
    }
    updates.push('base_multiplier = ?');
    params.push(value);
  }
  if (Object.prototype.hasOwnProperty.call(partialFields, 'levelupChannelId')) {
    updates.push('levelup_channel_id = ?');
    params.push(partialFields.levelupChannelId ? String(partialFields.levelupChannelId) : null);
  }

  if (updates.length > 0) {
    await ensureGuildConfigRow(guildId);
    const pool = await getPool();
    params.push(String(guildId));
    await pool.execute(
      `UPDATE street_cred_config SET ${updates.join(', ')} WHERE guild_id = ?`,
      params
    );
    invalidateGuildConfigCache(guildId);
  }

  return getGuildConfig(guildId, { noCache: true });
}

async function setGuildTier(guildId, { tierKey, tierName, threshold, roleId = null }) {
  const normalizedKey = Number(tierKey);
  const normalizedThreshold = Number(threshold);
  const normalizedName = String(tierName || '').trim();

  if (!Number.isInteger(normalizedKey) || normalizedKey < 1) {
    throw new Error('tier_key must be an integer >= 1');
  }
  if (!Number.isFinite(normalizedThreshold) || normalizedThreshold < 0) {
    throw new Error('threshold must be a number >= 0');
  }
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('tier_name must be between 1 and 100 characters');
  }

  await ensureGuildConfigRow(guildId);
  const pool = await getPool();
  await pool.execute(
    `INSERT INTO street_cred_tiers (guild_id, tier_key, tier_name, threshold, role_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       tier_name = VALUES(tier_name),
       threshold = VALUES(threshold),
       role_id = VALUES(role_id)`,
    [
      String(guildId),
      normalizedKey,
      normalizedName,
      normalizedThreshold,
      roleId ? String(roleId) : null,
    ]
  );

  invalidateGuildConfigCache(guildId);
  return getGuildConfig(guildId, { noCache: true });
}

async function removeGuildTier(guildId, tierKey) {
  const normalizedKey = Number(tierKey);
  if (!Number.isInteger(normalizedKey) || normalizedKey < 1) {
    throw new Error('tier_key must be an integer >= 1');
  }

  const pool = await getPool();
  await pool.execute(
    'DELETE FROM street_cred_tiers WHERE guild_id = ? AND tier_key = ?',
    [String(guildId), normalizedKey]
  );

  invalidateGuildConfigCache(guildId);
  return getGuildConfig(guildId, { noCache: true });
}

async function listGuildTiers(guildId) {
  const cfg = await getGuildConfig(guildId);
  return cfg.tiers;
}

async function resetGuildConfig(guildId) {
  const pool = await getPool();
  await pool.execute('DELETE FROM street_cred_tiers WHERE guild_id = ?', [String(guildId)]);
  await pool.execute('DELETE FROM street_cred_config WHERE guild_id = ?', [String(guildId)]);
  invalidateGuildConfigCache(guildId);
  return getGuildConfig(guildId, { noCache: true });
}

function resolveFormula(cfgFormula) {
  return {
    tenureDivisor: Number(cfgFormula?.tenureDivisor ?? DEFAULT_CONFIG.formula.tenureDivisor),
    baseMultiplier: Number(cfgFormula?.baseMultiplier ?? DEFAULT_CONFIG.formula.baseMultiplier),
  };
}

// ─── Pure calculation helpers ─────────────────────────────────────────────────

/**
 * Returns how many complete months have elapsed since joinedAt.
 * @param {Date} joinedAt
 * @returns {number}
 */
function tenureMonths(joinedAt) {
  const now = new Date();
  const years = now.getFullYear() - joinedAt.getFullYear();
  const months = now.getMonth() - joinedAt.getMonth();
  return Math.max(0, years * 12 + months);
}

/**
 * Tenure multiplier: baseMultiplier + (tenureMonths / tenureDivisor)
 * @param {number} months
 * @param {{tenureDivisor:number,baseMultiplier:number}} [cfgFormula]
 * @returns {number}
 */
function tenureMultiplier(months, cfgFormula) {
  const formula = resolveFormula(cfgFormula);
  return formula.baseMultiplier + (months / formula.tenureDivisor);
}

/**
 * Effective score = messageCount * tenureMultiplier
 * @param {number} messageCount
 * @param {number} months
 * @param {{tenureDivisor:number,baseMultiplier:number}} [cfgFormula]
 * @returns {number}
 */
function effectiveScore(messageCount, months, cfgFormula) {
  return messageCount * tenureMultiplier(months, cfgFormula);
}

function normalizeTiersInput(tiersInput) {
  if (Array.isArray(tiersInput)) return tiersInput;
  if (tiersInput?.tiers && Array.isArray(tiersInput.tiers)) return tiersInput.tiers;
  return DEFAULT_TIERS;
}

/**
 * Map an effective score to the highest matching tier.
 * Returns 0 for members below the minimum threshold.
 * @param {number} score
 * @param {Array} tiersInput
 * @returns {number}
 */
function getTier(score, tiersInput) {
  const tiersDesc = getSortedTiersDescending(normalizeTiersInput(tiersInput));
  for (const tier of tiersDesc) {
    if (score >= Number(tier.threshold)) return tier.tierKey;
  }
  return 0;
}

function nextTier(currentTier, tiersInput) {
  const tiers = [...normalizeTiersInput(tiersInput)].sort(sortTiers);
  if (tiers.length === 0) return null;
  if (currentTier <= 0) return tiers[0];

  const idx = tiers.findIndex((t) => t.tierKey === currentTier);
  if (idx === -1) return tiers[0];
  return tiers[idx + 1] || null;
}

/**
 * Returns the effective score threshold for the next tier above currentTier.
 * Returns null if already at max tier.
 */
function nextTierThreshold(currentTier, tiersInput) {
  const next = nextTier(currentTier, tiersInput);
  return next ? Number(next.threshold) : null;
}

/**
 * Returns the effective score threshold for the current tier.
 */
function currentTierThreshold(currentTier, tiersInput) {
  if (currentTier < 1) return 0;
  const tiers = normalizeTiersInput(tiersInput);
  const current = tiers.find((t) => t.tierKey === currentTier);
  return current ? Number(current.threshold) : 0;
}

function getTierLabel(tierKey, cfg) {
  if (tierKey < 1) return 'Unranked';
  const tier = cfg?.tierByKey?.get(tierKey);
  if (tier?.tierName) return tier.tierName;
  return `Level ${tierKey}`;
}

// ─── Role management ───────────────────────────────────────────────────────

/**
 * Returns all tier role IDs from config as a Set.
 */
function allStreetCredRoleIds(cfg) {
  const tiers = normalizeTiersInput(cfg);
  const roleIds = [
    ...tiers.map((tier) => tier.roleId),
    ...DEFAULT_TIERS.map((tier) => tier.roleId),
  ].filter(Boolean);
  return new Set(roleIds);
}

/**
 * Remove every StreetCred role from a guild member, then assign the one
 * correct role (if tier >= 1).
 * @param {GuildMember} member
 * @param {number} tier  — 0 means "no role" (lurker/unranked)
 * @param {Object} cfg
 */
async function applyTierRole(member, tier, cfg) {
  try {
    const guildCfg = cfg || await getGuildConfig(member.guild.id);
    const scRoleIds = allStreetCredRoleIds(guildCfg.tiers);

    const toRemove = member.roles.cache.filter((r) => scRoleIds.has(r.id));
    if (toRemove.size > 0) {
      await member.roles.remove([...toRemove.keys()], `${guildCfg.systemName} tier update`);
    }

    if (tier >= 1) {
      const roleId = guildCfg.tierByKey.get(tier)?.roleId;
      if (roleId && !roleId.startsWith('PLACEHOLDER')) {
        await member.roles.add(roleId, `${guildCfg.systemName} tier ${tier}`);
      }
    }
  } catch (err) {
    logger.error(`[STREET_CRED] applyTierRole failed for ${member.id}: ${err.message}`);
  }
}

/**
 * Remove all StreetCred roles from a member (used for dormancy / mass strip).
 * @param {GuildMember} member
 * @param {Object} cfg
 */
async function removeAllStreetCredRoles(member, cfg) {
  try {
    const guildCfg = cfg || await getGuildConfig(member.guild.id);
    const scRoleIds = allStreetCredRoleIds(guildCfg.tiers);
    const toRemove = member.roles.cache.filter((r) => scRoleIds.has(r.id));
    if (toRemove.size > 0) {
      await member.roles.remove([...toRemove.keys()], `${guildCfg.systemName} role strip`);
    }
  } catch (err) {
    logger.error(`[STREET_CRED] removeAllStreetCredRoles failed for ${member.id}: ${err.message}`);
  }
}

function buildTierUpEmbed(member, result, cfg) {
  const { tier, prevTier, score, messages } = result;
  const months = tenureMonths(member.joinedAt || new Date());
  const multiplier = tenureMultiplier(months, cfg.formula);

  const nextTierDef = nextTier(tier, cfg.tiers);
  const nextGoal = nextTierDef
    ? `${getTierLabel(nextTierDef.tierKey, cfg)} at ${Math.round(nextTierDef.threshold).toLocaleString()}`
    : 'Max Tier! 🏆';

  const formattedScore = Math.round(score).toLocaleString();
  const formattedMessages = messages.toLocaleString();

  let embedColor = 0x2ecc71;
  const roleId = cfg.tierByKey.get(tier)?.roleId;
  if (roleId) {
    const role = member.guild.roles.cache.get(roleId);
    if (role?.color) embedColor = role.color;
  }

  if (prevTier === 0) {
    return new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏙️ Welcome to ${cfg.systemName}!`)
      .setThumbnail(member.displayAvatarURL({ size: 128 }))
      .setDescription(`**${member.displayName}** just earned their first ${cfg.systemName} rank!`)
      .addFields(
        { name: 'Rank', value: `${getTierLabel(tier, cfg)} (Tier ${tier})`, inline: true },
        { name: 'Score', value: formattedScore, inline: true },
        { name: 'Messages', value: formattedMessages, inline: true },
        { name: 'Next Goal', value: nextGoal, inline: true },
      )
      .setFooter({ text: 'Keep chatting to climb the ranks!' });
  }

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`⬆️ ${cfg.systemName} Level Up!`)
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .setDescription(`**${member.displayName}** levelled up!`)
    .addFields(
      { name: 'Previous Rank', value: `${getTierLabel(prevTier, cfg)} (Tier ${prevTier})`, inline: true },
      { name: 'New Rank', value: `${getTierLabel(tier, cfg)} (Tier ${tier})`, inline: true },
      { name: 'Score', value: formattedScore, inline: true },
      { name: 'Multiplier', value: `${multiplier.toFixed(2)}×`, inline: true },
      { name: 'Next Goal', value: nextGoal, inline: true },
    )
    .setFooter({ text: '🔥 Keep it up, Choom!' });
}

async function announceTierUp(guild, member, result, cfg) {
  const configuredChannelId = cfg.levelupChannelId || getGuildChannelId(guild.id, 'botSpam');
  if (!configuredChannelId) return;

  const channel = guild.channels.cache.get(configuredChannelId)
    || await guild.client.channels.fetch(configuredChannelId).catch(() => null);

  if (!channel || typeof channel.send !== 'function') {
    logger.warn(`[STREET_CRED] Level-up channel ${configuredChannelId} not sendable for guild ${guild.id}`);
    return;
  }

  const embed = buildTierUpEmbed(member, result, cfg);
  await channel.send({ embeds: [embed] }).catch((err) => {
    logger.warn(`[STREET_CRED] Failed sending level-up announcement in guild ${guild.id}: ${err.message}`);
  });
}

// ─── Database helpers ───────────────────────────────────────────────────────

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
    'INSERT IGNORE INTO street_cred (user_id, guild_id, joined_at) VALUES (?, ?, ?)',
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
 * @returns {{tier: number, score: number, messages: number, changed: boolean}}
 */
async function recalculate(userId, guildId, opts = {}, cfg) {
  const { incrementMessages = 0, lastMessageAt, joinedAt } = opts;
  const pool = await getPool();
  const guildCfg = cfg || await getGuildConfig(guildId);

  const rec = await getOrCreateRecord(userId, guildId, joinedAt);

  const newMessages = rec.messages + incrementMessages;
  const recJoinedAt = rec.joined_at ? new Date(rec.joined_at) : (joinedAt ? new Date(joinedAt) : new Date());
  const months = tenureMonths(recJoinedAt);
  const score = effectiveScore(newMessages, months, guildCfg.formula);
  const newTier = getTier(score, guildCfg.tiersDescending);
  const changed = newTier !== rec.tier;

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
 * Lightweight, fire-and-forget StreetCred update triggered by every
 * non-bot guild message.
 * @param {Message} message  — discord.js Message object
 */
async function trackMessage(message) {
  try {
    const { author, guild, member } = message;
    if (!guild || !member) return null;

    const userId = author.id;
    const guildId = guild.id;
    const joinedAt = member.joinedAt;
    const cfg = await getGuildConfig(guildId);

    const result = await recalculate(userId, guildId, {
      incrementMessages: 1,
      lastMessageAt: new Date(),
      joinedAt,
    }, cfg);

    if (result.changed || result.prevTier === 0) {
      let freshMember = member;
      try {
        const fetchPromise = guild.members.fetch(userId);
        freshMember = await Promise.race([
          fetchPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 5000)),
        ]).catch(() => member);
      } catch (err) {
        logger.warn(`[STREET_CRED] Member fetch timeout for ${userId}: ${err.message}`);
      }

      await applyTierRole(freshMember, result.tier, cfg).catch(() => {});

      if (result.changed && result.tier > result.prevTier) {
        logger.info(
          `[STREET_CRED] ${author.tag} levelled up: ${getTierLabel(result.prevTier, cfg)} → ${getTierLabel(result.tier, cfg)} ` +
          `(score: ${result.score.toFixed(0)}, messages: ${result.messages})`
        );

        await announceTierUp(guild, freshMember, result, cfg);
      }
    }

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
      await applyTierRole(freshMember, result.tier, cfg);
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
 * DORMANT and remove their StreetCred roles.
 * @param {Guild} guild
 */
async function runDormancyCheck(guild) {
  try {
    const cfg = await getGuildConfig(guild.id);
    const pool = await getPool();
    const cutoff = new Date(Date.now() - cfg.dormancyDays * 24 * 60 * 60 * 1000);

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
        if (member) await removeAllStreetCredRoles(member, cfg);

        await pool.execute(
          'UPDATE street_cred SET status = \'DORMANT\' WHERE user_id = ? AND guild_id = ?',
          [row.user_id, guild.id]
        );
        dormantCount++;

        if (member) {
          const matchedRoles = Object.entries(HELPER_ROLES)
            .filter(([, roleId]) => member.roles.cache.has(roleId))
            .map(([roleName]) => roleName);

          if (matchedRoles.length > 0) {
            try {
              const adminChannel = guild.channels.cache.get(CHANNELS.ADMIN_CHAT)
                || await guild.client.channels.fetch(CHANNELS.ADMIN_CHAT).catch(() => null);

              if (adminChannel) {
                const embed = new EmbedBuilder()
                  .setColor(0xe74c3c)
                  .setTitle('⚠️ Dormant Helper Alert')
                  .setDescription(
                    `<@${row.user_id}> has been marked as **DORMANT** and holds the following helper role(s): **${matchedRoles.join(', ')}**.\n\n` +
                    `They have not sent a message in over ${cfg.dormancyDays} days. Consider reviewing their helper role assignment.`
                  )
                  .setFooter({ text: `${cfg.systemName} Dormancy System` })
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
 * Phase 1: Strip all StreetCred roles from all guild members.
 */
async function stripAllRoles(guild, onProgress) {
  const cfg = await getGuildConfig(guild.id);
  const scRoleIds = allStreetCredRoleIds(cfg.tiers);
  const members = await guild.members.fetch();
  const withRoles = members.filter((m) => m.roles.cache.some((r) => scRoleIds.has(r.id)));
  const total = withRoles.size;
  let stripped = 0;

  for (const [, member] of withRoles) {
    await removeAllStreetCredRoles(member, cfg);
    stripped++;
    if (onProgress) onProgress(stripped, total);
  }
  return { stripped, total };
}

/**
 * Phase 2–4: Scan all readable text channels, count messages per user, then
 * recalculate tiers and apply roles. Crash-safe via street_cred_scan table.
 */
async function runRetroactiveScan(guild, onChannelProgress, onAssignProgress) {
  const cfg = await getGuildConfig(guild.id);
  const pool = await getPool();

  const channels = guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread() && c.viewable);
  const channelList = [...channels.values()];
  const total = channelList.length;

  for (const ch of channelList) {
    await pool.execute(
      'INSERT IGNORE INTO street_cred_scan (guild_id, channel_id) VALUES (?, ?)',
      [guild.id, ch.id]
    );
  }

  const counts = new Map();
  let channelsDone = 0;
  let totalMessages = 0;

  for (const ch of channelList) {
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

  for (const [userId, data] of counts) {
    try {
      let member = null;
      try {
        member = await guild.members.fetch(userId);
      } catch (_) {
        // user left
      }

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
          0,
          0,
          data.lastMessageAt ? new Date(data.lastMessageAt) : null,
          joinedAt ? new Date(joinedAt) : null,
        ]
      );
    } catch (err) {
      logger.warn(`[STREET_CRED] Scan: DB insert failed for ${userId}: ${err.message}`);
    }
  }

  const [allRecords] = await pool.execute(
    'SELECT user_id, messages, joined_at FROM street_cred WHERE guild_id = ?',
    [guild.id]
  );
  for (const rec of allRecords) {
    const ja = rec.joined_at ? new Date(rec.joined_at) : new Date();
    const months = tenureMonths(ja);
    const score = effectiveScore(rec.messages, months, cfg.formula);
    const tier = getTier(score, cfg.tiersDescending);
    await pool.execute(
      'UPDATE street_cred SET effective_score = ?, tier = ? WHERE user_id = ? AND guild_id = ?',
      [score, tier, rec.user_id, guild.id]
    );
  }

  const cutoff = new Date(Date.now() - cfg.dormancyDays * 24 * 60 * 60 * 1000);
  const [activeCandidates] = await pool.execute(
    'SELECT user_id, tier, last_message_at FROM street_cred WHERE guild_id = ? AND messages > 0',
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
        await applyTierRole(member, rec.tier, cfg);
        await pool.execute(
          'UPDATE street_cred SET status = \'ACTIVE\' WHERE user_id = ? AND guild_id = ?',
          [rec.user_id, guild.id]
        );
      } else {
        await pool.execute(
          'UPDATE street_cred SET status = \'DORMANT\' WHERE user_id = ? AND guild_id = ?',
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
 */
async function adminSync(userId, guildId, messageCount, joinedAt) {
  const pool = await getPool();
  const cfg = await getGuildConfig(guildId);
  const months = tenureMonths(joinedAt ? new Date(joinedAt) : new Date());
  const score = effectiveScore(messageCount, months, cfg.formula);
  const tier = getTier(score, cfg.tiersDescending);

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
 * Recalculate all tiers for a guild from current DB data and apply roles.
 */
async function recalculateAll(guildId, guild) {
  const pool = await getPool();
  const cfg = await getGuildConfig(guildId);
  const [rows] = await pool.execute(
    'SELECT user_id, messages, joined_at FROM street_cred WHERE guild_id = ?',
    [guildId]
  );
  let updated = 0;
  for (const row of rows) {
    try {
      const ja = row.joined_at ? new Date(row.joined_at) : new Date();
      const months = tenureMonths(ja);
      const score = effectiveScore(row.messages, months, cfg.formula);
      const tier = getTier(score, cfg.tiersDescending);

      await pool.execute(
        'UPDATE street_cred SET effective_score = ?, tier = ? WHERE user_id = ? AND guild_id = ?',
        [score, tier, row.user_id, guildId]
      );

      if (guild) {
        try {
          const member = await guild.members.fetch(row.user_id).catch(() => null);
          if (member) {
            await applyTierRole(member, tier, cfg);
          }
        } catch (memberErr) {
          logger.warn(`[STREET_CRED] recalculateAll: failed to apply role for ${row.user_id}: ${memberErr.message}`);
        }
      }

      updated++;
    } catch (err) {
      logger.error(`[STREET_CRED] recalculateAll: error processing ${row.user_id}: ${err.message}`);
    }
  }
  return updated;
}

// ─── Profile / leaderboard queries ───────────────────────────────────────────

/**
 * Fetch a single member's StreetCred record.
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

module.exports = {
  // Config
  getGuildConfig,
  setGuildConfigFields,
  setGuildTier,
  removeGuildTier,
  listGuildTiers,
  resetGuildConfig,
  // Calculations
  tenureMonths,
  tenureMultiplier,
  effectiveScore,
  getTier,
  nextTier,
  nextTierThreshold,
  currentTierThreshold,
  getTierLabel,
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
};
