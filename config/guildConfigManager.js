// config/guildConfigManager.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Use process.cwd() instead of __dirname to avoid Pterodactyl directory desync
const GUILD_CONFIG_DIR = path.join(process.cwd(), 'config', 'guilds');

function ensureDir() {
  try {
    if (!fs.existsSync(GUILD_CONFIG_DIR)) {
      fs.mkdirSync(GUILD_CONFIG_DIR, { recursive: true });
      logger.debug(`[GuildConfig] Created guild config directory at: ${GUILD_CONFIG_DIR}`);
    }
  } catch (err) {
    logger.error(`[GuildConfig] Failed to create guild config directory: ${err.message}`);
  }
}

function getGuildConfigPath(guildId) {
  ensureDir();
  const filePath = path.join(GUILD_CONFIG_DIR, `${guildId}.json`);
  logger.debug(`[GuildConfig] Guild config path resolved to: ${filePath}`);
  return filePath;
}

function loadGuildConfig(guildId) {
  try {
    const file = getGuildConfigPath(guildId);

    if (!fs.existsSync(file)) {
      logger.info(`[GuildConfig] No config found for guild ${guildId}, using defaults`);
      logger.debug('[GuildConfig] No config file found, returning defaults');
      return {
        combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10),
        groups: [],
        collections: []
      };
    }

    logger.debug(`[GuildConfig] Loading guild config from: ${file}`);
    const raw = fs.readFileSync(file, 'utf8');
    const config = JSON.parse(raw);

    if (typeof config.combineWindowMs !== 'number') {
      config.combineWindowMs = parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10);
    }

    if (!Array.isArray(config.groups)) config.groups = [];
    if (!Array.isArray(config.collections)) config.collections = [];

    return config;

  } catch (err) {
    logger.error(`[GuildConfig] Failed to load config for guild ${guildId}: ${err.message}`);
    logger.debug(`[GuildConfig] Error loading config: ${err.stack}`);
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
    logger.debug(`[GuildConfig] Saving guild config to: ${file}`);

    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
    logger.info(`[GuildConfig] Saved config for guild ${guildId}`);

  } catch (err) {
    logger.error(`[GuildConfig] Failed to save config for guild ${guildId}: ${err.message}`);
    logger.debug(`[GuildConfig] Error saving config: ${err.stack}`);
  }
}

function getCollection(guildId, slug) {
  const config = loadGuildConfig(guildId);
  return config.collections.find(c => c.slug === slug) || null;
}

function getGroup(guildId, groupName) {
  const config = loadGuildConfig(guildId);
  return config.groups.find(g => g.name === groupName) || null;
}

function getGroupForCollection(guildId, slug) {
  const config = loadGuildConfig(guildId);
  const collection = config.collections.find(c => c.slug === slug) || null;
  if (!collection) return null;
  return config.groups.find(g => g.name === collection.group) || null;
}

module.exports = {
  loadGuildConfig,
  saveGuildConfig,
  getCollection,
  getGroup,
  getGroupForCollection
};
