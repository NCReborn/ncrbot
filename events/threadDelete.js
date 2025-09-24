const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'threadDelete',
  async execute(thread, client) {
    try {
      await auditLogger.logThreadDeleted(client, thread);
    } catch (error) {
      logger.error('Error logging thread delete event:', error);
    }
  }
};