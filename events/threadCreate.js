const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');

module.exports = {
  name: 'threadCreate',
  async execute(thread, client) {
    try {
      await auditLogger.logThreadCreated(client, thread);
    } catch (error) {
      logger.error('Error logging thread create event:', error);
    }
  }
};