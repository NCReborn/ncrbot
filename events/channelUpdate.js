const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client) {
    try {
      await auditLogger.logChannelUpdated(client, oldChannel, newChannel);
    } catch (error) {
      logger.error('Error logging channel update event:', error);
    }
  }
};