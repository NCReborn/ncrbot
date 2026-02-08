const auditLogger = require('../utils/auditLogger');
const forumManager = require('../services/ForumManager');
const logger = require('../utils/logger');
const CONSTANTS = require('../config/constants');

module.exports = {
  name: 'threadUpdate',
  async execute(oldThread, newThread, client) {
    try {
      // 1. Audit logging for all thread updates
      await auditLogger.logThreadUpdated(client, oldThread, newThread);
    } catch (error) {
      logger.error('[THREAD_UPDATE] Error logging to audit log:', error);
    }

    try {
      // 2. Forum management - only for bugs-and-issues forum
      // Only handle threads in the bugs and issues forum
      if (!newThread.parent || newThread.parent.id !== CONSTANTS.FORUM.BUGS_AND_ISSUES_FORUM_ID) {
        return;
      }

      // Don't process the megathread itself
      if (newThread.id === CONSTANTS.FORUM.MEGATHREAD_ID) {
        return;
      }

      // Check if tags have changed
      const oldTags = oldThread.appliedTags || [];
      const newTags = newThread.appliedTags || [];

      // If tags haven't changed, nothing to do
      if (JSON.stringify(oldTags.sort()) === JSON.stringify(newTags.sort())) {
        return;
      }

      logger.info(`[FORUM_THREAD_UPDATE] Tags changed for thread: ${newThread.name} (${newThread.id})`);

      // Check which tracked tags were added or removed
      const tagChanges = forumManager.shouldUpdateMegathread(oldTags, newTags, newThread.parent);

      if (!tagChanges.shouldUpdate) {
        logger.info(`[FORUM_THREAD_UPDATE] No tracked tags changed, skipping megathread update`);
        return;
      }

      // Update megathread for each affected tag
      const tagsToUpdate = [...tagChanges.added, ...tagChanges.removed];
      for (const tagName of tagsToUpdate) {
        logger.info(`[FORUM_THREAD_UPDATE] Updating megathread for tag: ${tagName}`);
        await forumManager.updateMegathread(client, tagName);
      }

    } catch (error) {
      logger.error('[FORUM_THREAD_UPDATE] Error handling forum thread update:', error);
    }
  }
};
