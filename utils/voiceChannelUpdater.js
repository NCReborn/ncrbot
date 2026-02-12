const voiceConfig = require('../config/voiceChannels');
const logger = require('./logger');

// Timer for status revert management
let statusRevertTimer = null;

async function updateCollectionVersionChannel(guild, gameVersion, revision) {
  try {
    const channel = await guild.channels.fetch(voiceConfig.collectionChannelId).catch(e => {
      logger.error(`Failed to fetch collection version channel: ${e.message}`);
      return null;
    });
    if (channel) {
      if (!channel.isVoiceBased()) {
        logger.error('Configured collection version channel is not a voice channel.');
        return;
      }
      const channelName = `🔵┃Collection Version: ${gameVersion} (R${revision})`;
      await channel.setName(channelName).catch(e => {
        logger.error(`Failed to set collection channel name: ${e.message}`);
      });
      logger.info(`[VOICE_CHANNEL] Updated collection version channel to: ${channelName}`);
    }
  } catch (err) {
    logger.error(`Error in updateCollectionVersionChannel: ${err.message}`);
  }
}

async function updateStatusChannel(guild, status, scheduleRevert = false) {
  try {
    const channel = await guild.channels.fetch(voiceConfig.statusChannelId).catch(e => {
      logger.error(`Failed to fetch status channel: ${e.message}`);
      return null;
    });
    if (channel) {
      if (!channel.isVoiceBased()) {
        logger.error('Configured status channel is not a voice channel.');
        return;
      }
      await channel.setName(status).catch(e => {
        logger.error(`Failed to set status channel name: ${e.message}`);
      });
      logger.info(`[VOICE_CHANNEL] Updated status channel to: ${status}`);
      
      // Clear any existing timer
      if (statusRevertTimer) {
        clearTimeout(statusRevertTimer);
        logger.info('[VOICE_CHANNEL] Cleared existing status revert timer');
        statusRevertTimer = null;
      }
      
      // Schedule revert if requested
      if (scheduleRevert) {
        logger.info(`[VOICE_CHANNEL] Scheduling status revert to stable in ${voiceConfig.statusRevertDelayMs / 1000 / 60 / 60} hours`);
        statusRevertTimer = setTimeout(async () => {
          logger.info('[VOICE_CHANNEL] Status revert timer triggered');
          await updateStatusChannel(guild, voiceConfig.statusStable, false);
          statusRevertTimer = null;
        }, voiceConfig.statusRevertDelayMs);
      }
    }
  } catch (err) {
    logger.error(`Error in updateStatusChannel: ${err.message}`);
  }
}

function cancelStatusRevert() {
  if (statusRevertTimer) {
    clearTimeout(statusRevertTimer);
    logger.info('[VOICE_CHANNEL] Cancelled status revert timer');
    statusRevertTimer = null;
  }
}

module.exports = {
  updateCollectionVersionChannel,
  updateStatusChannel,
  cancelStatusRevert
};
