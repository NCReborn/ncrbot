// handlers/imageOnlyHandler.js
const mediaChannelService = require('../services/MediaChannelService');
const logger = require('./logger');

let listenerRegistered = false;

// Helper function for safe member fetch with timeout
async function fetchMemberSafe(guild, userId, timeoutMs = 2000) {
  try {
    let timeoutId;
    let timedOut = false;

    const fetchPromise = guild.members.fetch(userId).catch(() => null);
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeoutMs);
    });

    const result = await Promise.race([fetchPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    
    if (timedOut) {
      logger.warn(`[IMAGE_ONLY] Member fetch timed out for user ${userId} in guild ${guild.id}`);
      return null;
    }

    return result;
  } catch (err) {
    logger.warn(`[IMAGE_ONLY] Member fetch error for user ${userId}: ${err.message}`);
    return null;
  }
}

module.exports = (client) => {
  if (listenerRegistered) return;
  listenerRegistered = true;

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    try {
      const guildId = message.guild.id;
      const channelId = message.channel.id;

      // Fetch the member object for permission checks with timeout
      const member = await fetchMemberSafe(message.guild, message.author.id, 2000);
      if (!member) return;

      // Admins bypass check (Administrator permission)
      const isAdmin = member.permissions.has('Administrator');
      if (isAdmin) return;

      // IMAGE-ONLY CHANNELS
      if (mediaChannelService.isImageOnlyChannel(guildId, channelId)) {
        const hasImage = message.attachments.some(att => att.contentType && att.contentType.startsWith('image/'));
        const hasLink = /(https?:\/\/[^\s]+)/i.test(message.content);

        if (!hasImage && !hasLink) {
          try {
            await message.delete();
            const reply = await message.channel.send({
              content: `${message.author}, your message was removed: this channel is for images or links only.`,
            });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
          } catch (e) {
            logger.error('[IMAGE_ONLY] Failed to delete message:', e);
          }
        }
        return;
      }

      // FILE-ONLY CHANNELS
      if (mediaChannelService.isFileOnlyChannel(guildId, channelId)) {
        const hasFile = message.attachments.size > 0;

        if (!hasFile) {
          try {
            await message.delete();
            const reply = await message.channel.send({
              content: `${message.author}, your message was removed: this channel is for file uploads only.`,
            });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
          } catch (e) {
            logger.error('[FILE_ONLY] Failed to delete message:', e);
          }
        }
        return;
      }
    } catch (err) {
      logger.error('[IMAGE_ONLY_HANDLER] Unhandled error in messageCreate handler:', err);
    }
  });
};
