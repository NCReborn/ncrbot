// services/modActions.js

const logger = require('../utils/logger');

module.exports = {
  /**
   * Timeout a user
   */
  async timeoutUser(member, durationMs, reason = 'Timeout applied') {
    try {
      await member.timeout(durationMs, reason);
      logger.info(`[MOD ACTION] Timeout applied to ${member.user.tag} for ${durationMs}ms`);
      return true;
    } catch (error) {
      logger.error(`[MOD ACTION ERROR] Failed to timeout ${member.user.tag}:`, error);
      return false;
    }
  },

  /**
   * Remove timeout from a user
   */
  async removeTimeout(member, reason = 'Timeout removed') {
    try {
      await member.timeout(null, reason);
      logger.info(`[MOD ACTION] Timeout removed for ${member.user.tag}`);
      return true;
    } catch (error) {
      logger.error(`[MOD ACTION ERROR] Failed to remove timeout for ${member.user.tag}:`, error);
      return false;
    }
  },

  /**
   * Ban a user
   */
  async banUser(guild, userId, reason = 'Banned by moderator') {
    try {
      await guild.members.ban(userId, { reason });
      logger.info(`[MOD ACTION] User ${userId} banned`);
      return true;
    } catch (error) {
      logger.error(`[MOD ACTION ERROR] Failed to ban user ${userId}:`, error);
      return false;
    }
  },

  /**
   * Unban a user
   */
  async unbanUser(guild, userId, reason = 'Unbanned by moderator') {
    try {
      await guild.members.unban(userId, reason);
      logger.info(`[MOD ACTION] User ${userId} unbanned`);
      return true;
    } catch (error) {
      logger.error(`[MOD ACTION ERROR] Failed to unban user ${userId}:`, error);
      return false;
    }
  },

  /**
   * Delete recent messages from a user (anti-spam cleanup)
   */
  async deleteRecentMessages(channel, userId, limit = 50) {
    try {
      const messages = await channel.messages.fetch({ limit });

      const userMessages = messages.filter(msg => msg.author.id === userId);

      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
      }

      logger.info(`[MOD ACTION] Deleted ${userMessages.size} messages from ${userId}`);
      return userMessages.size;

    } catch (error) {
      logger.error(`[MOD ACTION ERROR] Failed to delete messages for ${userId}:`, error);
      return 0;
    }
  },

  /**
   * Kick a user (optional)
   */
  async kickUser(member, reason = 'Kicked by moderator') {
    try {
      await member.kick(reason);
      logger.info(`[MOD ACTION] User ${member.user.tag} kicked`);
      return true;
    } catch (error) {
      logger.error(`[MOD ACTION ERROR] Failed to kick ${member.user.tag}:`, error);
      return false;
    }
  }
};
