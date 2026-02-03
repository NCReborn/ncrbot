const mediaChannelService = require('../services/MediaChannelService');
const logger = require('./logger');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Fetch the member object for permission checks
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    // Admins bypass check (Administrator permission)
    const isAdmin = member.permissions.has('Administrator');
    if (isAdmin) return;

    // IMAGE-ONLY CHANNELS
    if (mediaChannelService.isImageOnlyChannel(message.channel.id)) {
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
    if (mediaChannelService.isFileOnlyChannel(message.channel.id)) {
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
  });
};
