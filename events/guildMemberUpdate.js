const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    try {
      await auditLogger.logMemberUpdate(client, oldMember, newMember);
    } catch (error) {
      logger.error('Error logging member update event:', error);
    }
  }
};