const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    // Skip bot messages and system messages
    if (!message.author || message.author.bot) return;
    
    try {
      await auditLogger.logMessageDeleted(client, message);
    } catch (error) {
      logger.error('Error logging message delete event:', error);
    }
  }
};