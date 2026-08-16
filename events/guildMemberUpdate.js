const auditLogger = require('../utils/auditLogger');
const logger = require('../utils/logger');
const userActivityTracker = require('../services/spam/UserActivityTracker');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    try {
      // --- Existing audit logging ---
      await auditLogger.logMemberUpdate(client, oldMember, newMember);

      // --- NEW compromise-signal tracking ---

      const guildId = newMember.guild.id;
      const userId = newMember.id;

      // Avatar change
      if (oldMember.avatar !== newMember.avatar) {
        userActivityTracker.recordAvatarChange(guildId, userId);
      }

      // Username change
      if (oldMember.user.username !== newMember.user.username) {
        userActivityTracker.recordUsernameChange(guildId, userId);
      }

      // Role changes (optional compromise signal)
      if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        userActivityTracker.recordDeviceChange(guildId, userId);
      }

    } catch (error) {
      logger.error('Error logging member update event:', error);
    }
  }
};
