const logger = require('./logger');
const CONSTANTS = require('../config/constants');

function parseCsvList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function getConfiguredGuildIds() {
  const guildIds = parseCsvList(process.env.GUILD_IDS);
  if (guildIds.length > 0) return guildIds;
  return parseCsvList(process.env.GUILD_ID);
}

function parseGuildChannelMap(value) {
  if (!value) return {};

  const trimmed = value.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed)
            .filter(([guildId, channelId]) => guildId && channelId)
            .map(([guildId, channelId]) => [String(guildId).trim(), String(channelId).trim()])
        );
      }
    } catch (err) {
      logger.warn(`[GUILD_CONFIG] Failed to parse JSON guild channel map: ${err.message}`);
    }
  }

  const entries = trimmed.split(',').map(entry => entry.trim()).filter(Boolean);
  const map = {};
  for (const entry of entries) {
    const [guildId, channelId] = entry.split(':').map(part => part?.trim());
    if (guildId && channelId) {
      map[guildId] = channelId;
    }
  }
  return map;
}

function getShowcaseChannelMap() {
  return parseGuildChannelMap(process.env.SHOWCASE_CHANNEL_IDS);
}

function getBotSpamChannelMap() {
  return parseGuildChannelMap(process.env.BOT_SPAM_CHANNEL_IDS);
}

function getGuildChannelId(guildId, channelType) {
  if (!guildId) return null;

  const guildIds = getConfiguredGuildIds();
  const legacySingleGuildId = guildIds.length === 1 ? guildIds[0] : null;

  if (channelType === 'showcase') {
    const configured = getShowcaseChannelMap()[guildId];
    if (configured) return configured;
    if (legacySingleGuildId === guildId) return CONSTANTS.CHANNELS.SHOWCASE || null;
    return null;
  }

  if (channelType === 'botSpam') {
    const configured = getBotSpamChannelMap()[guildId];
    if (configured) return configured;
    if (legacySingleGuildId === guildId) return CONSTANTS.CHANNELS.BOT_SPAM || null;
    return null;
  }

  return null;
}

function logMissingRequiredGuildChannelMappings(client) {
  const configuredGuildIds = getConfiguredGuildIds();
  const guildIdsToCheck = configuredGuildIds.length > 0
    ? configuredGuildIds
    : client.guilds.cache.map(guild => guild.id);

  if (guildIdsToCheck.length === 0) return;

  const showcaseMap = getShowcaseChannelMap();
  const botSpamMap = getBotSpamChannelMap();
  const legacySingleGuildId = configuredGuildIds.length === 1 ? configuredGuildIds[0] : null;

  const missingShowcase = [];
  const missingBotSpam = [];

  for (const guildId of guildIdsToCheck) {
    const hasShowcase = Boolean(showcaseMap[guildId]) || legacySingleGuildId === guildId;
    const hasBotSpam = Boolean(botSpamMap[guildId]) || legacySingleGuildId === guildId;

    if (!hasShowcase) missingShowcase.push(guildId);
    if (!hasBotSpam) missingBotSpam.push(guildId);
  }

  if (missingShowcase.length > 0) {
    logger.warn(`[CONFIGCHECK] Missing showcase channel mapping for guild IDs: ${missingShowcase.join(', ')}. Set SHOWCASE_CHANNEL_IDS (format: guildId:channelId,guildId2:channelId2).`);
  }

  if (missingBotSpam.length > 0) {
    logger.warn(`[CONFIGCHECK] Missing bot spam (StreetCred announcement) channel mapping for guild IDs: ${missingBotSpam.join(', ')}. Set BOT_SPAM_CHANNEL_IDS (format: guildId:channelId,guildId2:channelId2).`);
  }
}

module.exports = {
  getConfiguredGuildIds,
  getGuildChannelId,
  logMissingRequiredGuildChannelMappings,
};
