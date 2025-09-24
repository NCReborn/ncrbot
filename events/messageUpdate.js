const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    // Skip bot messages and system messages
    if (!newMessage.author || newMessage.author.bot) return;
    
    try {
      await auditLogger.logMessageUpdated(client, oldMessage, newMessage);
    } catch (error) {
      logger.error('Error logging message update event:', error);
    }
  }
};