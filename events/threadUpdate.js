const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'threadUpdate',
  async execute(oldThread, newThread, client) {
    try {
      await auditLogger.logThreadUpdated(client, oldThread, newThread);
    } catch (error) {
      logger.error('Error logging thread update event:', error);
    }
  }
};