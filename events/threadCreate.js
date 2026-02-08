const logger = require('../utils/logger');
const forumManager = require('../services/ForumManager');
const CONSTANTS = require('../config/constants');
const auditLogger = require('../utils/auditLogger');

module.exports = {
  name: 'threadCreate',
  async execute(thread, newlyCreated, client) {
    try {
      // Log thread creation to audit log (for all threads)
      if (thread.guildId) {
        try {
          await auditLogger.logThreadCreated(client, thread);
        } catch (error) {
          logger.error('[THREAD_CREATE] Error logging to audit log:', error);
        }
      }

      // Only handle forum threads in bugs and issues forum
      if (!thread.parent || thread.parent.id !== CONSTANTS.FORUM.BUGS_AND_ISSUES_FORUM_ID) {
        return;
      }

      // Don't process the megathread itself
      if (thread.id === CONSTANTS.FORUM.MEGATHREAD_ID) {
        return;
      }

      // Only process if this is a newly created thread
      if (!newlyCreated) {
        return;
      }

      logger.info(`[FORUM_THREAD_CREATE] New thread created: ${thread.name} (${thread.id})`);

      // 1. Apply the Investigating tag
      await forumManager.applyInvestigatingTag(thread);

      // 2. Send alert to bot-alerts channel
      await forumManager.sendNewThreadAlert(client, thread);

    } catch (error) {
      logger.error('[THREAD_CREATE] Error handling thread creation:', error);
    }
  }
};
