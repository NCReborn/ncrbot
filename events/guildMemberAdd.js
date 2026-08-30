const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // unchanged: let auditLogger handle everything
      await auditLogger.logMemberJoined(client, member);
    } catch (error) {
      logger.error('Error logging member join event:', error);
    }
  }
};
