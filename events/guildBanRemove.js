const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildBanRemove',
  async execute(ban, client) {
    try {
      await auditLogger.logMemberUnbanned(client, ban);
    } catch (error) {
      logger.error('Error logging unban event:', error);
    }
  }
};