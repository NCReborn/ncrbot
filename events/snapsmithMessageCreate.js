'use strict';

const logger = require('../utils/logger');
const snapsmith = require('../services/SnapSmithService');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Skip bot messages and DMs
    if (message.author.bot || !message.guild) return;

    // Check if this message is in the showcase channel
    if (message.channelId === snapsmith.SHOWCASE_CHANNEL) {
      try {
        // Refresh the timer for this user if they have active SnapSmith
        const refreshed = await snapsmith.refreshSnapSmithTimer(message.author.id, message.guild.id);
        
        if (refreshed) {
          logger.info(`[SNAPSMITH] Timer refreshed for ${message.author.tag} (showcase submission)`);
        }
      } catch (err) {
        logger.error(`[SNAPSMITH] Error refreshing timer on message: ${err.message}`);
      }
    }
  },
};
