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
      console.log(`[DEBUG] Created guild config directory at: ${GUILD_CONFIG_DIR}`);
    }
  } catch (err) {
    console.error(`[DEBUG] Failed to create guild config directory: ${err.message}`);
  }
}

function getGuildConfigPath(guildId) {
  ensureDir();
  const filePath = path.join(GUILD_CONFIG_DIR, `${guildId}.json`);
  console.log(`[DEBUG] Guild config path resolved to: ${filePath}`);
  return filePath;
}

function loadGuildConfig(guildId) {
  try {
    const file = getGuildConfigPath(guildId);

    if (!fs.existsSync(file)) {
      logger.info(`[GuildConfig] No config found for guild ${guildId}, using defaults`);
      console.log(`[DEBUG] No config file found, returning empty config`);
      return {
        combineWindowMs: parseInt(process.env.COMBINE_WINDOW_MS || '5000', 10),
        groups: [],
        collections: []
      };
    }

    console.log(`[DEBUG] Loading guild config from: ${file}`);
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
    console.error(`[DEBUG] Error loading config: ${err.stack}`);
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
    console.log(`[DEBUG] Saving guild config to: ${file}`);

    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
    logger.info(`[GuildConfig] Saved config for guild ${guildId}`);

  } catch (err) {
    logger.error(`[GuildConfig] Failed to save config for guild ${guildId}: ${err.message}`);
    console.error(`[DEBUG] Error saving config: ${err.stack}`);
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
