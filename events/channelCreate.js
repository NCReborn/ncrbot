const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'channelCreate',
  async execute(channel, client) {
    try {
      await auditLogger.logChannelCreated(client, channel);
    } catch (error) {
      logger.error('Error logging channel create event:', error);
    }
  }
};