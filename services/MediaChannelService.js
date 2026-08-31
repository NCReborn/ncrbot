// services/MediaChannelService.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const BASE_DIR = path.join(process.cwd(), 'config', 'mediaChannels');

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
    console.log(`[DEBUG] Created mediaChannels directory at: ${BASE_DIR}`);
  }
}

function getGuildConfigPath(guildId) {
  ensureDir();
  const filePath = path.join(BASE_DIR, `${guildId}.json`);
  console.log(`[DEBUG] Media config path resolved to: ${filePath}`);
  return filePath;
}

class MediaChannelService {
  loadConfig(guildId) {
    const file = getGuildConfigPath(guildId);

    try {
      if (!fs.existsSync(file)) {
        console.log(`[DEBUG] No media config for guild ${guildId}, using defaults`);
        return { imageOnlyChannels: [], fileOnlyChannels: [] };
      }

      console.log(`[DEBUG] Loading media config for guild ${guildId}`);
      return JSON.parse(fs.readFileSync(file, 'utf8'));

    } catch (error) {
      logger.error(`[MEDIA_SERVICE] Failed to load config for guild ${guildId}:`, error);
      return { imageOnlyChannels: [], fileOnlyChannels: [] };
    }
  }

  saveConfig(guildId, config) {
    const file = getGuildConfigPath(guildId);

    try {
      fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
      logger.debug(`[MEDIA_SERVICE] Saved media config for guild ${guildId}`);
    } catch (error) {
      logger.error(`[MEDIA_SERVICE] Failed to save config for guild ${guildId}:`, error);
      throw error;
    }
  }

  addImageOnlyChannel(guildId, channelId) {
    const config = this.loadConfig(guildId);

    if (config.imageOnlyChannels.includes(channelId)) {
      return { success: false, reason: 'already_exists' };
    }

    config.imageOnlyChannels.push(channelId);
    this.saveConfig(guildId, config);

    logger.info(`[MEDIA_SERVICE] Added image-only channel ${channelId} in guild ${guildId}`);
    return { success: true };
  }

  removeImageOnlyChannel(guildId, channelId) {
    const config = this.loadConfig(guildId);

    if (!config.imageOnlyChannels.includes(channelId)) {
      return { success: false, reason: 'not_found' };
    }

    config.imageOnlyChannels = config.imageOnlyChannels.filter(id => id !== channelId);
    this.saveConfig(guildId, config);

    logger.info(`[MEDIA_SERVICE] Removed image-only channel ${channelId} in guild ${guildId}`);
    return { success: true };
  }

  getImageOnlyChannels(guildId) {
    return this.loadConfig(guildId).imageOnlyChannels || [];
  }

  getFileOnlyChannels(guildId) {
    return this.loadConfig(guildId).fileOnlyChannels || [];
  }

  isImageOnlyChannel(guildId, channelId) {
    return this.getImageOnlyChannels(guildId).includes(channelId);
  }

  isFileOnlyChannel(guildId, channelId) {
    return this.getFileOnlyChannels(guildId).includes(channelId);
  }
}

module.exports = new MediaChannelService();
