const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'channelDelete',
  async execute(channel, client) {
    try {
      await auditLogger.logChannelDeleted(client, channel);
    } catch (error) {
      logger.error('Error logging channel delete event:', error);
    }
  }
};