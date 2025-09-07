const voiceConfig = require('../config/voiceChannels');
const logger = require('./logger');

async function updateCollectionVersionChannel(guild, revision) {
  try {
    const channel = await guild.channels.fetch(voiceConfig.collectionChannelId).catch(e => {
      logger.error(`Failed to fetch collection version channel: ${e.message}`);
      return null;
    });
    if (channel) {
      await channel.setName(`${voiceConfig.collectionVersionPrefix} (R${revision})`).catch(e => {
        logger.error(`Failed to set collection channel name: ${e.message}`);
      });
    }
  } catch (err) {
    logger.error(`Error in updateCollectionVersionChannel: ${err.message}`);
  }
}

async function updateStatusChannel(guild, status) {
  try {
    const channel = await guild.channels.fetch(voiceConfig.statusChannelId).catch(e => {
      logger.error(`Failed to fetch status channel: ${e.message}`);
      return null;
    });
    if (channel) {
      await channel.setName(status).catch(e => {
        logger.error(`Failed to set status channel name: ${e.message}`);
      });
    }
  } catch (err) {
    logger.error(`Error in updateStatusChannel: ${err.message}`);
  }
}

module.exports = {
  updateCollectionVersionChannel,
  updateStatusChannel
};
