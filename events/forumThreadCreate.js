const logger = require('../utils/logger');
const forumManager = require('../services/ForumManager');
const CONSTANTS = require('../config/constants');
const { ChannelType } = require('discord.js');

module.exports = {
  name: 'threadCreate',
  async execute(thread, newlyCreated, client) {
    try {
      // Only handle threads in the bugs and issues forum
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
      logger.error('[FORUM_THREAD_CREATE] Error handling thread creation:', error);
    }
  }
};
