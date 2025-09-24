const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban, client) {
    try {
      await auditLogger.logMemberBanned(client, ban);
    } catch (error) {
      logger.error('Error logging ban event:', error);
    }
  }
};