const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_PATH = path.join(__dirname, '../config/imageOnlyConfig.json');

/**
 * Service for managing media-only channel configurations
 */
class MediaChannelService {
  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (error) {
      logger.error('[MEDIA_SERVICE] Failed to load config:', error);
      return { imageOnlyChannels: [], fileOnlyChannels: [] };
    }
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      logger.debug('[MEDIA_SERVICE] Config saved');
    } catch (error) {
      logger.error('[MEDIA_SERVICE] Failed to save config:', error);
      throw error;
    }
  }

  addImageOnlyChannel(channelId) {
    const config = this.loadConfig();
    
    if (config.imageOnlyChannels.includes(channelId)) {
      return { success: false, reason: 'already_exists' };
    }
    
    config.imageOnlyChannels.push(channelId);
    this.saveConfig(config);
    
    logger.info(`[MEDIA_SERVICE] Added image-only channel: ${channelId}`);
    return { success: true };
  }

  removeImageOnlyChannel(channelId) {
    const config = this.loadConfig();
    
    if (!config.imageOnlyChannels.includes(channelId)) {
      return { success: false, reason: 'not_found' };
    }
    
    config.imageOnlyChannels = config.imageOnlyChannels.filter(id => id !== channelId);
    this.saveConfig(config);
    
    logger.info(`[MEDIA_SERVICE] Removed image-only channel: ${channelId}`);
    return { success: true };
  }

  getImageOnlyChannels() {
    const config = this.loadConfig();
    return config.imageOnlyChannels || [];
  }

  getFileOnlyChannels() {
    const config = this.loadConfig();
    return config.fileOnlyChannels || [];
  }

  isImageOnlyChannel(channelId) {
    return this.getImageOnlyChannels().includes(channelId);
  }

  isFileOnlyChannel(channelId) {
    return this.getFileOnlyChannels().includes(channelId);
  }
}

module.exports = new MediaChannelService();
