const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      await auditLogger.logMemberLeft(client, member);
    } catch (error) {
      logger.error('Error logging member leave event:', error);
    }
  }
};