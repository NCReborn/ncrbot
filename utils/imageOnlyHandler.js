const config = require('../config/imageOnlyConfig.json');

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    // Check if the channel is image-only
    if (config.imageOnlyChannels.includes(message.channel.id)) {
      // Accept: any image attachment, any file attachment, or a link in the message content
      const hasImage = message.attachments.some(att => att.contentType && att.contentType.startsWith('image/'));
      const hasFile = message.attachments.size > 0;
      const hasLink = /(https?:\/\/[^\s]+)/i.test(message.content);

      if (!hasImage && !hasFile && !hasLink) {
        try {
          await message.delete();
          const reply = await message.channel.send({
            content: `${message.author}, your message was removed: this channel is for images, files, or links only.`,
          });
          setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (e) {
          console.error('Failed to delete message:', e);
        }
      }
    }
  });
};
