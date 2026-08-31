// config/guildConfigManager.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const GUILD_CONFIG_DIR = path.join(__dirname, 'guilds');

function ensureDir() {
  if (!fs.existsSync(GUILD_CONFIG_DIR)) {
    fs.mkdirSync(GUILD_CONFIG_DIR, { recursive: true });
  }
}

function getGuildConfigPath(guildId) {
  ensureDir();
  return path.join(GUILD_CONFIG_DIR, `${guildId}.json`);
}

function loadGuildConfig(guildId) {
  try {
    const file = getGuildConfigPath(guildId);
    if (!fs.existsSync(file)) {
      logger.info(`[GuildConfig] No config found for guild ${guildId}, using empty defaults`);
      return {
        combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10),
        groups: [],
        collections: []
      };
    }

    const raw = fs.readFileSync(file, 'utf8');
    const config = JSON.parse(raw);

    // Ensure combineWindowMs exists
    if (typeof config.combineWindowMs !== 'number') {
      config.combineWindowMs = parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10);
    }

    return config;
  } catch (err) {
    logger.error(`[GuildConfig] Failed to load config for guild ${guildId}: ${err.message}`);
    return {
      combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10),
      groups: [],
      collections: []
    };
  }
}

function saveGuildConfig(guildId, config) {
  try {
    const file = getGuildConfigPath(guildId);
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
    logger.info(`[GuildConfig] Saved config for guild ${guildId}`);
  } catch (err) {
    logger.error(`[GuildConfig] Failed to save config for guild ${guildId}: ${err.message}`);
  }
}

// Helper lookups (similar to old collections.js, but per guild)
function getCollection(guildId, slug) {
  const config = loadGuildConfig(guildId);
  return config.collections.find(c => c.slug === slug) || null;
}

function getGroup(guildId, groupName) {
  const config = loadGuildConfig(guildId);
  return config.groups.find(g => g.name === groupName) || null;
}

function getGroupForCollection(guildId, slug) {
  const collection = getCollection(guildId, slug);
  if (!collection) return null;
  return getGroup(guildId, collection.group);
}

module.exports = {
  loadGuildConfig,
  saveGuildConfig,
  getCollection,
  getGroup,
  getGroupForCollection
};
